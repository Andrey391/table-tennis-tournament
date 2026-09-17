import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";

export const profileRouter = Router();

type Played = { player1Id: string | null; score1: number; score2: number; pointsToWin: number };

// Counts wins and splits the same rows by point target, so the profile can show
// "how much do I play short (11) vs long (21) games, and how do I do in each".
function summarise(rows: Played[], userId: string) {
  const byTarget: Record<string, { played: number; wins: number }> = { 11: { played: 0, wins: 0 }, 21: { played: 0, wins: 0 } };
  let wins = 0;
  for (const r of rows) {
    const won = r.player1Id === userId ? r.score1 > r.score2 : r.score2 > r.score1;
    if (won) wins++;
    const bucket = byTarget[String(r.pointsToWin)] ??= { played: 0, wins: 0 };
    bucket.played++;
    if (won) bucket.wins++;
  }
  return { played: rows.length, wins, losses: rows.length - wins, byTarget };
}

profileRouter.get("/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const played = { status: "COMPLETED" as const, OR: [{ player1Id: userId }, { player2Id: userId }] };
  const select = { player1Id: true, score1: true, score2: true, pointsToWin: true };

  const [tournamentsCount, matches, games] = await Promise.all([
    prisma.tournamentUser.count({ where: { userId, status: "REGISTERED" } }),
    prisma.match.findMany({ where: played, select }),
    prisma.game.findMany({ where: played, select }),
  ]);

  const m = summarise(matches, userId);
  const g = summarise(games, userId);

  res.json({
    tournaments: tournamentsCount,
    // Tournament matches — these are the rated ones.
    matches: m.played,
    wins: m.wins,
    losses: m.losses,
    // Casual games, which never move anyone's rating.
    games: g.played,
    gameWins: g.wins,
    gameLosses: g.losses,
    // Short (11) vs long (21) split, kept separate for each kind of play.
    byTarget: { matches: m.byTarget, games: g.byTarget },
  });
});
