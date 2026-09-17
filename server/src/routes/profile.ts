import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";

export const profileRouter = Router();

type PlayedMatch = {
  player1Id: string | null;
  setsWon1: number;
  setsWon2: number;
  tournament: { kind: string };
  sets: { score1: number; score2: number; pointsToWin: number; status: string; winner: number | null }[];
};

const emptyTally = () => ({ played: 0, wins: 0, losses: 0 });
const emptySplit = () => ({ 11: { played: 0, wins: 0 }, 21: { played: 0, wins: 0 } } as Record<string, { played: number; wins: number }>);

// Play has three levels and the profile reports all three:
//   event (tournament or game) -> match -> set ("партия")
// A match is won on sets; a set is the thing actually played to 11 or 21, which
// is why the short/long split lives at set level.
function summarise(matches: PlayedMatch[], userId: string) {
  const matchTally = emptyTally();
  const setTally = emptyTally();
  const byTarget = emptySplit();

  for (const m of matches) {
    const isP1 = m.player1Id === userId;
    const mine = isP1 ? m.setsWon1 : m.setsWon2;
    const theirs = isP1 ? m.setsWon2 : m.setsWon1;

    matchTally.played++;
    if (mine > theirs) matchTally.wins++;
    else if (theirs > mine) matchTally.losses++;

    for (const set of m.sets) {
      if (set.status !== "COMPLETED") continue;
      const won = set.winner === (isP1 ? 1 : 2);
      setTally.played++;
      if (won) setTally.wins++; else setTally.losses++;

      const bucket = (byTarget[String(set.pointsToWin)] ??= { played: 0, wins: 0 });
      bucket.played++;
      if (won) bucket.wins++;
    }
  }

  return { matches: matchTally, sets: setTally, byTarget };
}

profileRouter.get("/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;

  const [events, matches] = await Promise.all([
    prisma.tournamentUser.findMany({
      where: { userId, status: "REGISTERED" },
      select: { tournament: { select: { kind: true } } },
    }),
    prisma.match.findMany({
      where: { status: "COMPLETED", OR: [{ player1Id: userId }, { player2Id: userId }] },
      select: {
        player1Id: true, setsWon1: true, setsWon2: true,
        tournament: { select: { kind: true } },
        sets: { select: { score1: true, score2: true, pointsToWin: true, status: true, winner: true } },
      },
    }),
  ]);

  const split = (kind: string) => summarise(matches.filter(m => m.tournament.kind === kind), userId);
  const tournamentStats = split("TOURNAMENT");
  const gameStats = split("GAME");
  const overall = summarise(matches, userId);

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
