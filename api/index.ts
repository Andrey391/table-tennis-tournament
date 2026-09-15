import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;
function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

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

app.get("/api/setup", async (_req, res) => {
  try {
    const db = getPrisma();
    const doBlock = (name: string, body: string) => `DO $$ BEGIN ${body}; EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await db.$executeRawUnsafe(doBlock("Role", `CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORGANIZER', 'JUDGE', 'PLAYER', 'VIEWER')`));
    await db.$executeRawUnsafe(doBlock("TournamentType", `CREATE TYPE "TournamentType" AS ENUM ('SINGLE', 'DOUBLE', 'TEAM')`));
    await db.$executeRawUnsafe(doBlock("TournamentSystem", `CREATE TYPE "TournamentSystem" AS ENUM ('ROUND_ROBIN', 'OLYMPIC', 'DOUBLE_ELIMINATION', 'MIXED')`));
    await db.$executeRawUnsafe(doBlock("MatchFormat", `CREATE TYPE "MatchFormat" AS ENUM ('BEST_OF_3', 'BEST_OF_5', 'BEST_OF_7')`));
    await db.$executeRawUnsafe(doBlock("GameState", `CREATE TYPE "GameState" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`));
    await db.$executeRawUnsafe(doBlock("PlayerStatus", `CREATE TYPE "PlayerStatus" AS ENUM ('REGISTERED', 'WITHDRAWN', 'DISQUALIFIED')`));
    await db.$executeRawUnsafe(doBlock("MatchType", `CREATE TYPE "MatchType" AS ENUM ('SINGLE', 'DOUBLE', 'TEAM')`));
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "password" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'PLAYER', "club" TEXT, "rating" INTEGER NOT NULL DEFAULT 1000, "dateOfBirth" TIMESTAMP(3), "phone" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Player" ("id" TEXT NOT NULL, "userId" TEXT, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "club" TEXT, "rating" INTEGER NOT NULL DEFAULT 1000, "dateOfBirth" TIMESTAMP(3), "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED', "teamId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Player_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Player_userId_key" ON "Player"("userId")`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Team" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "club" TEXT, "captainId" TEXT, "tournamentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Team_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Tournament" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "type" "TournamentType" NOT NULL, "system" "TournamentSystem" NOT NULL, "format" "MatchFormat" NOT NULL, "maxGroups" INTEGER, "playersPerGroup" INTEGER, "playersOut" INTEGER, "tablesCount" INTEGER NOT NULL DEFAULT 4, "status" TEXT NOT NULL DEFAULT 'DRAFT', "startTime" TIMESTAMP(3), "endTime" TIMESTAMP(3), "organizerId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TournamentUser" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "teamId" TEXT, "seed" INTEGER, "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED', "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TournamentUser_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TournamentUser_tournamentId_userId_key" ON "TournamentUser"("tournamentId", "userId")`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Group" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "name" TEXT NOT NULL, "playersInGroup" INTEGER NOT NULL, "standings" TEXT NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Group_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Match" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "groupId" TEXT, "bracketId" TEXT, "round" INTEGER, "tableNumber" INTEGER, "player1Id" TEXT, "player2Id" TEXT, "team1Id" TEXT, "team2Id" TEXT, "judgeId" TEXT, "matchType" "MatchType" NOT NULL DEFAULT 'SINGLE', "format" "MatchFormat" NOT NULL, "status" "GameState" NOT NULL DEFAULT 'NOT_STARTED', "score1" INTEGER NOT NULL DEFAULT 0, "score2" INTEGER NOT NULL DEFAULT 0, "gamesWon1" INTEGER NOT NULL DEFAULT 0, "gamesWon2" INTEGER NOT NULL DEFAULT 0, "sets1" JSONB DEFAULT '[]', "sets2" JSONB DEFAULT '[]', "startedAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Match_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Game" ("id" TEXT NOT NULL, "matchId" TEXT NOT NULL, "player1Score" INTEGER NOT NULL, "player2Score" INTEGER NOT NULL, "letCount" INTEGER NOT NULL DEFAULT 0, "serverSide" INTEGER NOT NULL DEFAULT 1, "state" TEXT NOT NULL DEFAULT 'IN_PROGRESS', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Game_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Bracket" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'WINNERS', "round" INTEGER NOT NULL DEFAULT 1, "matchups" JSONB NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Bracket_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Rating" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "userId" TEXT, "points" INTEGER NOT NULL, "won" INTEGER NOT NULL, "lost" INTEGER NOT NULL, "draws" INTEGER NOT NULL, "pointsFor" INTEGER NOT NULL, "pointsAgainst" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Rating_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Rating_tournamentId_playerId_key" ON "Rating"("tournamentId", "playerId")`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AuditLog" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "action" TEXT NOT NULL, "entity" TEXT NOT NULL, "entityId" TEXT, "oldValue" JSONB, "newValue" JSONB, "ip" TEXT, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Session" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "token" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Session_pkey" PRIMARY KEY ("id"))`);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token")`);
    res.json({ status: "ok", message: "Schema created" });
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      res.json({ status: "ok", message: "Already exists" });
    } else {
      res.status(500).json({ status: "error", error: e.message });
    }
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const bcrypt = await import("bcryptjs");
    const { email, password } = req.body;
    const user = await getPrisma().user.findUnique({ where: { email } });
    if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || "secret", { expiresIn: "24h" });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, rating: user.rating, club: user.club } });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const bcrypt = await import("bcryptjs");
    const { email, password, firstName, lastName, role } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = await getPrisma().user.create({ data: { email, password: hashed, firstName, lastName, role: role || "PLAYER" } });
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || "secret", { expiresIn: "24h" });
    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
  try {
    const user = await getPrisma().user.findUnique({ where: { id: req.user.userId }, select: { id: true, email: true, firstName: true, lastName: true, role: true, club: true, rating: true } });
    res.json(user);
  } catch { res.status(401).json({ error: "Invalid token" }); }
});

app.get("/api/tournaments", async (_req, res) => {
  const tournaments = await getPrisma().tournament.findMany({
    include: { organizer: { select: { firstName: true, lastName: true } }, _count: { select: { matches: true, players: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(tournaments);
});

app.get("/api/tournaments/:id", async (req, res) => {
  const tournament = await getPrisma().tournament.findUnique({
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
    const tournament = await getPrisma().tournament.create({
      data: { name, type, system, format, tablesCount: tablesCount || 4, maxGroups, playersPerGroup, playersOut, organizerId: req.user.userId },
    });
    res.status(201).json(tournament);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/tournaments/:id/players", authMiddleware, async (req, res) => {
  try {
    const { userIds } = req.body;
    const db = getPrisma();
    const existing = await db.tournamentUser.findMany({ where: { tournamentId: req.params.id }, select: { userId: true } });
    const existingIds = new Set(existing.map((e: { userId: string }) => e.userId));
    const newUsers = userIds.filter((id: string) => !existingIds.has(id));
    const created = await db.$transaction(newUsers.map((userId: string) => db.tournamentUser.create({ data: { tournamentId: req.params.id, userId } })));
    res.status(201).json(created);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/tournaments/:id/standings", async (req, res) => {
  const ratings = await getPrisma().rating.findMany({ where: { tournamentId: req.params.id }, include: { player: true }, orderBy: [{ points: "desc" }, { pointsFor: "desc" }] });
  res.json(ratings);
});

app.post("/api/tournaments/:id/draw", authMiddleware, async (req, res) => {
  try {
    const db = getPrisma();
    const tournament = await db.tournament.findUnique({ where: { id: req.params.id }, include: { players: true } });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    const shuffled = [...tournament.players].sort(() => Math.random() - 0.5);
    await db.$transaction(shuffled.map((p, idx) => db.tournamentUser.update({ where: { id: p.id }, data: { seed: idx + 1 } })));
    res.json({ message: "Draw completed", total: shuffled.length });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/matches/tournament/:tournamentId", async (req, res) => {
  const matches = await getPrisma().match.findMany({
    where: { tournamentId: req.params.tournamentId },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true },
    orderBy: [{ round: "asc" }, { tableNumber: "asc" }],
  });
  res.json(matches);
});

app.get("/api/matches/:id", async (req, res) => {
  const match = await getPrisma().match.findUnique({
    where: { id: req.params.id },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true, bracket: true, games: true },
  });
  if (!match) { res.status(404).json({ error: "Not found" }); return; }
  res.json(match);
});

app.post("/api/matches", authMiddleware, async (req, res) => {
  try {
    const { tournamentId, player1Id, player2Id, matchType, format, groupId, tableNumber, round } = req.body;
    const match = await getPrisma().match.create({
      data: { tournamentId, player1Id, player2Id, matchType: matchType || "SINGLE", format, groupId, tableNumber, round },
    });
    res.status(201).json(match);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put("/api/matches/:id/score", authMiddleware, async (req, res) => {
  try {
    const { score1, score2, gamesWon1, gamesWon2, state } = req.body;
    const match = await getPrisma().match.update({
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
    const db = getPrisma();
    const match = await db.match.findUnique({ where: { id: req.params.id } });
    if (!match) { res.status(404).json({ error: "Not found" }); return; }
    const game = await db.game.create({
      data: { matchId: match.id, player1Score: match.score1, player2Score: match.score2, letCount: 1, serverSide: 1, state: "LET" },
    });
    res.json({ success: true, game });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/end", authMiddleware, async (req, res) => {
  try {
    const match = await getPrisma().match.update({ where: { id: req.params.id }, data: { status: "COMPLETED", endedAt: new Date() } });
    res.json(match);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default app;
