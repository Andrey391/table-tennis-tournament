import { Router, Response } from "express";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { summariseMatches } from "../shared/stats";
import { PLAYED_STATUSES } from "../shared/queries";

export const profileRouter = Router();

// Play has three levels and the profile reports all three:
//   event (tournament or game) -> match -> set ("партия")
profileRouter.get("/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;

  const [events, matches] = await Promise.all([
    prisma.tournamentUser.findMany({
      // An event someone withdrew from was still an event they took part in.
      where: { userId, status: PLAYED_STATUSES },
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

  const split = (kind: string) => summariseMatches(matches.filter(m => m.tournament.kind === kind), userId);
  const tournamentStats = split("TOURNAMENT");
  const gameStats = split("GAME");
  const overall = summariseMatches(matches, userId);

  res.json({
    // Level 1: the events themselves.
    events: {
      tournaments: events.filter(e => e.tournament.kind === "TOURNAMENT").length,
      games: events.filter(e => e.tournament.kind === "GAME").length,
    },
    // Levels 2 and 3, broken down by the kind of event they were played in.
    tournaments: tournamentStats,
    games: gameStats,
    total: overall,
  });
});
