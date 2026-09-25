import { Response } from "express";
import { Router } from "../shared/router";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { MatchSettingsSchema, SetResultSchema, ForfeitSchema } from "../shared/schemas";
import { computeFntrMatchDelta, DEFAULT_RATING_WEIGHT, checkSetScore, checkCanEnd } from "../shared/scoring";
import { playerSelect, matchInclude } from "../shared/queries";
import { notify, eventAudience, shortName, NotificationType } from "../shared/notify";
import AuditLog from "../models/AuditLog";
import { isBracket, bracketOf } from "../shared/bracket";

export const matchRouter = Router();

const findMatchToScore = (matchId: string) => prisma.match.findUnique({
  where: { id: matchId },
  include: { tournament: { select: { organizerId: true, kind: true, ratingWeight: true } }, sets: { orderBy: { index: "asc" } } },
});

// Loads the match and confirms the caller manages its tournament.
// Sends the appropriate error response and returns null when the caller can't proceed.
async function loadOwnedMatch(res: Response, matchId: string, userId: string) {
  const match = await findMatchToScore(matchId);
  if (!match) { res.status(404).json({ error: "Not found" }); return null; }
  if (!match.tournament || match.tournament.organizerId !== userId) { res.status(403).json({ error: "Only the tournament manager can record this match" }); return null; }
  return match;
}

// Loads the match for recording its result: the manager, or either of the two
// players in it. At a club night with six tables the manager cannot stand at every
// one of them, so the players at the table enter their own sets (the way a paper
// score sheet at the table works); the manager keeps the last word — walkovers and
// reopening a settled match stay with them (see loadOwnedMatch).
async function loadScorableMatch(res: Response, matchId: string, userId: string) {
  const match = await findMatchToScore(matchId);
  if (!match) { res.status(404).json({ error: "Not found" }); return null; }
  const isManager = match.tournament?.organizerId === userId;
  const isPlayer = match.player1Id === userId || match.player2Id === userId;
  if (!isManager && !isPlayer) { res.status(403).json({ error: "Only the players in this match or the tournament manager can record it" }); return null; }
  return { ...match, isManager };
}

const reload = (id: string) => prisma.match.findUnique({ where: { id }, include: matchInclude });

// A tournament with no unresolved matches left is done — but the manager can always
// start another round later, which flips it back to ACTIVE (see tournaments.ts /pair).
// A bracket is the exception: it is done when its last round is, not whenever a
// round is, since the rounds after the current one are already decided in advance.
async function maybeCompleteTournament(tournamentId: string, actorId?: string) {
  const unresolved = await prisma.match.count({ where: { tournamentId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } });
  if (unresolved === 0) {
    const shape = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        format: true,
        players: { select: { userId: true, seed: true, status: true } },
        matches: { select: { id: true, round: true, matchIndex: true, player1Id: true, player2Id: true, status: true, setsWon1: true, setsWon2: true } },
      },
    });
    if (shape && isBracket(shape.format) && !bracketOf(shape)?.complete) return;
    const { count } = await prisma.tournament.updateMany({ where: { id: tournamentId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
    // The final table is worth telling the room about for a tournament; a game's
    // players already heard their result from the match itself.
    const t = count ? await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, kind: true } }) : null;
    if (t?.kind === "TOURNAMENT") {
      const audience = await eventAudience(tournamentId);
      await notify(audience.map((userId) => ({ userId, type: "EVENT_COMPLETED" as const, tournamentId, link: `/tournament/${tournamentId}`, params: { event: t.name } })), actorId);
    }
  }
}

// Tells both players how their match was settled, from their own side of the
// table: their score first and their own rating change. The one who pressed
// "end" already knows and is skipped.
async function notifyMatchResult(matchId: string, actorId: string | undefined, walkover: boolean) {
  try {
    const m = await prisma.match.findUnique({
      where: { id: matchId },
      include: { player1: { select: playerSelect }, player2: { select: playerSelect }, tournament: { select: { name: true } } },
    });
    if (!m || !m.player1Id || !m.player2Id || m.setsWon1 === m.setsWon2) return;
    const p1Won = m.setsWon1 > m.setsWon2;
    const forSide = (side: 1 | 2) => {
      const won = (side === 1) === p1Won;
      const type = walkover ? (won ? "WALKOVER_WON" : "WALKOVER_LOST") : (won ? "MATCH_WON" : "MATCH_LOST");
      return {
        userId: side === 1 ? m.player1Id! : m.player2Id!, type: type as NotificationType, tournamentId: m.tournamentId,
        link: `/tournament/${m.tournamentId}/match/${m.id}`,
        params: {
          event: m.tournament?.name ?? "", opponent: shortName(side === 1 ? m.player2 : m.player1),
          score: side === 1 ? `${m.setsWon1}:${m.setsWon2}` : `${m.setsWon2}:${m.setsWon1}`,
          delta: won ? m.eloDelta : m.eloDeltaLoser,
        },
      };
    };
    await notify([forSide(1), forSide(2)], actorId);
  } catch (err: any) {
    console.error("[NOTIFY result]", err?.message);
  }
}

// Updates both players' global rating with the FNTR formula (see computeFntrMatchDelta).
// Only rated containers count: a GAME is deliberately unrated, so it never gets here.
//
// FNTR rates every set of a tournament match against the ratings the players brought
// to it, so the rating that goes into the formula is the player's
// TournamentUser.ratingStart, not their rating right now. It is written the first time
// the player's match in this event is settled: nothing here can have moved their
// rating before then. The change itself is still applied to User.rating straight away,
// so the profile and the rating list are current the moment a match is settled.
//
// Three single-statement writes rather than one `$transaction`: the pooled Postgres
// this runs against drops the connection partway through a multi-statement
// transaction, and this is the last step of settling a match — the one whose
// failure used to leave the screen stuck on a match that was already half-settled.
type RatingChange = { winnerDelta: number; loserDelta: number };
const round2 = (n: number) => Math.round(n * 100) / 100;

// `current` is both players' rating as the caller has just read it (finishMatch
// snapshots them anyway), which saves reading them a second time.
async function applyRatingUpdate(tournament: { id: string; kind: string; ratingWeight: number }, player1Id: string | null, player2Id: string | null, setsWon1: number, setsWon2: number, current?: [{ rating: number } | null, { rating: number } | null]): Promise<RatingChange | null> {
  if (tournament.kind !== "TOURNAMENT" || !player1Id || !player2Id || setsWon1 === setsWon2) return null;
  const [p1, p2, starts] = await Promise.all([
    current ? current[0] : prisma.user.findUnique({ where: { id: player1Id }, select: { rating: true } }),
    current ? current[1] : prisma.user.findUnique({ where: { id: player2Id }, select: { rating: true } }),
    prisma.tournamentUser.findMany({ where: { tournamentId: tournament.id, userId: { in: [player1Id, player2Id] } }, select: { userId: true, ratingStart: true } }),
  ]);
  if (!p1 || !p2) return null;
  // Remember what each side brought to the event, if this is their first match in it.
  const startOf = async (userId: string, current: number) => {
    const known = starts.find(r => r.userId === userId);
    if (known?.ratingStart != null) return known.ratingStart;
    if (known) await prisma.tournamentUser.updateMany({ where: { tournamentId: tournament.id, userId, ratingStart: null }, data: { ratingStart: current } });
    return current;
  };
  const [base1, base2] = await Promise.all([startOf(player1Id, p1.rating), startOf(player2Id, p2.rating)]);
  const { delta1, delta2 } = computeFntrMatchDelta(base1, base2, setsWon1, setsWon2, tournament.ratingWeight);
  const after1 = Math.max(0, round2(p1.rating + delta1));
  const after2 = Math.max(0, round2(p2.rating + delta2));
  // Two independent single-row writes, so they go out together.
  await Promise.all([
    prisma.user.update({ where: { id: player1Id }, data: { rating: after1 } }),
    prisma.user.update({ where: { id: player2Id }, data: { rating: after2 } }),
  ]);
  // Store the change in winner/loser terms (whoever took more sets), as applied —
  // the floor at 0 can make either figure smaller than the formula's, and a player
  // who takes plenty of sets off a much stronger opponent can still net a gain despite
  // losing the match, so "loserDelta" is no longer guaranteed to be <= 0.
  const applied1 = round2(after1 - p1.rating);
  const applied2 = round2(after2 - p2.rating);
  return setsWon1 > setsWon2 ? { winnerDelta: applied1, loserDelta: applied2 } : { winnerDelta: applied2, loserDelta: applied1 };
}

// Takes back the rating change a match applied, when the match is reopened. The
// winner's rating is floored at 0 on the way back rather than trusted to be
// symmetric, in case it has been reset since.
export async function revertRatingUpdate(match: { player1Id: string | null; player2Id: string | null; setsWon1: number; setsWon2: number; eloDelta: number | null; eloDeltaLoser: number | null }) {
  if (match.eloDelta == null || match.setsWon1 === match.setsWon2) return;
  const p1Won = match.setsWon1 > match.setsWon2;
  const winnerId = p1Won ? match.player1Id : match.player2Id;
  const loserId = p1Won ? match.player2Id : match.player1Id;
  if (!winnerId || !loserId) return;
  const [winner, loser] = await Promise.all([
    prisma.user.findUnique({ where: { id: winnerId }, select: { rating: true } }),
    prisma.user.findUnique({ where: { id: loserId }, select: { rating: true } }),
  ]);
  if (!winner || !loser) return;
  await Promise.all([
    prisma.user.update({ where: { id: winnerId }, data: { rating: Math.max(0, round2(winner.rating - match.eloDelta!)) } }),
    prisma.user.update({ where: { id: loserId }, data: { rating: round2(loser.rating - (match.eloDeltaLoser ?? 0)) } }),
  ]);
}

// Ends a match and settles the result: whoever has won more sets takes it (/end
// refuses an equal tally). `rated` is false for a walkover — a no-show says nothing
// about how well either player plays, so it moves nobody's rating.
//
// The order is the point. The rating moves first and the match is marked COMPLETED
// by a single write that also carries `eloDelta`, so a failure can never leave a
// COMPLETED match whose rating change was lost: either the match is settled with
// its points, or it is still open and the judge can press "end" again. (Marking it
// COMPLETED first and moving the rating afterwards did exactly that: the request failed,
// the screen never left the match, and the table showed no points.)
// Only one request may settle a match. Checking "not COMPLETED" and then moving
// the rating is not enough on its own: two "end" taps that arrive together both
// pass the check, and the second one moves the rating again on top of the first.
// So whoever settles a match first claims it with one conditional write, and
// `endedAt` on a match that is not COMPLETED is that claim (nothing else sets it
// before the match is settled). A claim older than a minute belongs to a request
// that died on the way and can be taken over.
const CLAIM_TTL_MS = 60_000;
const MATCH_BUSY = "This match is being settled right now";

async function claimMatch(matchId: string): Promise<boolean> {
  const { count } = await prisma.match.updateMany({
    where: { id: matchId, status: { not: "COMPLETED" }, OR: [{ endedAt: null }, { endedAt: { lt: new Date(Date.now() - CLAIM_TTL_MS) } }] },
    data: { endedAt: new Date() },
  });
  return count === 1;
}

const releaseMatch = (matchId: string) =>
  prisma.match.updateMany({ where: { id: matchId, status: { not: "COMPLETED" } }, data: { endedAt: null } });

// Called with the match claimed (claimMatch).
async function finishMatch(match: { id: string; tournamentId: string; player1Id: string | null; player2Id: string | null; setsWon1: number; setsWon2: number; startedAt: Date | null; tournament: { kind: string; ratingWeight: number } | null }, rated = true, actorId?: string) {
  const tournament = { id: match.tournamentId, kind: match.tournament?.kind ?? "TOURNAMENT", ratingWeight: match.tournament?.ratingWeight ?? DEFAULT_RATING_WEIGHT };
  // Snapshot both ratings before the match moves them: the statistics judge a win by the
  // opponent's rating at the time, not by wherever it has drifted since.
  const [r1, r2] = await Promise.all([match.player1Id, match.player2Id].map(id =>
    id ? prisma.user.findUnique({ where: { id }, select: { rating: true } }) : null));

  let change: RatingChange | null = null;
  if (rated) {
    change = await applyRatingUpdate(tournament, match.player1Id, match.player2Id, match.setsWon1, match.setsWon2, [r1, r2]);
  }
  try {
    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: "COMPLETED", startedAt: match.startedAt ?? new Date(), endedAt: new Date(),
        rating1Before: r1?.rating ?? null, rating2Before: r2?.rating ?? null,
        ...(change ? { eloDelta: change.winnerDelta, eloDeltaLoser: change.loserDelta } : {}),
      },
    });
  } catch (err) {
    // The match stayed open, so the rating that just moved has to go back.
    if (change) await revertRatingUpdate({ ...match, eloDelta: change.winnerDelta, eloDeltaLoser: change.loserDelta }).catch((e) => console.error("[RATING revert]", e?.message));
    throw err;
  }

  // From here the match is settled. What is left is housekeeping, and a failure in
  // it must not turn a settled match into an error on the judge's screen.
  // The three are independent, so they run side by side rather than one after
  // another (each is a database round trip or several). They are still awaited:
  // on a serverless host anything left running after the response is frozen.
  const results = await Promise.allSettled([
    // Abandon a set that was still open when the match ended.
    prisma.matchSet.updateMany({
      where: { matchId: match.id, status: { not: "COMPLETED" } },
      data: { status: "CANCELLED", endedAt: new Date() },
    }),
    // Only a walkover is unrated.
    notifyMatchResult(match.id, actorId, !rated),
    maybeCompleteTournament(match.tournamentId, actorId),
  ]);
  for (const r of results) if (r.status === "rejected") console.error("[FINISH]", r.reason?.message);
}

matchRouter.get("/tournament/:tournamentId", async (req, res: Response) => {
  const matches = await prisma.match.findMany({
    where: { tournamentId: req.params.tournamentId },
    include: matchInclude,
    orderBy: [{ round: "asc" }, { matchIndex: "asc" }],
  });
  res.json(matches);
});

matchRouter.get("/live/:tournamentId", async (req, res: Response) => {
  const matches = await prisma.match.findMany({
    where: { tournamentId: req.params.tournamentId, status: "IN_PROGRESS" },
    include: matchInclude,
    orderBy: { tableNumber: "asc" },
  });
  res.json(matches);
});

// The caller's own matches still to be played or finished, across every live event.
// The home screen shows them as "your match" cards: someone opening the app during
// a club night wants who they play and at which table, not the event feed.
matchRouter.get("/mine", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const matches = await prisma.match.findMany({
    where: {
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      tournament: { status: "ACTIVE" },
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    include: { player1: { select: playerSelect }, player2: { select: playerSelect }, tournament: { select: { id: true, name: true, kind: true } } },
    orderBy: [{ status: "desc" }, { round: "asc" }],
  });
  res.json(matches);
});

matchRouter.get("/:id", async (req, res: Response) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.id }, include: matchInclude });
  if (!match) { res.status(404).json({ error: "Not found" }); return; }
  res.json(match);
});

matchRouter.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadScorableMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    if (match.status !== "NOT_STARTED") { res.status(400).json({ error: "Can only change settings before the match starts" }); return; }
    const data = MatchSettingsSchema.parse(req.body);
    // Players may agree how many sets they play; the table and judge are the manager's.
    if (!match.isManager && (data.tableNumber !== undefined || data.judgeId !== undefined)) { res.status(403).json({ error: "Only the tournament manager can do this" }); return; }
    await prisma.match.update({ where: { id: match.id }, data });
    res.json(await reload(match.id));
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Starting a match just opens it. A set is not created up front any more: a set
// only exists once someone has won it, because a set is now recorded as a result
// rather than played out point by point.
matchRouter.post("/:id/start", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadScorableMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    // Starting a finished match would reopen it without handing its rating back;
    // that is what /undo is for.
    if (match.status === "COMPLETED") { res.status(400).json({ error: "Match is already completed" }); return; }
    await prisma.match.update({
      where: { id: match.id },
      data: { status: "IN_PROGRESS", startedAt: match.startedAt ?? new Date(), judgeId: req.user!.userId },
    });
    res.json(await reload(match.id));
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Records one set for a side. The unit of scoring is the set ("партия"), not the
// point: the judge marks who took the set and nothing tracks the rally-by-rally
// score, so there is no deuce, no service rotation and no target score to reach.
// A match runs for as many sets as the pair choose to play and is settled by
// /end — see `setsToWin`, which is only the target the screen prompts at.
matchRouter.post("/:id/score", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadScorableMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    if (match.status !== "IN_PROGRESS") { res.status(400).json({ error: "Match is not in progress" }); return; }

    const { side, score1, score2 } = SetResultSchema.parse(req.body);
    const scoreError = checkSetScore(side, score1, score2);
    if (scoreError) { res.status(400).json({ error: scoreError }); return; }
    const nextIndex = match.sets.length ? Math.max(...match.sets.map(x => x.index)) + 1 : 1;
    const setsWon1 = side === 1 ? match.setsWon1 + 1 : match.setsWon1;
    const setsWon2 = side === 2 ? match.setsWon2 + 1 : match.setsWon2;

    await prisma.$transaction([
      // The set row is the per-set history the match keeps; who took it is the
      // whole content of a set.
      prisma.matchSet.create({
        data: { matchId: match.id, index: nextIndex, status: "COMPLETED", winner: side, endedAt: new Date(), ...(score1 != null ? { score1, score2: score2! } : {}) },
      }),
      prisma.match.update({ where: { id: match.id }, data: { setsWon1, setsWon2 } }),
    ]);
    // The audit row and the fresh board do not depend on each other.
    const [fresh] = await Promise.all([
      reload(match.id),
      AuditLog.create({ userId: req.user!.userId, action: "SET_COMPLETE", entity: "Match", entityId: match.id, newValue: { winner: side, setsWon1, setsWon2 } }),
    ]);
    res.json({ match: fresh, setWinner: side });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Takes back the last recorded set. One step, no history beyond that.
matchRouter.post("/:id/undo", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadScorableMatch(res, req.params.id, req.user!.userId);
    if (!match) return;

    const last = [...match.sets].sort((a, b) => a.index - b.index).pop() ?? null;
    if (!last || !last.winner) { res.status(400).json({ error: "Nothing to undo" }); return; }

    // A settled match can be taken back too: reopen it and hand the rating back,
    // otherwise a match ended by mistake would be unfixable.
    if (match.status === "COMPLETED") {
      // Reopening a settled result is the manager's call, not the players'.
      if (!match.isManager) { res.status(403).json({ error: "Only the tournament manager can reopen a finished match" }); return; }
      // In a bracket the next round was drawn from this result; reopening it would
      // leave a winner playing on who may no longer be the winner.
      const event = await prisma.tournament.findUnique({ where: { id: match.tournamentId }, select: { format: true } });
      if (isBracket(event?.format) && await prisma.match.count({ where: { tournamentId: match.tournamentId, round: { gt: match.round } } })) {
        res.status(400).json({ error: "The next round of the bracket is already drawn from this result" }); return;
      }
      // Reopen first, with a write that only one request can win: two reopen taps
      // at once would otherwise hand the rating back twice.
      const { count } = await prisma.match.updateMany({ where: { id: match.id, status: "COMPLETED" }, data: { status: "IN_PROGRESS", endedAt: null } });
      if (!count) { res.status(409).json({ error: "The match has already been reopened" }); return; }
      try {
        await revertRatingUpdate(match);
      } catch (err) {
        // The rating is still applied, so the match stays settled.
        await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED", endedAt: match.endedAt } }).catch(() => {});
        throw err;
      }
      // The event was flipped to COMPLETED by this match; it is live again.
      const [, , t] = await Promise.all([
        prisma.match.update({ where: { id: match.id }, data: { eloDelta: null, eloDeltaLoser: null } }),
        prisma.tournament.updateMany({ where: { id: match.tournamentId, status: "COMPLETED" }, data: { status: "ACTIVE" } }),
        prisma.tournament.findUnique({ where: { id: match.tournamentId }, select: { name: true } }),
      ]);
      // Both players were told the result, and the rating it moved is going back.
      await notify([match.player1Id, match.player2Id].filter((id): id is string => !!id).map((userId) => ({
        userId, type: "MATCH_REOPENED" as const, tournamentId: match.tournamentId, link: `/tournament/${match.tournamentId}/match/${match.id}`, params: { event: t?.name ?? "" },
      })), req.user!.userId);
    }

    await prisma.$transaction([
      prisma.matchSet.delete({ where: { id: last.id } }),
      prisma.match.update({
        where: { id: match.id },
        data: last.winner === 1 ? { setsWon1: { decrement: 1 } } : { setsWon2: { decrement: 1 } },
      }),
    ]);
    res.json({ match: await reload(match.id) });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

matchRouter.post("/:id/end", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadScorableMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    if (match.status === "COMPLETED") { res.status(400).json({ error: "Match is already completed" }); return; }
    const endError = checkCanEnd(match.setsWon1, match.setsWon2);
    if (endError) { res.status(400).json({ error: endError }); return; }
    if (!(await claimMatch(match.id))) { res.status(409).json({ error: MATCH_BUSY }); return; }
    // Settle the tally as it stands now that nobody else can, not as it was read above.
    let settled;
    try {
      settled = await findMatchToScore(match.id);
      const error = settled ? checkCanEnd(settled.setsWon1, settled.setsWon2) : "Not found";
      if (!settled || error) { await releaseMatch(match.id); res.status(400).json({ error }); return; }
      await finishMatch(settled, true, req.user!.userId);
    } catch (err) {
      await releaseMatch(match.id).catch(() => {});
      throw err;
    }
    const [fresh] = await Promise.all([
      reload(match.id),
      AuditLog.create({ userId: req.user!.userId, action: "MATCH_END", entity: "Match", entityId: match.id, newValue: { setsWon1: settled.setsWon1, setsWon2: settled.setsWon2 } }),
    ]);
    res.json(fresh);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Marks a no-show: the other side wins by walkover. Works from any state up to
// COMPLETED, so a match that never even started doesn't block the round forever.
matchRouter.post("/:id/forfeit", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    if (match.status === "COMPLETED") { res.status(400).json({ error: "Match is already completed" }); return; }

    const { loserSide } = ForfeitSchema.parse(req.body);
    if (!(await claimMatch(match.id))) { res.status(409).json({ error: MATCH_BUSY }); return; }
    try {
      // A walkover is recorded as a single set for whoever turned up, so the sets
      // tally reads the same as a played match.
      const nextIndex = match.sets.length ? Math.max(...match.sets.map(s => s.index)) + 1 : 1;
      await prisma.$transaction([
        prisma.matchSet.create({
          data: {
            matchId: match.id,
            index: nextIndex,
            status: "COMPLETED",
            winner: loserSide === 1 ? 2 : 1,
            endedAt: new Date(),
          },
        }),
        prisma.match.update({
          where: { id: match.id },
          data: loserSide === 1 ? { setsWon2: { increment: 1 } } : { setsWon1: { increment: 1 } },
        }),
      ]);

      const settled = await prisma.match.findUnique({
        where: { id: match.id },
        include: { tournament: { select: { kind: true, ratingWeight: true } } },
      });
      if (settled) await finishMatch({ ...settled, tournament: settled.tournament }, false, req.user!.userId);
      else await maybeCompleteTournament(match.tournamentId, req.user!.userId);
    } catch (err) {
      await releaseMatch(match.id).catch(() => {});
      throw err;
    }
    const [fresh] = await Promise.all([
      reload(match.id),
      AuditLog.create({ userId: req.user!.userId, action: "MATCH_FORFEIT", entity: "Match", entityId: match.id, newValue: { loserSide } }),
    ]);
    res.json(fresh);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});
