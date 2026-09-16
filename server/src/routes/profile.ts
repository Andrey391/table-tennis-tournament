import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";

export const profileRouter = Router();

profileRouter.get("/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const [tournamentsCount, matches] = await Promise.all([
    prisma.tournamentUser.count({ where: { userId, status: "REGISTERED" } }),
    prisma.match.findMany({ where: { OR: [{ player1Id: userId }, { player2Id: userId }], status: "COMPLETED" }, select: { player1Id: true, score1: true, score2: true } }),
  ]);
  let wins = 0;
  for (const m of matches) {
    const isPlayer1 = m.player1Id === userId;
    const won = isPlayer1 ? m.score1 > m.score2 : m.score2 > m.score1;
    if (won) wins++;
  }
  res.json({ tournaments: tournamentsCount, matches: matches.length, wins, losses: matches.length - wins });
});
