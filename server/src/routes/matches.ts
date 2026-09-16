import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { MatchSettingsSchema, ScorePointSchema } from "../shared/schemas.js";
import { isDeuce, getMatchWinner, nextServerSide } from "../shared/scoring.js";
import AuditLog from "../models/AuditLog.js";

export const matchRouter = Router();

const playerSelect = { id: true, firstName: true, lastName: true, club: true, rating: true };
const matchInclude = {
  player1: { select: playerSelect },
  player2: { select: playerSelect },
  judge: { select: { id: true, firstName: true, lastName: true } },
};

matchRouter.get("/tournament/:tournamentId", async (req, res: Response) => {
  const matches = await prisma.match.findMany({
    where: { tournamentId: req.params.tournamentId },
    include: matchInclude,
    orderBy: [{ matchIndex: "asc" }],
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
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) { res.status(404).json({ error: "Not found" }); return; }
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
    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: { status: "IN_PROGRESS", startedAt: new Date(), judgeId: req.user!.userId },
      include: matchInclude,
    });
    res.json(match);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/score", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { side } = ScorePointSchema.parse(req.body);
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) { res.status(404).json({ error: "Not found" }); return; }
    if (match.status !== "IN_PROGRESS") { res.status(400).json({ error: "Match is not in progress" }); return; }

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
    }

    res.json({ match: updated, deuce, winner });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/undo", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) { res.status(404).json({ error: "Not found" }); return; }
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
    const match = await prisma.match.update({ where: { id: req.params.id }, data: { letCount: { increment: 1 } }, include: matchInclude });
    res.json({ match });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/end", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const match = await prisma.match.update({ where: { id: req.params.id }, data: { status: "COMPLETED", endedAt: new Date() }, include: matchInclude });
    await AuditLog.create({ userId: req.user!.userId, action: "MATCH_END", entity: "Match", entityId: match.id });
    res.json(match);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
