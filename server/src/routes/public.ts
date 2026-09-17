import { Router, Response } from "express";
import { prisma } from "../config/db.js";

// Unauthenticated read-only views: the courtside live board and the shareable
// tournament page. Mounted at /api/live and /api/public.
export const liveRouter = Router();
export const publicRouter = Router();

const playerSelect = { id: true, firstName: true, lastName: true, club: true, rating: true };
const matchInclude = { player1: { select: playerSelect }, player2: { select: playerSelect }, sets: { orderBy: { index: "asc" as const } } };

liveRouter.get("/:tournamentId", async (req, res: Response) => {
  const matches = await prisma.match.findMany({
    where: { tournamentId: req.params.tournamentId, status: "IN_PROGRESS" },
    include: matchInclude,
  });
  res.json(matches);
});

publicRouter.get("/tournament/:id", async (req, res: Response) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    select: { id: true, kind: true, name: true, status: true, tablesCount: true, startTime: true, endTime: true, club: { select: { id: true, name: true, city: true, address: true } } },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  const matches = await prisma.match.findMany({
    where: { tournamentId: req.params.id },
    include: matchInclude,
    orderBy: [{ round: "asc" }, { matchIndex: "asc" }],
  });
  const live = matches.filter(m => m.status === "IN_PROGRESS");
  const recent = matches.filter(m => m.status === "COMPLETED").slice(-10).reverse();
  res.json({ tournament, live, recent, totalMatches: matches.length });
});

publicRouter.get("/tournament/:id/standings", async (req, res: Response) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: {
      // A player who left mid-event keeps the matches they already played.
      players: { where: { status: { in: ["REGISTERED", "WITHDRAWN"] } }, include: { user: { select: playerSelect } } },
      matches: { where: { status: "COMPLETED" }, select: { player1Id: true, player2Id: true, setsWon1: true, setsWon2: true, sets: { select: { score1: true, score2: true, status: true } } } },
    },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }

  const stats = new Map<string, { userId: string; firstName: string; lastName: string; club: string | null; rating: number; wins: number; losses: number; setsWon: number; setsLost: number; pointsFor: number; pointsAgainst: number }>();
  for (const p of tournament.players) {
    if (!p.user) continue;
    stats.set(p.userId, { userId: p.userId, firstName: p.user.firstName, lastName: p.user.lastName, club: p.user.club, rating: p.user.rating, wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0 });
  }
  // Matches are won on sets; points aggregate across every set actually played.
  for (const m of tournament.matches) {
    if (!m.player1Id || !m.player2Id) continue;
    const s1 = stats.get(m.player1Id);
    const s2 = stats.get(m.player2Id);
    if (!s1 || !s2) continue;
    for (const set of m.sets) {
      if (set.status !== "COMPLETED") continue;
      s1.pointsFor += set.score1; s1.pointsAgainst += set.score2;
      s2.pointsFor += set.score2; s2.pointsAgainst += set.score1;
    }
    s1.setsWon += m.setsWon1; s1.setsLost += m.setsWon2;
    s2.setsWon += m.setsWon2; s2.setsLost += m.setsWon1;
    if (m.setsWon1 > m.setsWon2) { s1.wins++; s2.losses++; }
    else if (m.setsWon2 > m.setsWon1) { s2.wins++; s1.losses++; }
  }
  res.json(Array.from(stats.values()).sort((a, b) =>
    b.wins - a.wins || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)));
});
