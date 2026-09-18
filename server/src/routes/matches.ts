import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { MatchSettingsSchema, SetResultSchema, ForfeitSchema } from "../shared/schemas.js";
import { computeEloDelta, checkSetScore, checkCanEnd } from "../shared/scoring.js";
import AuditLog from "../models/AuditLog.js";

export const matchRouter = Router();

const playerSelect = { id: true, firstName: true, lastName: true, club: true, rating: true };
const matchInclude = {
  player1: { select: playerSelect },
  player2: { select: playerSelect },
  judge: { select: { id: true, firstName: true, lastName: true } },
  tournament: { select: { organizerId: true, kind: true } },
  sets: { orderBy: { index: "asc" as const } },
};

// Loads the match and confirms the caller manages its tournament.
// Sends the appropriate error response and returns null when the caller can't proceed.
async function loadOwnedMatch(res: Response, matchId: string, userId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { tournament: { select: { organizerId: true, kind: true } }, sets: { orderBy: { index: "asc" } } },
  });
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
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { tournament: { select: { organizerId: true, kind: true } }, sets: { orderBy: { index: "asc" } } },
  });
  if (!match) { res.status(404).json({ error: "Not found" }); return null; }
  const isManager = match.tournament?.organizerId === userId;
  const isPlayer = match.player1Id === userId || match.player2Id === userId;
  if (!isManager && !isPlayer) { res.status(403).json({ error: "Only the players in this match or the tournament manager can record it" }); return null; }
  return { ...match, isManager };
}

const reload = (id: string) => prisma.match.findUnique({ where: { id }, include: matchInclude });

// A tournament with no unresolved matches left is done — but the manager can always
// start another round later, which flips it back to ACTIVE (see tournaments.ts /pair).
async function maybeCompleteTournament(tournamentId: string) {
  const unresolved = await prisma.match.count({ where: { tournamentId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } });
  if (unresolved === 0) {
    await prisma.tournament.updateMany({ where: { id: tournamentId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
  }
}

// Updates both players' global rating using the match result (Elo). Only rated
// containers count: a GAME is deliberately unrated, so it never gets here.
async function applyEloUpdate(kind: string, winnerId: string | null, loserId: string | null): Promise<number | null> {
  if (kind !== "TOURNAMENT" || !winnerId || !loserId) return null;
  const [winner, loser] = await Promise.all([
    prisma.user.findUnique({ where: { id: winnerId }, select: { rating: true } }),
    prisma.user.findUnique({ where: { id: loserId }, select: { rating: true } }),
  ]);
  if (!winner || !loser) return null;
  const { winnerDelta, loserDelta } = computeEloDelta(winner.rating, loser.rating);
  await prisma.$transaction([
    prisma.user.update({ where: { id: winnerId }, data: { rating: winner.rating + winnerDelta } }),
    prisma.user.update({ where: { id: loserId }, data: { rating: Math.max(0, loser.rating + loserDelta) } }),
  ]);
  // Returned (and stored on the match) so undoing the point that settled the match
  // can hand back exactly what was given, rather than recomputing from ratings that
  // have already moved.
  return winnerDelta;
}

// Takes back the rating change a match applied, when the point that ended it is
// undone. The loser's rating was floored at 0 on the way down, so it is floored
// again on the way back rather than trusted to be symmetric.
async function revertEloUpdate(match: { player1Id: string | null; player2Id: string | null; setsWon1: number; setsWon2: number; eloDelta: number | null }) {
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
  await prisma.$transaction([
    prisma.user.update({ where: { id: winnerId }, data: { rating: Math.max(0, winner.rating - match.eloDelta) } }),
    prisma.user.update({ where: { id: loserId }, data: { rating: loser.rating + match.eloDelta } }),
  ]);
}

// Ends a match and settles the result: whoever has won more sets takes it (/end
// refuses an equal tally). `rated` is false for a walkover — a no-show says nothing
// about how well either player plays, so it moves nobody's Elo.
async function finishMatch(match: { id: string; tournamentId: string; player1Id: string | null; player2Id: string | null; setsWon1: number; setsWon2: number; startedAt: Date | null; tournament: { kind: string } | null }, rated = true) {
  const tournamentKind = match.tournament?.kind ?? "TOURNAMENT";
  await prisma.match.update({
    where: { id: match.id },
    data: { status: "COMPLETED", startedAt: match.startedAt ?? new Date(), endedAt: new Date() },
  });
  // Abandon a set that was still open when the match ended.
  await prisma.matchSet.updateMany({
    where: { matchId: match.id, status: { not: "COMPLETED" } },
    data: { status: "CANCELLED", endedAt: new Date() },
  });
  if (rated && match.setsWon1 !== match.setsWon2) {
    const p1Won = match.setsWon1 > match.setsWon2;
    const delta = await applyEloUpdate(tournamentKind, p1Won ? match.player1Id : match.player2Id, p1Won ? match.player2Id : match.player1Id);
    if (delta != null) await prisma.match.update({ where: { id: match.id }, data: { eloDelta: delta } });
  }
  await maybeCompleteTournament(match.tournamentId);
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
    res.status(400).json({ error: err.message });
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
    res.status(400).json({ error: err.message });
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
    await AuditLog.create({ userId: req.user!.userId, action: "SET_COMPLETE", entity: "Match", entityId: match.id, newValue: { winner: side, setsWon1, setsWon2 } });

    res.json({ match: await reload(match.id), setWinner: side });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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
      await revertEloUpdate(match);
      await prisma.match.update({ where: { id: match.id }, data: { status: "IN_PROGRESS", endedAt: null, eloDelta: null } });
      // The event was flipped to COMPLETED by this match; it is live again.
      await prisma.tournament.updateMany({ where: { id: match.tournamentId, status: "COMPLETED" }, data: { status: "ACTIVE" } });
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
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/end", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadScorableMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    if (match.status === "COMPLETED") { res.status(400).json({ error: "Match is already completed" }); return; }
    const endError = checkCanEnd(match.setsWon1, match.setsWon2);
    if (endError) { res.status(400).json({ error: endError }); return; }
    await finishMatch(match);
    await AuditLog.create({ userId: req.user!.userId, action: "MATCH_END", entity: "Match", entityId: match.id, newValue: { setsWon1: match.setsWon1, setsWon2: match.setsWon2 } });
    res.json(await reload(match.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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
      include: { tournament: { select: { kind: true } } },
    });
    if (settled) await finishMatch({ ...settled, tournament: settled.tournament }, false);
    else await maybeCompleteTournament(match.tournamentId);
    await AuditLog.create({ userId: req.user!.userId, action: "MATCH_FORFEIT", entity: "Match", entityId: match.id, newValue: { loserSide } });
    res.json(await reload(match.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
