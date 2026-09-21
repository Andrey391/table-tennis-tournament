import { Router, Response } from "express";
import { prisma } from "../config/db";
import { publicError } from "../shared/errors";
import { matchInclude, clubSelect, standingsInclude } from "../shared/queries";
import { computeStandings } from "../shared/standings";

// Unauthenticated read-only views: the courtside live board and the shareable
// tournament page. Mounted at /api/live and /api/public.
export const liveRouter = Router();
export const publicRouter = Router();

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
    select: { id: true, kind: true, name: true, status: true, tablesCount: true, startTime: true, endTime: true, club: { select: clubSelect } },
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

// The public board ranks on wins, then set difference. computeStandings also ranks by
// Buchholz between the two (the event page's table does), so its result is re-sorted
// to keep this board's order; the sort is stable, so Buchholz only settles exact ties.
publicRouter.get("/tournament/:id/standings", async (req, res: Response) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: standingsInclude });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    res.json(computeStandings(tournament.players, tournament.matches).sort((a, b) =>
      b.wins - a.wins || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)));
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});
