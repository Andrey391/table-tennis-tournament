import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const app = express();
app.use(cors());
app.use(express.json());

function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) { res.status(401).json({ error: "No token" }); return; }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "secret");
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || "secret", { expiresIn: "24h" });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, rating: user.rating, club: user.club } });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, password: hashed, firstName, lastName, role: role || "PLAYER" } });
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || "secret", { expiresIn: "24h" });
    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true, email: true, firstName: true, lastName: true, role: true, club: true, rating: true } });
    res.json(user);
  } catch { res.status(401).json({ error: "Invalid token" }); }
});

app.get("/api/tournaments", async (_req, res) => {
  const tournaments = await prisma.tournament.findMany({
    include: { organizer: { select: { firstName: true, lastName: true } }, _count: { select: { matches: true, players: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(tournaments);
});

app.get("/api/tournaments/:id", async (req, res) => {
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

app.post("/api/tournaments", authMiddleware, async (req: any, res) => {
  try {
    const { name, type, system, format, tablesCount, maxGroups, playersPerGroup, playersOut } = req.body;
    const tournament = await prisma.tournament.create({
      data: { name, type, system, format, tablesCount: tablesCount || 4, maxGroups, playersPerGroup, playersOut, organizerId: req.user.userId },
    });
    res.status(201).json(tournament);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/tournaments/:id/players", authMiddleware, async (req, res) => {
  try {
    const { userIds } = req.body;
    const existing = await prisma.tournamentUser.findMany({ where: { tournamentId: req.params.id }, select: { userId: true } });
    const existingIds = new Set(existing.map((e: { userId: string }) => e.userId));
    const newUsers = userIds.filter((id: string) => !existingIds.has(id));
    const created = await prisma.$transaction(newUsers.map((userId: string) => prisma.tournamentUser.create({ data: { tournamentId: req.params.id, userId } })));
    res.status(201).json(created);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/tournaments/:id/standings", async (req, res) => {
  const ratings = await prisma.rating.findMany({ where: { tournamentId: req.params.id }, include: { player: true }, orderBy: [{ points: "desc" }, { pointsFor: "desc" }] });
  res.json(ratings);
});

app.post("/api/tournaments/:id/draw", authMiddleware, async (req, res) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { players: true } });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    const shuffled = [...tournament.players].sort(() => Math.random() - 0.5);
    await prisma.$transaction(shuffled.map((p, idx) => prisma.tournamentUser.update({ where: { id: p.id }, data: { seed: idx + 1 } })));
    res.json({ message: "Draw completed", total: shuffled.length });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/matches/tournament/:tournamentId", async (req, res) => {
  const matches = await prisma.match.findMany({
    where: { tournamentId: req.params.tournamentId },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true },
    orderBy: [{ round: "asc" }, { tableNumber: "asc" }],
  });
  res.json(matches);
});

app.get("/api/matches/:id", async (req, res) => {
  const match = await prisma.match.findUnique({
    where: { id: req.params.id },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true, bracket: true, games: true },
  });
  if (!match) { res.status(404).json({ error: "Not found" }); return; }
  res.json(match);
});

app.post("/api/matches", authMiddleware, async (req, res) => {
  try {
    const { tournamentId, player1Id, player2Id, matchType, format, groupId, tableNumber, round } = req.body;
    const match = await prisma.match.create({
      data: { tournamentId, player1Id, player2Id, matchType: matchType || "SINGLE", format, groupId, tableNumber, round },
    });
    res.status(201).json(match);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put("/api/matches/:id/score", authMiddleware, async (req, res) => {
  try {
    const { score1, score2, gamesWon1, gamesWon2, state } = req.body;
    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: {
        score1, score2, gamesWon1, gamesWon2,
        status: state === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
        startedAt: state === "IN_PROGRESS" ? new Date() : undefined,
        endedAt: state === "COMPLETED" ? new Date() : undefined,
      },
    });
    res.json(match);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/let", authMiddleware, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) { res.status(404).json({ error: "Not found" }); return; }
    const game = await prisma.game.create({
      data: { matchId: match.id, player1Score: match.score1, player2Score: match.score2, letCount: 1, serverSide: 1, state: "LET" },
    });
    res.json({ success: true, game });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/end", authMiddleware, async (req, res) => {
  try {
    const match = await prisma.match.update({ where: { id: req.params.id }, data: { status: "COMPLETED", endedAt: new Date() } });
    res.json(match);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default app;
