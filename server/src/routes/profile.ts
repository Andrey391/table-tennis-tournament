import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";

export const profileRouter = Router();

type PlayedMatch = {
  player1Id: string | null;
  setsWon1: number;
  setsWon2: number;
  tournament: { kind: string };
};

const emptyTally = () => ({ played: 0, wins: 0, losses: 0 });

// Play has three levels and the profile reports all three:
//   event (tournament or game) -> match -> set ("партия")
// A set is the unit of scoring, so both tallies come straight off the match's set
// counters. There is no split by target score any more: the rally-by-rally score
// is not recorded, so there is nothing to split by.
function summarise(matches: PlayedMatch[], userId: string) {
  const matchTally = emptyTally();
  const setTally = emptyTally();

  for (const m of matches) {
    const isP1 = m.player1Id === userId;
    const mine = isP1 ? m.setsWon1 : m.setsWon2;
    const theirs = isP1 ? m.setsWon2 : m.setsWon1;

    matchTally.played++;
    if (mine > theirs) matchTally.wins++;
    else if (theirs > mine) matchTally.losses++;

    setTally.played += mine + theirs;
    setTally.wins += mine;
    setTally.losses += theirs;
  }

  return { matches: matchTally, sets: setTally };
}

profileRouter.get("/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;

  const [events, matches] = await Promise.all([
    prisma.tournamentUser.findMany({
      // An event someone withdrew from was still an event they took part in.
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
