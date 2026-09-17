import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { MatchSettingsSchema, ScorePointSchema, ForfeitSchema } from "../shared/schemas.js";
import { isDeuce, getMatchWinner, nextServerSide, computeEloDelta } from "../shared/scoring.js";
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

// The set currently being played: the last one that hasn't finished.
function currentSet<T extends { status: string }>(match: { sets: T[] }): T | null {
  return match.sets.find(s => s.status !== "COMPLETED") ?? null;
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
async function applyEloUpdate(kind: string, winnerId: string | null, loserId: string | null) {
  if (kind !== "TOURNAMENT" || !winnerId || !loserId) return;
  const [winner, loser] = await Promise.all([
    prisma.user.findUnique({ where: { id: winnerId }, select: { rating: true } }),
    prisma.user.findUnique({ where: { id: loserId }, select: { rating: true } }),
  ]);
  if (!winner || !loser) return;
  const { winnerDelta, loserDelta } = computeEloDelta(winner.rating, loser.rating);
  await prisma.$transaction([
    prisma.user.update({ where: { id: winnerId }, data: { rating: winner.rating + winnerDelta } }),
    prisma.user.update({ where: { id: loserId }, data: { rating: Math.max(0, loser.rating + loserDelta) } }),
  ]);
}

// Ends a match and settles the result. There is no fixed number of sets: whoever
// has won more of them takes the match, and an equal tally is a draw that moves
// nobody's rating.
async function finishMatch(match: { id: string; tournamentId: string; player1Id: string | null; player2Id: string | null; setsWon1: number; setsWon2: number; startedAt: Date | null; tournament: { kind: string } | null }) {
  const tournamentKind = match.tournament?.kind ?? "TOURNAMENT";
  await prisma.match.update({
    where: { id: match.id },
    data: { status: "COMPLETED", startedAt: match.startedAt ?? new Date(), endedAt: new Date() },
  });
  // Abandon a set that was still open when the judge ended the match.
  await prisma.matchSet.updateMany({
    where: { matchId: match.id, status: { not: "COMPLETED" } },
    data: { status: "CANCELLED", endedAt: new Date() },
  });
  if (match.setsWon1 !== match.setsWon2) {
    const p1Won = match.setsWon1 > match.setsWon2;
    await applyEloUpdate(tournamentKind, p1Won ? match.player1Id : match.player2Id, p1Won ? match.player2Id : match.player1Id);
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
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    if (match.status !== "NOT_STARTED") { res.status(400).json({ error: "Can only change settings before the match starts" }); return; }
    const data = MatchSettingsSchema.parse(req.body);
    await prisma.match.update({ where: { id: match.id }, data });
    res.json(await reload(match.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Starting a match opens its first set.
matchRouter.post("/:id/start", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    await prisma.$transaction([
      prisma.match.update({
        where: { id: match.id },
        data: { status: "IN_PROGRESS", startedAt: match.startedAt ?? new Date(), judgeId: req.user!.userId },
      }),
      ...(match.sets.length === 0
        ? [prisma.matchSet.create({ data: { matchId: match.id, index: 1, pointsToWin: match.pointsToWin } })]
        : []),
    ]);
    res.json(await reload(match.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Scores a point in the current set. Finishing a set does NOT finish the match —
// the next set opens straight away and the judge decides when to stop.
matchRouter.post("/:id/score", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    if (match.status !== "IN_PROGRESS") { res.status(400).json({ error: "Match is not in progress" }); return; }
    const set = currentSet(match);
    if (!set) { res.status(400).json({ error: "No set in progress" }); return; }

    const { side } = ScorePointSchema.parse(req.body);
    const score1 = side === 1 ? set.score1 + 1 : set.score1;
    const score2 = side === 2 ? set.score2 + 1 : set.score2;
    const deuce = isDeuce(score1, score2, set.pointsToWin);
    const server = nextServerSide(score1 + score2, set.serverSide, deuce);
    const setWinner = getMatchWinner(score1, score2, set.pointsToWin);

    await prisma.matchSet.update({
      where: { id: set.id },
      data: {
        score1, score2, serverSide: server, lastScorer: side, prevServerSide: set.serverSide,
        status: setWinner ? "COMPLETED" : "IN_PROGRESS",
        winner: setWinner,
        endedAt: setWinner ? new Date() : null,
      },
    });

    if (setWinner) {
      await prisma.$transaction([
        prisma.match.update({
          where: { id: match.id },
          data: setWinner === 1 ? { setsWon1: { increment: 1 } } : { setsWon2: { increment: 1 } },
        }),
        prisma.matchSet.create({ data: { matchId: match.id, index: set.index + 1, pointsToWin: match.pointsToWin } }),
      ]);
      await AuditLog.create({ userId: req.user!.userId, action: "SET_COMPLETE", entity: "MatchSet", entityId: set.id, newValue: { score1, score2 } });
    }

    res.json({ match: await reload(match.id), deuce, setWinner });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Reverses exactly one point in the current set. If that set only exists because
// the previous one just ended, step back into the previous set and reopen it.
matchRouter.post("/:id/undo", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;

    const open = currentSet(match);
    const target = open && open.lastScorer != null
      ? open
      : [...match.sets].reverse().find(s => s.status === "COMPLETED" && s.lastScorer != null) ?? null;
    if (!target) { res.status(400).json({ error: "Nothing to undo" }); return; }

    const reopening = target.status === "COMPLETED";
    const ops: any[] = [
      prisma.matchSet.update({
        where: { id: target.id },
        data: {
          score1: target.lastScorer === 1 ? Math.max(target.score1 - 1, 0) : target.score1,
          score2: target.lastScorer === 2 ? Math.max(target.score2 - 1, 0) : target.score2,
          serverSide: target.prevServerSide ?? target.serverSide,
          lastScorer: null, prevServerSide: null,
          status: "IN_PROGRESS", winner: null, endedAt: null,
        },
      }),
    ];
    if (reopening) {
      // Take back the set win it had been credited with, and drop the empty set
      // that was opened after it.
      ops.push(prisma.match.update({
        where: { id: match.id },
        data: target.winner === 1 ? { setsWon1: { decrement: 1 } } : { setsWon2: { decrement: 1 } },
      }));
      if (open && open.id !== target.id && open.score1 === 0 && open.score2 === 0) {
        ops.push(prisma.matchSet.delete({ where: { id: open.id } }));
      }
    }
    await prisma.$transaction(ops);
    res.json({ match: await reload(match.id) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/let", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    const set = currentSet(match);
    if (!set) { res.status(400).json({ error: "No set in progress" }); return; }
    await prisma.matchSet.update({ where: { id: set.id }, data: { letCount: { increment: 1 } } });
    res.json({ match: await reload(match.id) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/end", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
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
    // A walkover is recorded as a single set to the target score, so the sets
    // tally and the per-set stats stay consistent with a played match.
    const nextIndex = match.sets.length ? Math.max(...match.sets.map(s => s.index)) + 1 : 1;
    const open = currentSet(match);
    await prisma.$transaction([
      ...(open ? [prisma.matchSet.delete({ where: { id: open.id } })] : []),
      prisma.matchSet.create({
        data: {
          matchId: match.id,
          index: open ? open.index : nextIndex,
          pointsToWin: match.pointsToWin,
          score1: loserSide === 1 ? 0 : match.pointsToWin,
          score2: loserSide === 2 ? 0 : match.pointsToWin,
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
    if (settled) await finishMatch({ ...settled, tournament: settled.tournament });
    else await maybeCompleteTournament(match.tournamentId);
    await AuditLog.create({ userId: req.user!.userId, action: "MATCH_FORFEIT", entity: "Match", entityId: match.id, newValue: { loserSide } });
    res.json(await reload(match.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
