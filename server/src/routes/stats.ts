import { Router, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/db";
import { publicError } from "../shared/errors";
import { eventStandings } from "../shared/standings";
import { standingsInclude, inCity, PLAYED_STATUSES } from "../shared/queries";
import { notDemo } from "../shared/demo";
import { listed } from "../shared/privacy";
import { computePlayerStats, computeHeadToHead, computeLeaders, periodStart, LeaderMetric } from "../shared/stats";

// Results feed, player statistics, head-to-head and leaderboards. All read-only
// and unauthenticated, like the rest of what a guest can browse: the selects
// carry the public player shape (no email, no phone).
export const statsRouter = Router();

const statPlayer = { select: { id: true, firstName: true, lastName: true, rating: true } } as const;
const statMatchSelect = {
  id: true, tournamentId: true, player1Id: true, player2Id: true, setsWon1: true, setsWon2: true,
  eloDelta: true, eloDeltaLoser: true, rating1Before: true, rating2Before: true, endedAt: true,
  player1: statPlayer, player2: statPlayer,
  tournament: { select: { id: true, name: true, kind: true } },
} satisfies Prisma.MatchSelect;

// Finished and running events, newest first, each with its podium. `userId`
// narrows it to one player's events and then includes their private ones too
// (quick games), which their profile history already shows anyway.
statsRouter.get("/results", async (req, res: Response) => {
  try {
    const { kind, city, clubId, userId, q } = req.query as Record<string, string | undefined>;
    const events = await prisma.tournament.findMany({
      where: {
        status: { in: ["ACTIVE", "COMPLETED"] },
        ...(userId ? { players: { some: { userId, status: PLAYED_STATUSES } } } : { isPublic: true }),
        ...(kind ? { kind } : {}),
        ...(city ? inCity(city) : {}),
        ...(clubId ? { clubId } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      include: {
        ...standingsInclude,
        club: { select: { id: true, name: true, city: true } },
        _count: { select: { matches: { where: { status: "IN_PROGRESS" } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const when = (e: { startTime: Date | null; createdAt: Date }) => (e.startTime ?? e.createdAt).getTime();
    res.json(events.sort((a, b) => when(b) - when(a)).map(e => ({
      id: e.id, name: e.name, kind: e.kind, status: e.status, startTime: e.startTime, createdAt: e.createdAt, club: e.club,
      players: e.players.filter(p => p.status === "REGISTERED").length,
      matchesPlayed: e.matches.length,
      live: e._count.matches,
      podium: e.matches.length ? eventStandings(e).slice(0, 3) : [],
    })));
  } catch (err: any) { res.status(400).json({ error: publicError(err) }); }
});

statsRouter.get("/players/:id/stats", async (req, res: Response) => {
  try {
    const userId = req.params.id;
    // All three at once: the 404 is decided after, which only costs two wasted
    // (indexed) reads for an id that does not exist.
    const [user, matches, finished] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { rating: true } }),
      prisma.match.findMany({ where: { status: "COMPLETED", OR: [{ player1Id: userId }, { player2Id: userId }] }, select: statMatchSelect }),
      // Finished tournaments (games have no placings worth a medal) with at least
      // three players: winning a two-person "tournament" is just winning a match.
      prisma.tournament.findMany({
        where: { kind: "TOURNAMENT", status: "COMPLETED", players: { some: { userId, status: PLAYED_STATUSES } } },
        include: standingsInclude,
      }),
    ]);
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    const placings = finished
      .filter(e => e.players.length >= 3)
      .map(e => { const rows = eventStandings(e); const row = rows.find(r => r.userId === userId); return row ? row.place ?? rows.indexOf(row) + 1 : 0; })
      .filter(p => p > 0);
    res.json(computePlayerStats(userId, user.rating, matches, placings));
  } catch (err: any) { res.status(400).json({ error: publicError(err) }); }
});

statsRouter.get("/players/:id/h2h/:otherId", async (req, res: Response) => {
  try {
    const { id, otherId } = req.params;
    const matches = await prisma.match.findMany({
      where: { status: "COMPLETED", OR: [{ player1Id: id, player2Id: otherId }, { player1Id: otherId, player2Id: id }] },
      select: statMatchSelect,
    });
    res.json(computeHeadToHead(id, matches));
  } catch (err: any) { res.status(400).json({ error: publicError(err) }); }
});

// ?metric=rating|wins|played&period=month|year|all&city=
statsRouter.get("/leaders", async (req, res: Response) => {
  try {
    const { metric = "rating", period = "month", city } = req.query as Record<string, string | undefined>;
    if (!["rating", "wins", "played"].includes(metric)) { res.status(400).json({ error: "Unknown metric" }); return; }
    const since = periodStart(period);
    const matches = await prisma.match.findMany({
      where: {
        status: "COMPLETED",
        // A demo evening is played against accounts that only exist to be played
        // against; it must not put anyone on a leaderboard.
        player1: notDemo,
        player2: notDemo,
        ...(since ? { endedAt: { gte: since } } : {}),
        ...(city ? { tournament: inCity(city) } : {}),
      },
      select: statMatchSelect,
    });
    // A leaderboard is a public list of names, so only players who agreed to a
    // public name are on it. Filtered after counting, not in the match query: a
    // listed player's wins over a hidden one still count.
    const rows = computeLeaders(matches, metric as LeaderMetric, Number.MAX_SAFE_INTEGER);
    const shown = new Set((await prisma.user.findMany({ where: { id: { in: rows.map(r => r.player.id) }, ...listed }, select: { id: true } })).map(u => u.id));
    res.json(rows.filter(r => shown.has(r.player.id)).slice(0, 20));
  } catch (err: any) { res.status(400).json({ error: publicError(err) }); }
});
