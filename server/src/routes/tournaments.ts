import { Router, Response } from "express";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { CreateTournamentSchema, UpdateTournamentSchema, AddPlayersSchema, ChatMessageSchema, SeedingSchema, QuickGameSchema } from "../shared/schemas";
import { eventStandings } from "../shared/standings";
import { checkCanEnd } from "../shared/scoring";
import { generateRoundPairings } from "../shared/scheduler";
import { isBracket, bracketOf, bracketView } from "../shared/bracket";
import { playerSelect, clubSelect, matchInclude, tournamentDetailInclude, feedInclude, FEED_PLAYERS, standingsInclude, inCity, queryString } from "../shared/queries";
import { hasOpenDemoSeat, resetDemoRound1 } from "../shared/demo";
import { notify, notifyClubFollowers, eventAudience, shortName } from "../shared/notify";
import AuditLog from "../models/AuditLog";

export const tournamentRouter = Router();

// A bracket is drawn once, at round 1, from the players on the roster then: after
// that nobody can join, be added or be let in (they would have no seat), and a
// dropped player keeps their seat as WITHDRAWN so the tree does not shift.
const ROSTER_FIXED = "The bracket is drawn; the roster is fixed";
const rosterFixed = (t: { format: string; status: string }) => isBracket(t.format) && t.status !== "DRAFT";

// Loads the tournament and confirms the caller is the one managing it (its creator).
// Sends the appropriate error response and returns null when the caller can't proceed.
async function loadOwnedTournament(res: Response, tournamentId: string, userId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return null; }
  if (tournament.organizerId !== userId) { res.status(403).json({ error: "Only the tournament manager can do this" }); return null; }
  return tournament;
}

tournamentRouter.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = CreateTournamentSchema.parse(req.body);
    // A tournament's rounds need a venue; without a club there's no table to
    // hold, so this bookingless path only ever creates a plain game. A real
    // tournament goes through POST /bookings, which creates the club booking
    // and the event together.
    if (data.kind === "TOURNAMENT" && !data.clubId) {
      res.status(400).json({ error: "Tournaments need a club — book one instead" });
      return;
    }
    // Same fallback POST /bookings uses for eventTitle: the club's name, or —
    // with no club — a generic label for the kind. A name is just a label, so
    // leaving it blank should never block creating the event.
    const club = data.clubId ? await prisma.club.findUnique({ where: { id: data.clubId } }) : null;
    const name = data.name?.trim() || club?.name || (data.kind === "GAME" ? "Игра" : "Турнир");
    const tournament = await prisma.tournament.create({ data: { ...data, name, organizerId: req.user!.userId } });
    // The organiser takes part in their own event.
    await prisma.tournamentUser.create({ data: { tournamentId: tournament.id, userId: req.user!.userId, status: "REGISTERED" } });
    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_CREATE", entity: "Tournament", entityId: tournament.id, newValue: data });
    await notifyClubFollowers(tournament, req.user!.userId);
    res.status(201).json(tournament);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Records a friendly game that has already been played, in one step: the caller
// and an opponent, the set tally, done. Two friends at a table do not want to
// create an event, start it, open the match and tap every set in — they want to
// write down "3:1" and leave. It is the same GAME container as any other (so it
// shows in both players' history and stats), created already COMPLETED, private
// to the feed, and unrated like every GAME.
tournamentRouter.post("/quick-game", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = QuickGameSchema.parse(req.body);
    const me = req.user!.userId;
    if (data.opponentId === me) { res.status(400).json({ error: "Pick an opponent other than yourself" }); return; }
    const endError = checkCanEnd(data.setsWon1, data.setsWon2);
    if (endError) { res.status(400).json({ error: endError }); return; }
    const [self, opponent] = await Promise.all([
      prisma.user.findUnique({ where: { id: me }, select: { firstName: true, lastName: true } }),
      prisma.user.findUnique({ where: { id: data.opponentId }, select: { firstName: true } }),
    ]);
    if (!self || !opponent) { res.status(404).json({ error: "Player not found" }); return; }
    const now = new Date();
    // Sets in the order they are listed: the winner's sets are not interleaved
    // because nobody recorded the order, only the tally.
    const winners = [...Array(data.setsWon1).fill(1), ...Array(data.setsWon2).fill(2)];
    const game = await prisma.$transaction(async (tx) => {
      const t = await tx.tournament.create({
        data: {
          kind: "GAME", name: data.name || `${self.firstName} - ${opponent.firstName}`, organizerId: me, status: "COMPLETED",
          isPublic: false, tablesCount: 1, setsToWin: Math.max(data.setsWon1, data.setsWon2), startTime: now, endTime: now,
          ...(data.clubId ? { clubId: data.clubId } : {}),
        },
      });
      await tx.tournamentUser.createMany({ data: [
        { tournamentId: t.id, userId: me, status: "REGISTERED", seed: 1 },
        { tournamentId: t.id, userId: data.opponentId, status: "REGISTERED", seed: 2 },
      ] });
      await tx.match.create({
        data: {
          tournamentId: t.id, round: 1, matchIndex: 0, tableNumber: 1, player1Id: me, player2Id: data.opponentId,
          setsToWin: Math.max(data.setsWon1, data.setsWon2), setsWon1: data.setsWon1, setsWon2: data.setsWon2,
          status: "COMPLETED", startedAt: now, endedAt: now, judgeId: me,
          sets: { create: winners.map((w, i) => ({ index: i + 1, winner: w, status: "COMPLETED" as const, endedAt: now })) },
        },
      });
      return t;
    });
    await AuditLog.create({ userId: me, action: "QUICK_GAME", entity: "Tournament", entityId: game.id, newValue: data });
    // It lands in the opponent's history and stats without them doing anything,
    // so they should hear about it — and see the score from their side.
    await notify([{ userId: data.opponentId, type: "QUICK_GAME", tournamentId: game.id, link: `/tournament/${game.id}`,
      params: { name: shortName(self), score: `${data.setsWon2}:${data.setsWon1}` } }], me);
    res.status(201).json(game);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Event feed. Every filter is optional; with none of them this is the plain
// "all tournaments" list the dashboard used to show.
//
// Keyset pagination via `?limit=&cursor=`: `limit` defaults to 30 (max 100).
// The response is always `{ items, nextCursor }` (nextCursor null on the last
// page) rather than a bare array sometimes and an object other times — a shape
// that depends on how many rows happen to match would silently break the first
// time a feed grew past one page. Every consumer reads `.items`.
tournamentRouter.get("/", async (req, res: Response) => {
  const { kind, city, clubId, status, from, to, q, cursor } = req.query as Record<string, string | undefined>;
  const limit = Math.min(Math.max(parseInt(queryString(req.query.limit) ?? "", 10) || 30, 1), 100);
  const where = {
    // Events marked private are visible on their own page and under /mine,
    // never in this feed. Archived (completed and put away by their manager)
    // events are likewise kept out of the general feed, but stay visible on
    // their own page and under /mine.
    isPublic: true,
    archivedAt: null,
    ...(kind ? { kind } : {}),
    ...(clubId ? { clubId } : {}),
    ...(city ? inCity(city) : {}),
    ...(status ? { status: { in: status.split(",") } } : {}),
    ...(from || to ? { startTime: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const tournaments = await prisma.tournament.findMany({
    where,
    include: feedInclude,
    orderBy: [{ startTime: "asc" }, { createdAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = tournaments.length > limit;
  const items = hasMore ? tournaments.slice(0, limit) : tournaments;
  res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
});

// "My tournaments": everything the caller organises or takes part in, with the
// membership row attached so the client can split pending requests from entries.
tournamentRouter.get("/mine", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const kind = queryString(req.query.kind);
  const status = queryString(req.query.status);
  const tournaments = await prisma.tournament.findMany({
    where: { ...(kind ? { kind } : {}), ...(status ? { status: { in: status.split(",") } } : {}), OR: [{ organizerId: userId }, { players: { some: { userId } } }] },
    // The caller's own row (for `myStatus`) plus everyone approved (for the card's
    // faces) in one relation, since a relation can only be filtered one way.
    include: { ...feedInclude, players: { where: { OR: [{ userId }, { status: "REGISTERED" }] }, select: { userId: true, status: true, user: { select: playerSelect } } } },
    orderBy: [{ startTime: "asc" }, { createdAt: "desc" }],
  });
  res.json(tournaments.map(({ players, ...t }) => ({
    ...t,
    myStatus: players.find((p) => p.userId === userId)?.status ?? null,
    isOrganizer: t.organizerId === userId,
    players: players.filter((p) => p.status === "REGISTERED").sort((a, b) => (b.user?.rating ?? 0) - (a.user?.rating ?? 0)).slice(0, FEED_PLAYERS).map(({ userId, user }) => ({ userId, user })),
  })));
});

// Only a demo event can have an open seat (the manager's page reads it to decide
// whether to offer the invitation link), so every other event — every poll of a
// real club night — skips that second query.
async function withDemoSeat<T extends { id: string; organizer: { isDemo: boolean } & Record<string, unknown> }>(tournament: T) {
  const { isDemo, ...organizer } = tournament.organizer;
  return { ...tournament, organizer, demoSeatOpen: isDemo ? await hasOpenDemoSeat(tournament.id) : false };
}

// The drawn bracket of a KNOCKOUT/PLACEMENT event, for the client to draw; null
// for a Swiss event or before round 1.
const bracketFor = (t: Parameters<typeof bracketOf>[0] & { status: string }) => {
  const b = t.status === "DRAFT" ? null : bracketOf(t);
  return b ? bracketView(b) : null;
};

tournamentRouter.get("/:id", async (req, res: Response) => {
  const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: tournamentDetailInclude });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...(await withDemoSeat(tournament)), bracket: bracketFor(tournament) });
});

// Wipes round 1 of the caller's own demo event back to freshly-paired (no sets,
// no rating change) once the guided tour that scored it is done, so the
// tutorial run never counts and the visitor can enter their own club night's
// scores from a clean board. Only ever touches a tournament the caller manages
// whose organizer account is a demo, so a real event can't be reset this way.
tournamentRouter.post("/:id/demo-reset-round1", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await resetDemoRound1(req.params.id, req.user!.userId);
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: tournamentDetailInclude });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    res.json(await withDemoSeat(tournament));
  } catch (err) {
    res.status(400).json({ error: publicError(err) });
  }
});

tournamentRouter.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    const data = UpdateTournamentSchema.parse(req.body);
    // The format decides how round 1 is drawn and everything after it.
    if (data.format && data.format !== tournament.format && tournament.status !== "DRAFT") {
      res.status(400).json({ error: "The format can only be changed before round 1" }); return;
    }
    const updated = await prisma.tournament.update({ where: { id: tournament.id }, data });
    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_UPDATE", entity: "Tournament", entityId: tournament.id, newValue: data });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Puts a finished event away without touching a single row it produced: its
// matches, sets and the rating changes they already applied to its players all
// stay exactly as they are. This exists because a COMPLETED tournament can no
// longer be deleted (see below) — archiving is the only way to get it out of
// the general feed.
tournamentRouter.post("/:id/archive", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (tournament.status !== "COMPLETED") { res.status(400).json({ error: "Only completed tournaments can be archived" }); return; }
    const updated = await prisma.tournament.update({ where: { id: tournament.id }, data: { archivedAt: new Date() } });
    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_ARCHIVE", entity: "Tournament", entityId: tournament.id });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Undoes an archive made by mistake. Same owner guard, no status restriction —
// once it's un-archived it is just a completed tournament again.
tournamentRouter.post("/:id/unarchive", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    const updated = await prisma.tournament.update({ where: { id: tournament.id }, data: { archivedAt: null } });
    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_UNARCHIVE", entity: "Tournament", entityId: tournament.id });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Deletes the event for good. Without this a mistyped tournament (or the event
// that every table booking creates) stayed in the public feed forever, since
// cancelling the booking deliberately leaves its event alone. Nothing here
// cascades on its own, so the rows that point at the tournament are cleared in
// the same transaction: a booking keeps existing and just loses its event.
//
// A COMPLETED tournament can never be deleted this way — it has already moved
// its players' ratings, and deleting it would erase that history with no way
// to tell it happened. Archiving (above) is the only path out of the feed for
// a finished event.
tournamentRouter.delete("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (tournament.status === "COMPLETED") { res.status(400).json({ error: "Completed tournaments cannot be deleted — archive them instead" }); return; }
    const audience = await eventAudience(tournament.id, true);
    await prisma.$transaction([
      prisma.booking.updateMany({ where: { tournamentId: tournament.id }, data: { tournamentId: null } }),
      prisma.chatMessage.deleteMany({ where: { tournamentId: tournament.id } }),
      prisma.roundBye.deleteMany({ where: { tournamentId: tournament.id } }),
      // MatchSet rows cascade with their match.
      prisma.match.deleteMany({ where: { tournamentId: tournament.id } }),
      prisma.tournamentUser.deleteMany({ where: { tournamentId: tournament.id } }),
      prisma.tournament.delete({ where: { id: tournament.id } }),
    ]);
    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_DELETE", entity: "Tournament", entityId: tournament.id, oldValue: { name: tournament.name, kind: tournament.kind } });
    // Everything the inbox said about the event now links to nothing; replace it
    // with the one thing still true about it.
    await prisma.notification.deleteMany({ where: { tournamentId: tournament.id } }).catch(() => {});
    await notify(audience.map((userId) => ({ userId, type: "EVENT_DELETED" as const, tournamentId: tournament.id, params: { event: tournament.name, kind: tournament.kind } })), req.user!.userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Manager directly adds already-known players to the roster, pre-approved.
tournamentRouter.post("/:id/players", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (rosterFixed(tournament)) { res.status(400).json({ error: ROSTER_FIXED }); return; }

    const { userIds } = AddPlayersSchema.parse(req.body);
    const existing = await prisma.tournamentUser.findMany({ where: { tournamentId: req.params.id }, select: { userId: true, status: true } });
    const byId = new Map(existing.map((e) => [e.userId, e.status]));
    // Someone who is already REGISTERED is a no-op; a PENDING request or a player
    // who had withdrawn is promoted back onto the roster rather than duplicated.
    const affected = userIds.filter((id) => byId.get(id) !== "REGISTERED");
    if (tournament.maxPlayers != null) {
      const taken = existing.filter((e) => e.status === "REGISTERED").length;
      if (taken + affected.length > tournament.maxPlayers) {
        res.status(400).json({ error: `Only ${tournament.maxPlayers - taken} of ${tournament.maxPlayers} places left` });
        return;
      }
    }
    const created = await prisma.$transaction(
      affected.map((userId) =>
        prisma.tournamentUser.upsert({
          where: { tournamentId_userId: { tournamentId: req.params.id, userId } },
          create: { tournamentId: req.params.id, userId, status: "REGISTERED" },
          update: { status: "REGISTERED" },
        })
      )
    );
    await notify(affected.map((userId) => ({ userId, type: "ADDED_TO_EVENT" as const, tournamentId: tournament.id, link: `/tournament/${tournament.id}`, params: { event: tournament.name } })), req.user!.userId);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Any signed-in user can request to join (if their rating fits the tournament's
// range) — the manager still has to approve before pairing.
tournamentRouter.post("/:id/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    // A club night runs Swiss-style and nobody is eliminated, so a latecomer can
    // still be let in between rounds: they simply enter the next pairing with no
    // wins yet. Only a cancelled event is closed for good.
    if (tournament.status === "CANCELLED") { res.status(400).json({ error: "This tournament was cancelled" }); return; }
    if (rosterFixed(tournament)) { res.status(400).json({ error: ROSTER_FIXED }); return; }
    const previous = await prisma.tournamentUser.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: req.user!.userId } },
    });
    if (previous && previous.status === "REGISTERED") { res.status(400).json({ error: "You are already taking part" }); return; }

    if (tournament.maxPlayers != null) {
      const taken = await prisma.tournamentUser.count({ where: { tournamentId: tournament.id, status: "REGISTERED" } });
      if (taken >= tournament.maxPlayers) { res.status(400).json({ error: "This tournament is full" }); return; }
    }

    if (tournament.minRating != null || tournament.maxRating != null) {
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { rating: true } });
      const rating = user?.rating ?? 0;
      if ((tournament.minRating != null && rating < tournament.minRating) || (tournament.maxRating != null && rating > tournament.maxRating)) {
        res.status(403).json({ error: `This tournament is for players rated ${tournament.minRating ?? 0}-${tournament.maxRating ?? "∞"}. Your rating: ${rating}` });
        return;
      }
    }

    // Withdrawn (or rejected) earlier — turn the existing row back into a request.
    const entry = previous
      ? await prisma.tournamentUser.update({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: req.user!.userId } },
        data: { status: "PENDING" },
      })
      : await prisma.tournamentUser.create({
        data: { tournamentId: req.params.id, userId: req.user!.userId, status: "PENDING" },
      });
    // The request sits in the roster until the manager acts on it, and they will
    // not open the event page on the off chance someone asked.
    const requester = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { firstName: true, lastName: true } });
    await notify([{ userId: tournament.organizerId, type: "JOIN_REQUEST", tournamentId: tournament.id, link: `/tournament/${tournament.id}`,
      params: { event: tournament.name, name: shortName(requester) } }], req.user!.userId);
    res.status(201).json(entry);
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "Already requested to join" }); return; }
    res.status(400).json({ error: publicError(err) });
  }
});

// Manager approves a pending join request.
tournamentRouter.post("/:id/players/:userId/approve", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (rosterFixed(tournament)) { res.status(400).json({ error: ROSTER_FIXED }); return; }
    if (tournament.maxPlayers != null) {
      const taken = await prisma.tournamentUser.count({ where: { tournamentId: tournament.id, status: "REGISTERED" } });
      if (taken >= tournament.maxPlayers) { res.status(400).json({ error: "This tournament is full" }); return; }
    }
    const updated = await prisma.tournamentUser.update({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } },
      data: { status: "REGISTERED" },
    });
    await notify([{ userId: req.params.userId, type: "JOIN_APPROVED", tournamentId: tournament.id, link: `/tournament/${tournament.id}`, params: { event: tournament.name } }], req.user!.userId);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Manager rejects a pending request or drops a participant. Before any match has
// been played the row is simply deleted; afterwards the player is marked
// WITHDRAWN instead, which keeps the matches they already played in the standings
// while taking them out of every future pairing.
tournamentRouter.delete("/:id/players/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    const row = await prisma.tournamentUser.findUnique({ where: { tournamentId_userId: { tournamentId: tournament.id, userId: req.params.userId } }, select: { status: true } });
    const played = await prisma.match.count({
      where: { tournamentId: tournament.id, OR: [{ player1Id: req.params.userId }, { player2Id: req.params.userId }] },
    });
    // In a drawn bracket a player holds a seat even before playing (a round-1
    // bye), and deleting the row would shift every seat after it.
    const keepSeat = rosterFixed(tournament) && row?.status === "REGISTERED";
    if (played > 0 || keepSeat) {
      await prisma.tournamentUser.update({
        where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } },
        data: { status: "WITHDRAWN" },
      });
    } else {
      await prisma.tournamentUser.delete({ where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } } });
    }
    // A turned-down request and a dropped player read differently.
    if (row && row.status !== "WITHDRAWN") {
      await notify([{ userId: req.params.userId, type: row.status === "PENDING" ? "JOIN_DECLINED" : "REMOVED_FROM_EVENT", tournamentId: tournament.id,
        link: `/tournament/${tournament.id}`, params: { event: tournament.name } }], req.user!.userId);
    }
    res.json({ ok: true, withdrawn: played > 0 || keepSeat });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Manual round-1 seeding. Ratings start at 100 for everyone, so a strong newcomer
// is seeded last and meets the weakest player in round 1; the manager, who knows
// the room, can put the order right before pairing. Only in DRAFT: from round 2 on
// the order is wins.
tournamentRouter.put("/:id/seeding", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "Seeding can only be changed before round 1" }); return; }
    const { userIds } = SeedingSchema.parse(req.body);
    const roster = await prisma.tournamentUser.findMany({ where: { tournamentId: tournament.id, status: "REGISTERED" }, select: { userId: true } });
    const onRoster = new Set(roster.map(r => r.userId));
    if (userIds.some(id => !onRoster.has(id)) || new Set(userIds).size !== userIds.length) {
      res.status(400).json({ error: "Seeding must list approved players, each once" }); return;
    }
    await prisma.$transaction(userIds.map((userId, idx) =>
      prisma.tournamentUser.update({ where: { tournamentId_userId: { tournamentId: tournament.id, userId } }, data: { seed: idx + 1 } })));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// POST /pair for a bracket event (shared/bracket.ts). Round 1 fixes the seeding
// exactly as the Swiss round 1 does (manual seeds first, then rating); every later
// round is whatever the bracket says comes next. A player facing an empty seat
// goes through without a match and is told they sit the round out.
async function pairBracketRound(tournament: { id: string; name: string; format: string; status: string; tablesCount: number; setsToWin: number }, actorId: string, res: Response) {
  if (tournament.status === "DRAFT") {
    const roster = await prisma.tournamentUser.findMany({ where: { tournamentId: tournament.id, status: "REGISTERED" }, select: { userId: true, seed: true, user: { select: { rating: true } } } });
    if (roster.length < 2) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }
    const sorted = [...roster].sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || (b.user?.rating ?? 0) - (a.user?.rating ?? 0));
    await prisma.$transaction(sorted.map((c, idx) =>
      prisma.tournamentUser.update({ where: { tournamentId_userId: { tournamentId: tournament.id, userId: c.userId } }, data: { seed: idx + 1 } })));
  }
  const [players, matches] = await Promise.all([
    prisma.tournamentUser.findMany({ where: { tournamentId: tournament.id }, select: { userId: true, seed: true, status: true, user: { select: { firstName: true, lastName: true } } } }),
    prisma.match.findMany({ where: { tournamentId: tournament.id }, select: { id: true, round: true, matchIndex: true, player1Id: true, player2Id: true, status: true, setsWon1: true, setsWon2: true } }),
  ]);
  const next = bracketOf({ format: tournament.format, players, matches })?.next;
  if (!next) { res.status(400).json({ error: "The bracket is complete" }); return; }

  const tablesCount = tournament.tablesCount || 1;
  const written = await prisma.$transaction([
    ...next.pairs.map((p, idx) => prisma.match.create({
      data: {
        tournamentId: tournament.id, round: next.round, player1Id: p.p1, player2Id: p.p2,
        // The position in the bracket, which is how the tree is rebuilt.
        matchIndex: p.index,
        setsToWin: tournament.setsToWin, tableNumber: (idx % tablesCount) + 1,
      },
    })),
    prisma.tournament.update({ where: { id: tournament.id }, data: { status: "ACTIVE" } }),
  ]);
  await AuditLog.create({ userId: actorId, action: "TOURNAMENT_PAIR", entity: "Tournament", entityId: tournament.id, newValue: { round: next.round, pairs: next.pairs.length, byes: next.byes } });

  const nameOf = new Map(players.map((p) => [p.userId, shortName(p.user)]));
  const created = written.slice(0, next.pairs.length) as { id: string; player1Id: string | null; player2Id: string | null; tableNumber: number | null }[];
  await notify([
    ...created.flatMap((m) => [[m.player1Id, m.player2Id], [m.player2Id, m.player1Id]].map(([me, them]) => ({
      userId: me!, type: "ROUND_PAIRED" as const, tournamentId: tournament.id, link: `/tournament/${tournament.id}/match/${m.id}`,
      params: { event: tournament.name, round: next.round, opponent: nameOf.get(them!) ?? "", table: m.tableNumber },
    }))),
    ...next.byes.map((userId) => ({ userId, type: "ROUND_BYE" as const, tournamentId: tournament.id, link: `/tournament/${tournament.id}`, params: { event: tournament.name, round: next.round } })),
  ], actorId);
  res.json({ message: "Paired", round: next.round, matches: next.pairs.length, byes: next.byes });
}

// Generates a new round of pairs: round 1 (DRAFT -> ACTIVE) seeds by rating; every
// later round is Swiss-style, ranked by wins so far. Nobody is eliminated between
// rounds. Can be called again after a tournament auto-completed to keep playing.
tournamentRouter.post("/:id/pair", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (tournament.status === "DRAFT") {
      const rosterCount = await prisma.tournamentUser.count({ where: { tournamentId: tournament.id, status: "REGISTERED" } });
      if (rosterCount < 2) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }
    } else {
      const unresolved = await prisma.match.count({ where: { tournamentId: tournament.id, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } });
      if (unresolved > 0) { res.status(400).json({ error: "Finish every match in the current round before starting a new one" }); return; }
    }
    if (isBracket(tournament.format)) { await pairBracketRound(tournament, req.user!.userId, res); return; }

    const [players, allMatches] = await Promise.all([
      prisma.tournamentUser.findMany({ where: { tournamentId: tournament.id, status: "REGISTERED" }, select: { userId: true, seed: true, user: { select: { id: true, rating: true, firstName: true, lastName: true } } } }),
      prisma.match.findMany({ where: { tournamentId: tournament.id }, select: { round: true, player1Id: true, player2Id: true, setsWon1: true, setsWon2: true } }),
    ]);
    if (players.length < 2) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }

    const isFirstRound = allMatches.length === 0;
    const currentRound = allMatches.reduce((max, m) => Math.max(max, m.round), 0);
    const newRound = currentRound + 1;

    const matchesPerPlayer = new Map<string, number>();
    const winsPerPlayer = new Map<string, number>();
    const playedPairs = new Set<string>();
    for (const m of allMatches) {
      if (!m.player1Id || !m.player2Id) continue;
      matchesPerPlayer.set(m.player1Id, (matchesPerPlayer.get(m.player1Id) || 0) + 1);
      matchesPerPlayer.set(m.player2Id, (matchesPerPlayer.get(m.player2Id) || 0) + 1);
      playedPairs.add([m.player1Id, m.player2Id].sort().join("|"));
      if (m.setsWon1 > m.setsWon2) winsPerPlayer.set(m.player1Id, (winsPerPlayer.get(m.player1Id) || 0) + 1);
      else if (m.setsWon2 > m.setsWon1) winsPerPlayer.set(m.player2Id, (winsPerPlayer.get(m.player2Id) || 0) + 1);
    }

    const candidates = players.map((p) => ({
      userId: p.userId,
      rating: p.user?.rating || 0,
      wins: winsPerPlayer.get(p.userId) || 0,
      matchesPlayed: matchesPerPlayer.get(p.userId) || 0,
      seed: p.seed,
    }));

    if (isFirstRound) {
      // Manual seeds first (see /seeding), everyone else by rating; then renumber.
      const sorted = [...candidates].sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || b.rating - a.rating);
      await prisma.$transaction(
        sorted.map((c, idx) => prisma.tournamentUser.update({ where: { tournamentId_userId: { tournamentId: tournament.id, userId: c.userId } }, data: { seed: idx + 1 } }))
      );
    }

    const { pairs, byeUserId } = generateRoundPairings(candidates, isFirstRound, playedPairs);
    if (pairs.length === 0) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }

    const tablesCount = tournament.tablesCount || 1;
    const written = await prisma.$transaction([
      ...pairs.map((p, idx) =>
        prisma.match.create({
          data: {
            tournamentId: tournament.id,
            round: newRound,
            player1Id: p.player1Id,
            player2Id: p.player2Id,
            matchIndex: idx,
            setsToWin: tournament.setsToWin,
            tableNumber: (idx % tablesCount) + 1,
          },
        })
      ),
      prisma.tournament.update({ where: { id: tournament.id }, data: { status: "ACTIVE" } }),
      // Who sat this one out, so the round can say so instead of the client
      // inferring it from "has no match here".
      ...(byeUserId ? [prisma.roundBye.upsert({
        where: { tournamentId_round: { tournamentId: tournament.id, round: newRound } },
        create: { tournamentId: tournament.id, round: newRound, userId: byeUserId },
        update: { userId: byeUserId },
      })] : []),
    ]);

    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_PAIR", entity: "Tournament", entityId: tournament.id, newValue: { round: newRound, pairs: pairs.length, bye: byeUserId } });

    // Tell everyone who they play and where: at a club night the players are
    // spread around the room, not watching the manager's screen.
    const nameOf = new Map(players.map((p) => [p.userId, shortName(p.user)]));
    const created = written.slice(0, pairs.length) as { id: string; player1Id: string | null; player2Id: string | null; tableNumber: number | null }[];
    await notify([
      ...created.flatMap((m) => [[m.player1Id, m.player2Id], [m.player2Id, m.player1Id]].map(([me, them]) => ({
        userId: me!, type: "ROUND_PAIRED" as const, tournamentId: tournament.id, link: `/tournament/${tournament.id}/match/${m.id}`,
        params: { event: tournament.name, round: newRound, opponent: nameOf.get(them!) ?? "", table: m.tableNumber },
      }))),
      ...(byeUserId ? [{ userId: byeUserId, type: "ROUND_BYE" as const, tournamentId: tournament.id, link: `/tournament/${tournament.id}`, params: { event: tournament.name, round: newRound } }] : []),
    ], req.user!.userId);
    res.json({ message: "Paired", round: newRound, matches: pairs.length, bye: byeUserId });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Basic per-tournament message board (polled by the client, not real-time). Only the
// manager and approved participants can read or post.
async function assertCanUseChat(res: Response, tournamentId: string, userId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return null; }
  if (tournament.organizerId === userId) return tournament;
  const membership = await prisma.tournamentUser.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } });
  if (!membership || membership.status !== "REGISTERED") { res.status(403).json({ error: "Only participants can use this tournament's chat" }); return null; }
  return tournament;
}

const CHAT_PAGE = 100;

tournamentRouter.get("/:id/chat", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const tournament = await assertCanUseChat(res, req.params.id, req.user!.userId);
  if (!tournament) return;
  // The page polls every few seconds; `?after=<createdAt of the last message it
  // has>` answers with only that moment onwards (gte, so two messages written in
  // the same millisecond are not lost; the client drops the repeat by id), and
  // the first load gets the latest
  // CHAT_PAGE messages rather than the whole history.
  const afterRaw = queryString(req.query.after);
  const after = afterRaw ? new Date(afterRaw) : null;
  const include = { user: { select: { id: true, firstName: true, lastName: true } } };
  if (after && !isNaN(after.getTime())) {
    res.json(await prisma.chatMessage.findMany({
      where: { tournamentId: req.params.id, createdAt: { gte: after } }, include, orderBy: { createdAt: "asc" }, take: CHAT_PAGE,
    }));
    return;
  }
  const latest = await prisma.chatMessage.findMany({
    where: { tournamentId: req.params.id }, include, orderBy: { createdAt: "desc" }, take: CHAT_PAGE,
  });
  res.json(latest.reverse());
});

tournamentRouter.post("/:id/chat", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await assertCanUseChat(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    const { text } = ChatMessageSchema.parse(req.body);
    const message = await prisma.chatMessage.create({
      data: { tournamentId: req.params.id, userId: req.user!.userId, text },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    // One unread chat notification per event is enough: a busy chat would
    // otherwise bury everything else in the inbox. Whoever already has one
    // waiting is skipped until they read it.
    const audience = await eventAudience(tournament.id);
    const waiting = await prisma.notification.findMany({
      where: { tournamentId: tournament.id, type: "CHAT_MESSAGE", readAt: null, userId: { in: audience } }, select: { userId: true },
    });
    const skip = new Set(waiting.map((w) => w.userId));
    await notify(audience.filter((userId) => !skip.has(userId)).map((userId) => ({
      userId, type: "CHAT_MESSAGE" as const, tournamentId: tournament.id, link: `/tournament/${tournament.id}/chat`,
      params: { event: tournament.name, name: shortName(message.user), text: text.length > 80 ? `${text.slice(0, 80)}...` : text },
    })), req.user!.userId);
    res.status(201).json(message);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

tournamentRouter.get("/:id/standings", async (req, res: Response) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: standingsInclude,
    });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    // Buchholz stays the default (unchanged sort/values for any existing caller);
    // ?tiebreak=sonnebornberger switches the secondary sort key without touching
    // the primary "wins" or the tertiary "set difference" ranking.
    const tiebreak = queryString(req.query.tiebreak) === "sonnebornberger" ? "sonnebornberger" : "buchholz";
    res.json(eventStandings(tournament, tiebreak));
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});
