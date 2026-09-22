import { Router, Response } from "express";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { CreateTournamentSchema, UpdateTournamentSchema, AddPlayersSchema, ChatMessageSchema, SeedingSchema, QuickGameSchema } from "../shared/schemas";
import { computeStandings } from "../shared/standings";
import { checkCanEnd } from "../shared/scoring";
import { generateRoundPairings } from "../shared/scheduler";
import { playerSelect, clubSelect, matchInclude, feedInclude, FEED_PLAYERS, standingsInclude, inCity, queryString } from "../shared/queries";
import { hasOpenDemoSeat } from "../shared/demo";
import AuditLog from "../models/AuditLog";

export const tournamentRouter = Router();

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
      prisma.user.findUnique({ where: { id: me }, select: { firstName: true } }),
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
    res.status(201).json(game);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Event feed. Every filter is optional; with none of them this is the plain
// "all tournaments" list the dashboard used to show.
tournamentRouter.get("/", async (req, res: Response) => {
  const { kind, city, clubId, status, from, to, q } = req.query as Record<string, string | undefined>;
  const tournaments = await prisma.tournament.findMany({
    where: {
      // Events marked private are visible on their own page and under /mine,
      // never in this feed.
      isPublic: true,
      ...(kind ? { kind } : {}),
      ...(clubId ? { clubId } : {}),
      ...(city ? inCity(city) : {}),
      ...(status ? { status: { in: status.split(",") } } : {}),
      ...(from || to ? { startTime: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    include: feedInclude,
    orderBy: [{ startTime: "asc" }, { createdAt: "desc" }],
  });
  res.json(tournaments);
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

tournamentRouter.get("/:id", async (req, res: Response) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: {
      organizer: { select: { id: true, firstName: true, lastName: true } },
      club: { select: clubSelect },
      players: { include: { user: { select: playerSelect } }, orderBy: { seed: "asc" } },
      byes: { include: { user: { select: playerSelect } } },
      matches: { include: matchInclude, orderBy: [{ round: "asc" }, { matchIndex: "asc" }] },
    },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  // Only a demo event can have an open seat; the manager's page reads this to
  // decide whether to offer the invitation link.
  res.json({ ...tournament, demoSeatOpen: await hasOpenDemoSeat(tournament.id) });
});

tournamentRouter.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    const data = UpdateTournamentSchema.parse(req.body);
    const updated = await prisma.tournament.update({ where: { id: tournament.id }, data });
    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_UPDATE", entity: "Tournament", entityId: tournament.id, newValue: data });
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
tournamentRouter.delete("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
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

    if (previous) {
      // Withdrawn (or rejected) earlier — turn the existing row back into a request.
      const entry = await prisma.tournamentUser.update({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: req.user!.userId } },
        data: { status: "PENDING" },
      });
      res.status(201).json(entry);
      return;
    }
    const entry = await prisma.tournamentUser.create({
      data: { tournamentId: req.params.id, userId: req.user!.userId, status: "PENDING" },
    });
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
    if (tournament.maxPlayers != null) {
      const taken = await prisma.tournamentUser.count({ where: { tournamentId: tournament.id, status: "REGISTERED" } });
      if (taken >= tournament.maxPlayers) { res.status(400).json({ error: "This tournament is full" }); return; }
    }
    const updated = await prisma.tournamentUser.update({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } },
      data: { status: "REGISTERED" },
    });
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
    const played = await prisma.match.count({
      where: { tournamentId: tournament.id, OR: [{ player1Id: req.params.userId }, { player2Id: req.params.userId }] },
    });
    if (played > 0) {
      await prisma.tournamentUser.update({
        where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } },
        data: { status: "WITHDRAWN" },
      });
      res.json({ ok: true, withdrawn: true });
      return;
    }
    await prisma.tournamentUser.delete({ where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } } });
    res.json({ ok: true, withdrawn: false });
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

    const [players, allMatches] = await Promise.all([
      prisma.tournamentUser.findMany({ where: { tournamentId: tournament.id, status: "REGISTERED" }, select: { userId: true, seed: true, user: { select: { id: true, rating: true } } } }),
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
    await prisma.$transaction([
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

tournamentRouter.get("/:id/chat", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const tournament = await assertCanUseChat(res, req.params.id, req.user!.userId);
  if (!tournament) return;
  const messages = await prisma.chatMessage.findMany({
    where: { tournamentId: req.params.id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
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
    res.json(computeStandings(tournament.players, tournament.matches));
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});
