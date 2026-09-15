import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware, roleMiddleware } from "../middleware/auth.js";
import { UpdateScoreSchema } from "../shared/schemas.js";
import AuditLog from "../models/AuditLog.js";

export const matchRouter = Router();

matchRouter.get("/tournament/:tournamentId", async (req, res: Response) => {
  const matches = await prisma.match.findMany({
    where: { tournamentId: req.params.tournamentId },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true },
    orderBy: [{ round: "asc" }, { tableNumber: "asc" }],
  });
  res.json(matches);
});

matchRouter.get("/:id", async (req, res: Response) => {
  const match = await prisma.match.findUnique({
    where: { id: req.params.id },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true, bracket: true, games: true },
  });
  if (!match) { res.status(404).json({ error: "Not found" }); return; }
  res.json(match);
});

matchRouter.post("/", authMiddleware, roleMiddleware("ADMIN", "ORGANIZER", "JUDGE"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tournamentId, player1Id, player2Id, team1Id, team2Id, matchType, format, groupId, tableNumber, round } = req.body;
    const match = await prisma.match.create({
      data: { tournamentId, player1Id, player2Id, team1Id, team2Id, matchType: matchType || "SINGLE", format, groupId, tableNumber, round, judgeId: req.user?.userId },
    });
    await AuditLog.create({ userId: req.user!.userId, action: "MATCH_CREATE", entity: "Match", entityId: match.id, newValue: req.body });
    res.status(201).json(match);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.put("/:id/score", authMiddleware, roleMiddleware("ADMIN", "ORGANIZER", "JUDGE"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = UpdateScoreSchema.parse(req.body);
    const match = await prisma.match.update({
      where: { id: data.matchId },
      data: {
        score1: data.score1,
        score2: data.score2,
        gamesWon1: data.gamesWon1,
        gamesWon2: data.gamesWon2,
        sets1: data.sets1 ?? undefined,
        sets2: data.sets2 ?? undefined,
        status: data.state === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
        startedAt: data.state === "IN_PROGRESS" ? new Date() : undefined,
        endedAt: data.state === "COMPLETED" ? new Date() : undefined,
      },
    });
    await AuditLog.create({
      userId: req.user!.userId,
      action: "SCORE_UPDATE",
      entity: "Match",
      entityId: match.id,
      oldValue: { score1: match.score1, score2: match.score2 },
      newValue: { score1: data.score1, score2: data.score2 },
    });
    res.json(match);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

matchRouter.post("/:id/let", authMiddleware, roleMiddleware("ADMIN", "ORGANIZER", "JUDGE"), async (req: AuthenticatedRequest, res: Response) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) { res.status(404).json({ error: "Not found" }); return; }
  const game = await prisma.game.create({
    data: { matchId: match.id, player1Score: match.score1, player2Score: match.score2, letCount: 1, serverSide: 1, state: "LET" },
  });
  res.json({ success: true, message: "Let recorded", game });
});

matchRouter.post("/:id/end", authMiddleware, roleMiddleware("ADMIN", "ORGANIZER", "JUDGE"), async (req: AuthenticatedRequest, res: Response) => {
  const match = await prisma.match.update({ where: { id: req.params.id }, data: { status: "COMPLETED", endedAt: new Date() } });
  await AuditLog.create({ userId: req.user!.userId, action: "MATCH_END", entity: "Match", entityId: match.id });
  res.json(match);
});

matchRouter.get("/live/:tournamentId", async (req, res: Response) => {
  const matches = await prisma.match.findMany({
    where: { tournamentId: req.params.tournamentId, status: "IN_PROGRESS" },
    include: { player1: true, player2: true, team1: true, team2: true },
    orderBy: { tableNumber: "asc" },
  });
  res.json(matches);
});
