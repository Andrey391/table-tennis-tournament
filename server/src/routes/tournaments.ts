import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { CreateTournamentSchema, UpdateTournamentSchema, AddPlayersSchema } from "../shared/schemas.js";
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
      matches: { include: { player1: { select: playerSelect }, player2: { select: playerSelect }, judge: { select: { firstName: true, lastName: true } } }, orderBy: [{ matchIndex: "asc" }] },
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

// Any signed-in user can request to join — the manager has to approve before pairing.
tournamentRouter.post("/:id/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "This tournament is no longer accepting participants" }); return; }

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

// Locks the roster and pairs approved players by rating: strongest paired with
// next-strongest, and so on. A leftover player (odd headcount) gets a bye.
tournamentRouter.post("/:id/pair", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user!.userId);
    if (!tournament) return;
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "Tournament already paired" }); return; }

    const players = await prisma.tournamentUser.findMany({
      where: { tournamentId: tournament.id, status: "REGISTERED" },
      include: { user: { select: { id: true, rating: true } } },
    });
    if (players.length < 2) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }

    const sorted = [...players].sort((a, b) => (b.user?.rating || 0) - (a.user?.rating || 0));

    await prisma.$transaction(sorted.map((p, idx) => prisma.tournamentUser.update({ where: { id: p.id }, data: { seed: idx + 1 } })));

    const pairs: { player1Id: string; player2Id: string }[] = [];
    for (let i = 0; i + 1 < sorted.length; i += 2) {
      pairs.push({ player1Id: sorted[i].userId, player2Id: sorted[i + 1].userId });
    }
    const bye = sorted.length % 2 === 1 ? sorted[sorted.length - 1] : null;

    const tablesCount = tournament.tablesCount || 1;
    await prisma.$transaction([
      ...pairs.map((p, idx) =>
        prisma.match.create({
          data: {
            tournamentId: tournament.id,
            player1Id: p.player1Id,
            player2Id: p.player2Id,
            matchIndex: idx,
            tableNumber: (idx % tablesCount) + 1,
          },
        })
      ),
      prisma.tournament.update({ where: { id: tournament.id }, data: { status: "ACTIVE" } }),
    ]);

    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_PAIR", entity: "Tournament", entityId: tournament.id, newValue: { pairs: pairs.length, bye: bye?.userId || null } });
    res.json({ message: "Paired", matches: pairs.length, bye: bye?.userId || null });
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

    const stats = new Map<string, { userId: string; firstName: string; lastName: string; club?: string | null; rating: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number }>();
    for (const p of tournament.players) {
      if (!p.user) continue;
      stats.set(p.userId, { userId: p.userId, firstName: p.user.firstName, lastName: p.user.lastName, club: p.user.club, rating: p.user.rating, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
    }
    for (const m of tournament.matches) {
      if (!m.player1Id || !m.player2Id) continue;
      const s1 = stats.get(m.player1Id);
      const s2 = stats.get(m.player2Id);
      if (!s1 || !s2) continue;
      s1.pointsFor += m.score1; s1.pointsAgainst += m.score2;
      s2.pointsFor += m.score2; s2.pointsAgainst += m.score1;
      if (m.score1 > m.score2) { s1.wins++; s2.losses++; } else { s2.wins++; s1.losses++; }
    }
    const result = Array.from(stats.values()).sort((a, b) => b.wins - a.wins || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
