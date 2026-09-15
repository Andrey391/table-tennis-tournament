import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware, roleMiddleware } from "../middleware/auth.js";
import { CreateTournamentSchema } from "../shared/schemas.js";
import AuditLog from "../models/AuditLog.js";

export const tournamentRouter = Router();

tournamentRouter.post("/", authMiddleware, roleMiddleware("ADMIN", "ORGANIZER"), async (req: AuthenticatedRequest, res: Response) => {
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
      groups: { include: { matches: true } },
      matches: { include: { player1: true, player2: true, team1: true, team2: true, judge: true } },
      brackets: true,
      ratings: { include: { player: true } },
      players: { include: { user: true } },
    },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  res.json(tournament);
});

tournamentRouter.put("/:id", authMiddleware, roleMiddleware("ADMIN", "ORGANIZER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await prisma.tournament.update({ where: { id: req.params.id }, data: req.body });
    await AuditLog.create({ userId: req.user!.userId, action: "TOURNAMENT_UPDATE", entity: "Tournament", entityId: tournament.id, newValue: req.body });
    res.json(tournament);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

tournamentRouter.post("/:id/players", authMiddleware, roleMiddleware("ADMIN", "ORGANIZER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userIds } = req.body as { userIds: string[] };
    const existing = await prisma.tournamentUser.findMany({ where: { tournamentId: req.params.id }, select: { userId: true } });
    const existingIds = new Set(existing.map((e: { userId: string }) => e.userId));
    const newUsers = userIds.filter((id) => !existingIds.has(id));
    const created = await prisma.$transaction(
      newUsers.map((userId) => prisma.tournamentUser.create({ data: { tournamentId: req.params.id, userId } }))
    );
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

tournamentRouter.post("/:id/draw", authMiddleware, roleMiddleware("ADMIN", "ORGANIZER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { players: true } });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    const shuffled = [...tournament.players].sort(() => Math.random() - 0.5);
    await prisma.$transaction(shuffled.map((p, idx) => prisma.tournamentUser.update({ where: { id: p.id }, data: { seed: idx + 1 } })));
    res.json({ message: "Draw completed", total: shuffled.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

tournamentRouter.get("/:id/standings", async (req, res: Response) => {
  const ratings = await prisma.rating.findMany({ where: { tournamentId: req.params.id }, include: { player: true }, orderBy: [{ points: "desc" }, { pointsFor: "desc" }] });
  res.json(ratings);
});

tournamentRouter.get("/:id/schedule", async (req, res: Response) => {
  const matches = await prisma.match.findMany({
    where: { tournamentId: req.params.id },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true },
    orderBy: [{ round: "asc" }, { tableNumber: "asc" }],
  });
  res.json(matches);
});
