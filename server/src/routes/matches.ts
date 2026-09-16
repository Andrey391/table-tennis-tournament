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
  tournament: { select: { organizerId: true } },
};

// Loads the match and confirms the caller manages its tournament.
// Sends the appropriate error response and returns null when the caller can't proceed.
async function loadOwnedMatch(res: Response, matchId: string, userId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { tournament: { select: { organizerId: true } } } });
  if (!match) { res.status(404).json({ error: "Not found" }); return null; }
  if (match.tournament.organizerId !== userId) { res.status(403).json({ error: "Only the tournament manager can record this match" }); return null; }
  return match;
}

// A tournament with no unresolved matches left is done — but the manager can always
// start another round later, which flips it back to ACTIVE (see tournaments.ts /pair).
async function maybeCompleteTournament(tournamentId: string) {
  const unresolved = await prisma.match.count({ where: { tournamentId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } });
  if (unresolved === 0) {
    await prisma.tournament.updateMany({ where: { id: tournamentId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
  }
}

// Updates both players' global rating using the match result (Elo). Called whenever
// a match resolves to COMPLETED with a clear winner.
async function applyEloUpdate(winnerId: string | null, loserId: string | null) {
  if (!winnerId || !loserId) return;
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
    const updated = await prisma.match.update({ where: { id: match.id }, data, include: matchInclude });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/start", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    const updated = await prisma.match.update({
      where: { id: match.id },
      data: { status: "IN_PROGRESS", startedAt: new Date(), judgeId: req.user!.userId },
      include: matchInclude,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/score", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    if (match.status !== "IN_PROGRESS") { res.status(400).json({ error: "Match is not in progress" }); return; }

    const { side } = ScorePointSchema.parse(req.body);
    const score1 = side === 1 ? match.score1 + 1 : match.score1;
    const score2 = side === 2 ? match.score2 + 1 : match.score2;
    const deuce = isDeuce(score1, score2, match.pointsToWin);
    const server = nextServerSide(score1 + score2, match.serverSide, deuce);
    const winner = getMatchWinner(score1, score2, match.pointsToWin);

    const updated = await prisma.match.update({
      where: { id: match.id },
      data: {
        score1, score2, serverSide: server, lastScorer: side, prevServerSide: match.serverSide,
        status: winner ? "COMPLETED" : "IN_PROGRESS",
        endedAt: winner ? new Date() : undefined,
      },
      include: matchInclude,
    });

    if (winner) {
      await AuditLog.create({ userId: req.user!.userId, action: "MATCH_COMPLETE", entity: "Match", entityId: match.id, newValue: { score1, score2 } });
      await applyEloUpdate(winner === 1 ? match.player1Id : match.player2Id, winner === 1 ? match.player2Id : match.player1Id);
      await maybeCompleteTournament(match.tournamentId);
    }

    res.json({ match: updated, deuce, winner });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/undo", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    if (!match.lastScorer) { res.status(400).json({ error: "Nothing to undo" }); return; }

    const score1 = match.lastScorer === 1 ? Math.max(match.score1 - 1, 0) : match.score1;
    const score2 = match.lastScorer === 2 ? Math.max(match.score2 - 1, 0) : match.score2;

    const updated = await prisma.match.update({
      where: { id: match.id },
      data: { score1, score2, serverSide: match.prevServerSide || 1, lastScorer: null, prevServerSide: null, status: "IN_PROGRESS", endedAt: null },
      include: matchInclude,
    });
    res.json({ match: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/let", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    const updated = await prisma.match.update({ where: { id: match.id }, data: { letCount: { increment: 1 } }, include: matchInclude });
    res.json({ match: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/end", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user!.userId);
    if (!match) return;
    const updated = await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED", endedAt: new Date() }, include: matchInclude });
    await AuditLog.create({ userId: req.user!.userId, action: "MATCH_END", entity: "Match", entityId: match.id });
    if (match.score1 !== match.score2) {
      await applyEloUpdate(match.score1 > match.score2 ? match.player1Id : match.player2Id, match.score1 > match.score2 ? match.player2Id : match.player1Id);
    }
    await maybeCompleteTournament(match.tournamentId);
    res.json(updated);
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
    const score1 = loserSide === 1 ? 0 : match.pointsToWin;
    const score2 = loserSide === 2 ? 0 : match.pointsToWin;

    const updated = await prisma.match.update({
      where: { id: match.id },
      data: { score1, score2, status: "COMPLETED", startedAt: match.startedAt || new Date(), endedAt: new Date() },
      include: matchInclude,
    });
    await AuditLog.create({ userId: req.user!.userId, action: "MATCH_FORFEIT", entity: "Match", entityId: match.id, newValue: { loserSide } });
    await applyEloUpdate(loserSide === 1 ? match.player2Id : match.player1Id, loserSide === 1 ? match.player1Id : match.player2Id);
    await maybeCompleteTournament(match.tournamentId);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
