import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";

export const profileRouter = Router();

function summarise(matches: { player1Id: string | null; setsWon1: number; setsWon2: number }[], userId: string) {
  const matchTally = { played: 0, wins: 0, losses: 0 };

  for (const m of matches) {
    const isP1 = m.player1Id === userId;
    const mine = isP1 ? m.setsWon1 : m.setsWon2;
    const theirs = isP1 ? m.setsWon2 : m.setsWon1;

    matchTally.played++;
    if (mine > theirs) matchTally.wins++;
    else if (theirs > mine) matchTally.losses++;
  }

  return matchTally;
}

profileRouter.get("/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;

  const [events, matches] = await Promise.all([
    prisma.tournamentUser.findMany({
      where: { userId, status: { in: ["REGISTERED", "WITHDRAWN"] } },
      select: { tournament: { select: { kind: true } } },
    }),
    prisma.match.findMany({
      where: { status: "COMPLETED", OR: [{ player1Id: userId }, { player2Id: userId }] },
      select: {
        player1Id: true, setsWon1: true, setsWon2: true,
        tournament: { select: { kind: true } },
      },
    }),
  ]);

  const byKind = (kind: string) => summarise(matches.filter(m => m.tournament.kind === kind), userId);
  const tournamentStats = byKind("TOURNAMENT");
  const gameStats = byKind("GAME");
  const overall = summarise(matches, userId);

  res.json({
    events: {
      tournaments: events.filter(e => e.tournament.kind === "TOURNAMENT").length,
      games: events.filter(e => e.tournament.kind === "GAME").length,
    },
    tournaments: tournamentStats,
    games: gameStats,
    total: overall,
  });
});
