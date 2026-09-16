import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { CreateTournamentSchema, UpdateTournamentSchema, AddPlayersSchema, ChatMessageSchema } from "../shared/schemas.js";
import { generateRoundPairings } from "../shared/scheduler.js";
import AuditLog from "../models/AuditLog.js";

export const tournamentRouter = Router();

const playerSelect = { id: true, firstName: true, lastName: true, club: true, rating: true };

// Loads the tournament and confirms the caller is the one managing it (its creator).
// Sends the appropriate error response and returns null when the caller can't proceed.
async function loadOwnedTournament(res: Response, tournamentId: string, userId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return null; }
  if (tournament.organizerId !== userId) { res.status(403).json({ error: "Only the tournament manager can do this" }); return null; }
  return tournament;
}

function computeStandings(players: { userId: string; user: { firstName: string; lastName: string; club: string | null; rating: number } | null }[], matches: { player1Id: string | null; player2Id: string | null; score1: number; score2: number }[]) {
  const stats = new Map<string, { userId: string; firstName: string; lastName: string; club?: string | null; rating: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number }>();
  for (const p of players) {
    if (!p.user) continue;
    stats.set(p.userId, { userId: p.userId, firstName: p.user.firstName, lastName: p.user.lastName, club: p.user.club, rating: p.user.rating, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
  }
  for (const m of matches) {
    if (!m.player1Id || !m.player2Id) continue;
    const s1 = stats.get(m.player1Id);
    const s2 = stats.get(m.player2Id);
    if (!s1 || !s2) continue;
    s1.pointsFor += m.score1; s1.pointsAgainst += m.score2;
    s2.pointsFor += m.score2; s2.pointsAgainst += m.score1;
    if (m.score1 > m.score2) { s1.wins++; s2.losses++; } else { s2.wins++; s1.losses++; }
  }
  return Array.from(stats.values()).sort((a, b) => b.wins - a.wins || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst));
}

tournamentRouter.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = CreateTournamentSchema.parse(req.body);
    const tournament = await prisma.tournament.create({ data: { ...data, organizerId: req.user!.userId } });
    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_CREATE", entity: "Tournament", entityId: tournament.id, newValue: data });
    res.status(201).json(tournament);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

tournamentRouter.get("/", async (_req, res: Response) => {
  const tournaments = await prisma.tournament.findMany({
    include: { organizer: { select: { firstName: true, lastName: true } }, _count: { select: { matches: true, players: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(tournaments);
});

tournamentRouter.get("/:id", async (req, res: Response) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: {
      organizer: { select: { id: true, firstName: true, lastName: true } },
      players: { include: { user: { select: playerSelect } }, orderBy: { seed: "asc" } },
      matches: { include: { player1: { select: playerSelect }, player2: { select: playerSelect }, judge: { select: { firstName: true, lastName: true } } }, orderBy: [{ round: "asc" }, { matchIndex: "asc" }] },
    },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  res.json(tournament);
});

tournamentRouter.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    const data = UpdateTournamentSchema.parse(req.body);
    const updated = await prisma.tournament.update({ where: { id: tournament.id }, data });
    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_UPDATE", entity: "Tournament", entityId: tournament.id, newValue: data });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Manager directly adds already-known players to the roster, pre-approved.
tournamentRouter.post("/:id/players", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "Roster is locked, cannot add players" }); return; }

    const { userIds } = AddPlayersSchema.parse(req.body);
    const existing = await prisma.tournamentUser.findMany({ where: { tournamentId: req.params.id }, select: { userId: true } });
    const existingIds = new Set(existing.map((e) => e.userId));
    const newUsers = userIds.filter((id) => !existingIds.has(id));
    const created = await prisma.$transaction(
      newUsers.map((userId) => prisma.tournamentUser.create({ data: { tournamentId: req.params.id, userId, status: "REGISTERED" } }))
    );
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Any signed-in user can request to join (if their rating fits the tournament's
// range) — the manager still has to approve before pairing.
tournamentRouter.post("/:id/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "This tournament is no longer accepting participants" }); return; }

    if (tournament.minRating != null || tournament.maxRating != null) {
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { rating: true } });
      const rating = user?.rating ?? 0;
      if ((tournament.minRating != null && rating < tournament.minRating) || (tournament.maxRating != null && rating > tournament.maxRating)) {
        res.status(403).json({ error: `This tournament is for players rated ${tournament.minRating ?? 0}-${tournament.maxRating ?? "∞"}. Your rating: ${rating}` });
        return;
      }
    }

    const entry = await prisma.tournamentUser.create({
      data: { tournamentId: req.params.id, userId: req.user!.userId, status: "PENDING" },
    });
    res.status(201).json(entry);
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "Already requested to join" }); return; }
    res.status(400).json({ error: err.message });
  }
});

// Manager approves a pending join request.
tournamentRouter.post("/:id/players/:userId/approve", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    const updated = await prisma.tournamentUser.update({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } },
      data: { status: "REGISTERED" },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Manager rejects a pending request or removes an already-approved participant.
tournamentRouter.delete("/:id/players/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "Roster is locked, cannot remove players" }); return; }
    await prisma.tournamentUser.delete({ where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Generates a new round of pairs: round 1 (DRAFT -> ACTIVE) seeds by rating; every
// later round is Swiss-style, ranked by wins so far. Nobody is eliminated between
// rounds. Can be called again after a tournament auto-completed to keep playing.
tournamentRouter.post("/:id/pair", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (tournament.status === "DRAFT") {
      const rosterCount = await prisma.tournamentUser.count({ where: { tournamentId: tournament.id, status: "REGISTERED" } });
      if (rosterCount < 2) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }
    } else {
      const unresolved = await prisma.match.count({ where: { tournamentId: tournament.id, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } });
      if (unresolved > 0) { res.status(400).json({ error: "Finish every match in the current round before starting a new one" }); return; }
    }

    const [players, allMatches] = await Promise.all([
      prisma.tournamentUser.findMany({ where: { tournamentId: tournament.id, status: "REGISTERED" }, include: { user: { select: { id: true, rating: true } } } }),
      prisma.match.findMany({ where: { tournamentId: tournament.id }, select: { round: true, player1Id: true, player2Id: true, score1: true, score2: true } }),
    ]);
    if (players.length < 2) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }

    const isFirstRound = allMatches.length === 0;
    const currentRound = allMatches.reduce((max, m) => Math.max(max, m.round), 0);
    const newRound = currentRound + 1;

    const matchesPerPlayer = new Map<string, number>();
    const winsPerPlayer = new Map<string, number>();
    const playedPairs = new Set<string>();
    for (const m of allMatches) {
      if (!m.player1Id || !m.player2Id) continue;
      matchesPerPlayer.set(m.player1Id, (matchesPerPlayer.get(m.player1Id) || 0) + 1);
      matchesPerPlayer.set(m.player2Id, (matchesPerPlayer.get(m.player2Id) || 0) + 1);
      playedPairs.add([m.player1Id, m.player2Id].sort().join("|"));
      if (m.score1 > m.score2) winsPerPlayer.set(m.player1Id, (winsPerPlayer.get(m.player1Id) || 0) + 1);
      else if (m.score2 > m.score1) winsPerPlayer.set(m.player2Id, (winsPerPlayer.get(m.player2Id) || 0) + 1);
    }

    const candidates = players.map((p) => ({
      userId: p.userId,
      rating: p.user?.rating || 0,
      wins: winsPerPlayer.get(p.userId) || 0,
      matchesPlayed: matchesPerPlayer.get(p.userId) || 0,
    }));

    if (isFirstRound) {
      const sorted = [...candidates].sort((a, b) => b.rating - a.rating);
      await prisma.$transaction(
        sorted.map((c, idx) => prisma.tournamentUser.update({ where: { tournamentId_userId: { tournamentId: tournament.id, userId: c.userId } }, data: { seed: idx + 1 } }))
      );
    }

    const { pairs, byeUserId } = generateRoundPairings(candidates, isFirstRound, playedPairs);
    if (pairs.length === 0) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }

    const tablesCount = tournament.tablesCount || 1;
    await prisma.$transaction([
      ...pairs.map((p, idx) =>
        prisma.match.create({
          data: {
            tournamentId: tournament.id,
            round: newRound,
            player1Id: p.player1Id,
            player2Id: p.player2Id,
            matchIndex: idx,
            tableNumber: (idx % tablesCount) + 1,
          },
        })
      ),
      prisma.tournament.update({ where: { id: tournament.id }, data: { status: "ACTIVE" } }),
    ]);

    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_PAIR", entity: "Tournament", entityId: tournament.id, newValue: { round: newRound, pairs: pairs.length, bye: byeUserId } });
    res.json({ message: "Paired", round: newRound, matches: pairs.length, bye: byeUserId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Basic per-tournament message board (polled by the client, not real-time). Only the
// manager and approved participants can read or post.
async function assertCanUseChat(res: Response, tournamentId: string, userId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return null; }
  if (tournament.organizerId === userId) return tournament;
  const membership = await prisma.tournamentUser.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } });
  if (!membership || membership.status !== "REGISTERED") { res.status(403).json({ error: "Only participants can use this tournament's chat" }); return null; }
  return tournament;
}

tournamentRouter.get("/:id/chat", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const tournament = await assertCanUseChat(res, req.params.id, req.user!.userId);
  if (!tournament) return;
  const messages = await prisma.chatMessage.findMany({
    where: { tournamentId: req.params.id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
});

tournamentRouter.post("/:id/chat", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await assertCanUseChat(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    const { text } = ChatMessageSchema.parse(req.body);
    const message = await prisma.chatMessage.create({
      data: { tournamentId: req.params.id, userId: req.user!.userId, text },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.status(201).json(message);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

tournamentRouter.get("/:id/standings", async (req, res: Response) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        players: { where: { status: "REGISTERED" }, include: { user: { select: playerSelect } } },
        matches: { where: { status: "COMPLETED" }, select: { player1Id: true, player2Id: true, score1: true, score2: true } },
      },
    });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    res.json(computeStandings(tournament.players, tournament.matches));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
