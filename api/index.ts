import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;
function db() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

const app = express();
app.use(cors());
app.use(express.json());

function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) { res.status(401).json({ error: "No token" }); return; }
  try { req.user = jwt.verify(token, process.env.JWT_SECRET || "secret"); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

function optionalAuth(req: any, _res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) { try { req.user = jwt.verify(token, process.env.JWT_SECRET || "secret"); } catch {} }
  next();
}

function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    next();
  };
}

// ─── SCHEMA SETUP ───────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => { res.json({ status: "ok", time: new Date().toISOString() }); });

app.get("/api/setup", async (_req, res) => {
  const d = db();
  const doBlock = (body: string) => `DO $$ BEGIN ${body}; EXCEPTION WHEN duplicate_object THEN null; END $$`;
  try {
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORGANIZER', 'JUDGE', 'PLAYER', 'VIEWER')`));
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "TournamentType" AS ENUM ('SINGLE', 'DOUBLE', 'TEAM')`));
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "TournamentSystem" AS ENUM ('ROUND_ROBIN', 'OLYMPIC', 'DOUBLE_ELIMINATION', 'MIXED')`));
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "MatchFormat" AS ENUM ('BEST_OF_3', 'BEST_OF_5', 'BEST_OF_7')`));
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "GameState" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`));
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "PlayerStatus" AS ENUM ('REGISTERED', 'WITHDRAWN', 'DISQUALIFIED')`));
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "MatchType" AS ENUM ('SINGLE', 'DOUBLE', 'TEAM')`));

    const tables = [
      `CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "password" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'PLAYER', "club" TEXT, "rating" INTEGER NOT NULL DEFAULT 1000, "dateOfBirth" TIMESTAMP(3), "phone" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,
      `CREATE TABLE IF NOT EXISTS "Player" ("id" TEXT NOT NULL, "userId" TEXT, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "club" TEXT, "rating" INTEGER NOT NULL DEFAULT 1000, "dateOfBirth" TIMESTAMP(3), "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED', "teamId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Player_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Player_userId_key" ON "Player"("userId")`,
      `CREATE TABLE IF NOT EXISTS "Team" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "club" TEXT, "captainId" TEXT, "tournamentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Team_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "Tournament" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "type" "TournamentType" NOT NULL, "system" "TournamentSystem" NOT NULL, "format" "MatchFormat" NOT NULL, "maxGroups" INTEGER, "playersPerGroup" INTEGER, "playersOut" INTEGER, "tablesCount" INTEGER NOT NULL DEFAULT 4, "status" TEXT NOT NULL DEFAULT 'DRAFT', "startTime" TIMESTAMP(3), "endTime" TIMESTAMP(3), "organizerId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "TournamentUser" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "teamId" TEXT, "seed" INTEGER, "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED', "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TournamentUser_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "TournamentUser_tournamentId_userId_key" ON "TournamentUser"("tournamentId", "userId")`,
      `CREATE TABLE IF NOT EXISTS "Group" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "name" TEXT NOT NULL, "playersInGroup" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Group_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "GroupPlayer" ("id" TEXT NOT NULL, "groupId" TEXT NOT NULL, "userId" TEXT NOT NULL, "seed" INTEGER, "wins" INTEGER NOT NULL DEFAULT 0, "losses" INTEGER NOT NULL DEFAULT 0, "gamesWon" INTEGER NOT NULL DEFAULT 0, "gamesLost" INTEGER NOT NULL DEFAULT 0, "pointsWon" INTEGER NOT NULL DEFAULT 0, "pointsLost" INTEGER NOT NULL DEFAULT 0, "tiebreak1" DOUBLE PRECISION NOT NULL DEFAULT 0, "tiebreak2" DOUBLE PRECISION NOT NULL DEFAULT 0, "position" INTEGER, CONSTRAINT "GroupPlayer_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "GroupPlayer_groupId_userId_key" ON "GroupPlayer"("groupId", "userId")`,
      `CREATE TABLE IF NOT EXISTS "Match" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "groupId" TEXT, "bracketId" TEXT, "round" INTEGER, "matchIndex" INTEGER, "tableNumber" INTEGER, "scheduledAt" TIMESTAMP(3), "player1Id" TEXT, "player2Id" TEXT, "team1Id" TEXT, "team2Id" TEXT, "judgeId" TEXT, "matchType" "MatchType" NOT NULL DEFAULT 'SINGLE', "format" "MatchFormat" NOT NULL, "status" "GameState" NOT NULL DEFAULT 'NOT_STARTED', "score1" INTEGER NOT NULL DEFAULT 0, "score2" INTEGER NOT NULL DEFAULT 0, "gamesWon1" INTEGER NOT NULL DEFAULT 0, "gamesWon2" INTEGER NOT NULL DEFAULT 0, "startedAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Match_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "Game" ("id" TEXT NOT NULL, "matchId" TEXT NOT NULL, "gameNumber" INTEGER NOT NULL DEFAULT 1, "player1Score" INTEGER NOT NULL DEFAULT 0, "player2Score" INTEGER NOT NULL DEFAULT 0, "letCount" INTEGER NOT NULL DEFAULT 0, "serverSide" INTEGER NOT NULL DEFAULT 1, "state" TEXT NOT NULL DEFAULT 'NOT_STARTED', "winnerSide" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Game_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "Bracket" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'WINNERS', "round" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Bracket_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "Rating" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "userId" TEXT, "points" INTEGER NOT NULL DEFAULT 0, "won" INTEGER NOT NULL DEFAULT 0, "lost" INTEGER NOT NULL DEFAULT 0, "draws" INTEGER NOT NULL DEFAULT 0, "pointsFor" INTEGER NOT NULL DEFAULT 0, "pointsAgainst" INTEGER NOT NULL DEFAULT 0, "position" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Rating_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Rating_tournamentId_playerId_key" ON "Rating"("tournamentId", "playerId")`,
      `CREATE TABLE IF NOT EXISTS "AuditLog" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "action" TEXT NOT NULL, "entity" TEXT NOT NULL, "entityId" TEXT, "oldValue" JSONB, "newValue" JSONB, "ip" TEXT, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "Session" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "token" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Session_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token")`,
    ];
    for (const t of tables) await d.$executeRawUnsafe(t);
    res.json({ status: "ok", message: "Schema created" });
  } catch (e: any) {
    res.json({ status: "ok", message: e.message?.includes("already exists") ? "Already exists" : "Partial" });
  }
});

// ─── AUTH ───────────────────────────────────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  try {
    const bcrypt = await import("bcryptjs");
    const { email, password, firstName, lastName, club, role } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = await db().user.create({ data: { email, password: hashed, firstName, lastName, club, role: role || "PLAYER" } });
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || "secret", { expiresIn: "24h" });
    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName } });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const bcrypt = await import("bcryptjs");
    const { email, password } = req.body;
    const user = await db().user.findUnique({ where: { email } });
    if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || "secret", { expiresIn: "24h" });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, rating: user.rating, club: user.club } });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
  try {
    const user = await db().user.findUnique({ where: { id: req.user.userId }, select: { id: true, email: true, firstName: true, lastName: true, role: true, club: true, rating: true, phone: true, dateOfBirth: true } });
    res.json(user);
  } catch { res.status(401).json({ error: "Invalid token" }); }
});

// ─── USERS / PLAYERS ────────────────────────────────────────────────────────────

app.get("/api/players", authMiddleware, async (_req, res) => {
  const players = await db().user.findMany({ select: { id: true, email: true, firstName: true, lastName: true, role: true, club: true, rating: true, phone: true, dateOfBirth: true, createdAt: true }, orderBy: { rating: "desc" } });
  res.json(players);
});

app.put("/api/players/:id", authMiddleware, async (req: any, res) => {
  try {
    const { firstName, lastName, club, rating, phone, dateOfBirth } = req.body;
    const user = await db().user.update({ where: { id: req.params.id }, data: { firstName, lastName, club, rating, phone, dateOfBirth } });
    res.json(user);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── TOURNAMENTS ────────────────────────────────────────────────────────────────

app.get("/api/tournaments", optionalAuth, async (_req, res) => {
  const tournaments = await db().tournament.findMany({
    include: { organizer: { select: { firstName: true, lastName: true } }, _count: { select: { matches: true, players: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(tournaments);
});

app.get("/api/tournaments/:id", async (req, res) => {
  const tournament = await db().tournament.findUnique({
    where: { id: req.params.id },
    include: {
      organizer: { select: { firstName: true, lastName: true } },
      groups: { include: { matches: { include: { player1: true, player2: true, judge: true, games: true } }, groupPlayers: { include: { user: { select: { id: true, firstName: true, lastName: true, club: true, rating: true } } } } } },
      matches: { include: { player1: true, player2: true, team1: true, team2: true, judge: true, games: true }, orderBy: [{ round: "asc" }, { matchIndex: "asc" }] },
      brackets: true,
      ratings: { include: { player: true } },
      players: { include: { user: { select: { id: true, firstName: true, lastName: true, club: true, rating: true } } } },
    },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  res.json(tournament);
});

app.post("/api/tournaments", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req: any, res) => {
  try {
    const { name, type, system, format, tablesCount, maxGroups, playersPerGroup, playersOut } = req.body;
    const tournament = await db().tournament.create({ data: { name, type, system, format, tablesCount: tablesCount || 4, maxGroups, playersPerGroup, playersOut, organizerId: req.user.userId } });
    res.status(201).json(tournament);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put("/api/tournaments/:id", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req: any, res) => {
  try {
    const { name, status, startTime, endTime, tablesCount } = req.body;
    const tournament = await db().tournament.update({ where: { id: req.params.id }, data: { name, status, startTime, endTime, tablesCount } });
    res.json(tournament);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── TOURNAMENT PLAYERS ─────────────────────────────────────────────────────────

app.post("/api/tournaments/:id/players", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req, res) => {
  try {
    const { userIds } = req.body;
    const db_ = db();
    const existing = await db_.tournamentUser.findMany({ where: { tournamentId: req.params.id }, select: { userId: true } });
    const existingIds = new Set(existing.map((e: any) => e.userId));
    const newUsers = userIds.filter((id: string) => !existingIds.has(id));
    const created = await db_.$transaction(newUsers.map((userId: string) => db_.tournamentUser.create({ data: { tournamentId: req.params.id, userId } })));
    res.status(201).json(created);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete("/api/tournaments/:id/players/:userId", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req, res) => {
  try {
    await db().tournamentUser.delete({ where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } } });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── SEEDING ────────────────────────────────────────────────────────────────────

app.post("/api/tournaments/:id/seed", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req, res) => {
  try {
    const db_ = db();
    const players = await db_.tournamentUser.findMany({ where: { tournamentId: req.params.id }, include: { user: { select: { rating: true } } } });
    const sorted = [...players].sort((a, b) => (b.user?.rating || 0) - (a.user?.rating || 0));
    await db_.$transaction(sorted.map((p, idx) => db_.tournamentUser.update({ where: { id: p.id }, data: { seed: idx + 1 } })));
    res.json({ message: "Seeded", count: sorted.length });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── DRAW ───────────────────────────────────────────────────────────────────────

app.post("/api/tournaments/:id/draw", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req, res) => {
  try {
    const d = db();
    const tournament = await d.tournament.findUnique({ where: { id: req.params.id }, include: { players: { include: { user: { select: { rating: true } } } } } });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }

    const players = tournament.players;
    const playersPerGroup = tournament.playersPerGroup || 8;
    const numGroups = tournament.maxGroups || Math.ceil(players.length / playersPerGroup);

    const seeded = [...players].sort((a, b) => (b.user?.rating || 0) - (a.user?.rating || 0));

    const groups: any[] = [];
    for (let g = 0; g < numGroups; g++) {
      const group = await d.group.create({ data: { tournamentId: tournament.id, name: `Group ${String.fromCharCode(65 + g)}`, playersInGroup: 0 } });
      groups.push(group);
    }

    for (let i = 0; i < seeded.length; i++) {
      const groupIdx = i % numGroups === 0 ? 0 : i % numGroups;
      const groupId = groups[groupIdx].id;
      await d.groupPlayer.create({ data: { groupId, userId: seeded[i].userId, seed: i + 1 } });
      await d.group.update({ where: { id: groupId }, data: { playersInGroup: { increment: 1 } } });
    }

    for (const group of groups) {
      const groupPlayers = await d.groupPlayer.findMany({ where: { groupId: group.id } });
      for (let i = 0; i < groupPlayers.length; i++) {
        for (let j = i + 1; j < groupPlayers.length; j++) {
          await d.match.create({
            data: {
              tournamentId: tournament.id,
              groupId: group.id,
              player1Id: groupPlayers[i].userId,
              player2Id: groupPlayers[j].userId,
              format: tournament.format,
              matchType: tournament.type as any,
              round: i + j,
              matchIndex: i,
            },
          });
        }
      }
    }

    res.json({ message: "Draw completed", groups: groups.length, totalMatches: seeded.length * (seeded.length - 1) / 2 });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── GROUPS ─────────────────────────────────────────────────────────────────────

app.get("/api/tournaments/:id/standings", async (req, res) => {
  try {
    const d = db();
    const groups = await d.group.findMany({
      where: { tournamentId: req.params.id },
      include: {
        groupPlayers: { include: { user: { select: { id: true, firstName: true, lastName: true, club: true, rating: true } } } },
        matches: { include: { player1: true, player2: true } },
      },
    });
    const result = groups.map((g: any) => ({
      id: g.id,
      name: g.name,
      standings: calculateGroupStandingsLocal(g.matches, g.groupPlayers),
    }));
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

function calculateGroupStandingsLocal(matches: any[], groupPlayers: any[]) {
  const map = new Map<string, any>();
  for (const gp of groupPlayers) {
    map.set(gp.userId, {
      userId: gp.userId, firstName: gp.user?.firstName, lastName: gp.user?.lastName, club: gp.user?.club, rating: gp.user?.rating,
      seed: gp.seed, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, matchPoints: 0, h2h: {} as any,
    });
  }
  for (const m of matches) {
    if (m.status !== "COMPLETED") continue;
    const s1 = map.get(m.player1Id);
    const s2 = map.get(m.player2Id);
    if (!s1 || !s2) continue;
    s1.gamesWon += m.gamesWon1; s1.gamesLost += m.gamesWon2; s1.pointsWon += m.score1; s1.pointsLost += m.score2;
    s2.gamesWon += m.gamesWon2; s2.gamesLost += m.gamesWon1; s2.pointsWon += m.score2; s2.pointsLost += m.score1;
    if (m.gamesWon1 > m.gamesWon2) { s1.wins++; s2.losses++; s1.matchPoints += 2; } else { s2.wins++; s1.losses++; s2.matchPoints += 2; }
    if (!s1.h2h[m.player2Id]) s1.h2h[m.player2Id] = { w: 0, gw: 0, gl: 0 };
    if (!s2.h2h[m.player1Id]) s2.h2h[m.player1Id] = { w: 0, gw: 0, gl: 0 };
    s1.h2h[m.player2Id].gw += m.gamesWon1; s1.h2h[m.player2Id].gl += m.gamesWon2;
    s2.h2h[m.player1Id].gw += m.gamesWon2; s2.h2h[m.player1Id].gl += m.gamesWon1;
    if (m.gamesWon1 > m.gamesWon2) s1.h2h[m.player2Id].w++; else s2.h2h[m.player1Id].w++;
  }
  const arr = Array.from(map.values());
  arr.sort((a, b) => {
    if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
    const h2h = a.h2h[b.userId];
    if (h2h) { const o = b.h2h[a.userId]; if (h2h.w !== o?.w) return h2h.w - o.w; }
    const ar = a.gamesLost > 0 ? a.gamesWon / a.gamesLost : a.gamesWon;
    const br = b.gamesLost > 0 ? b.gamesWon / b.gamesLost : b.gamesWon;
    if (Math.abs(ar - br) > 0.001) return br - ar;
    const ap = a.pointsLost > 0 ? a.pointsWon / a.pointsLost : a.pointsWon;
    const bp = b.pointsLost > 0 ? b.pointsWon / b.pointsLost : b.pointsWon;
    return bp - ap;
  });
  arr.forEach((s, i) => { s.position = i + 1; });
  return arr;
}

// ─── MATCHES ────────────────────────────────────────────────────────────────────

app.get("/api/matches/tournament/:tournamentId", async (req, res) => {
  const matches = await db().match.findMany({
    where: { tournamentId: req.params.tournamentId },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true, games: true },
    orderBy: [{ round: "asc" }, { matchIndex: "asc" }],
  });
  res.json(matches);
});

app.get("/api/matches/:id", async (req, res) => {
  const match = await db().match.findUnique({
    where: { id: req.params.id },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true, bracket: true, games: true },
  });
  if (!match) { res.status(404).json({ error: "Not found" }); return; }
  res.json(match);
});

app.post("/api/matches", authMiddleware, requireRole("ADMIN", "ORGANIZER", "JUDGE"), async (req, res) => {
  try {
    const { tournamentId, player1Id, player2Id, matchType, format, groupId, tableNumber, round, matchIndex } = req.body;
    const match = await db().match.create({ data: { tournamentId, player1Id, player2Id, matchType: matchType || "SINGLE", format: format || "BEST_OF_3", groupId, tableNumber, round, matchIndex } });
    res.status(201).json(match);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put("/api/matches/:id/assign-judge", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req, res) => {
  try {
    const { judgeId, tableNumber } = req.body;
    const match = await db().match.update({ where: { id: req.params.id }, data: { judgeId, tableNumber } });
    res.json(match);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put("/api/matches/:id/schedule", authMiddleware, requireRole("ADMIN", "ORGANIZER"), async (req, res) => {
  try {
    const { scheduledAt, tableNumber } = req.body;
    const match = await db().match.update({ where: { id: req.params.id }, data: { scheduledAt, tableNumber } });
    res.json(match);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── GAME SCORING ───────────────────────────────────────────────────────────────

app.post("/api/matches/:id/start", authMiddleware, async (req, res) => {
  try {
    const d = db();
    const match = await d.match.findUnique({ where: { id: req.params.id }, include: { games: true } });
    if (!match) { res.status(404).json({ error: "Not found" }); return; }

    const activeGame = match.games.find((g: any) => g.state === "IN_PROGRESS");
    if (activeGame) { res.json({ game: activeGame }); return; }

    const gameNumber = match.games.length + 1;
    const game = await d.game.create({ data: { matchId: match.id, gameNumber, state: "IN_PROGRESS", serverSide: 1 } });
    await d.match.update({ where: { id: match.id }, data: { status: "IN_PROGRESS", startedAt: match.startedAt || new Date() } });
    res.json({ game });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/score", authMiddleware, async (req, res) => {
  try {
    const { side } = req.body;
    const d = db();
    const match = await d.match.findUnique({ where: { id: req.params.id }, include: { games: true } });
    if (!match) { res.status(404).json({ error: "Not found" }); return; }

    let game = match.games.find((g: any) => g.state === "IN_PROGRESS");
    if (!game) {
      const gameNumber = match.games.length + 1;
      game = await d.game.create({ data: { matchId: match.id, gameNumber, state: "IN_PROGRESS", serverSide: 1, player1Score: 0, player2Score: 0 } });
    }

    const newScore1 = side === 1 ? game.player1Score + 1 : game.player1Score;
    const newScore2 = side === 2 ? game.player2Score + 1 : game.player2Score;
    const totalPoints = newScore1 + newScore2;
    const deuceMode = newScore1 >= 10 && newScore2 >= 10;
    const isWinner = deuceMode
      ? (newScore1 - newScore2 >= 2 ? 1 : newScore2 - newScore1 >= 2 ? 2 : null)
      : (newScore1 >= 11 ? 1 : newScore2 >= 11 ? 2 : null);

    let newServer = game.serverSide;
    if (deuceMode) {
      newServer = totalPoints % 2 === 0 ? game.serverSide : (game.serverSide === 1 ? 2 : 1);
    } else {
      newServer = Math.floor(totalPoints / 2) % 2 === 0 ? game.serverSide : (game.serverSide === 1 ? 2 : 1);
    }

    const updatedGame = await d.game.update({
      where: { id: game.id },
      data: {
        player1Score: newScore1,
        player2Score: newScore2,
        serverSide: newServer,
        state: isWinner ? "COMPLETED" : "IN_PROGRESS",
        winnerSide: isWinner,
      },
    });

    let matchData: any = {};
    if (isWinner) {
      const g1 = isWinner === 1 ? match.gamesWon1 + 1 : match.gamesWon1;
      const g2 = isWinner === 2 ? match.gamesWon2 + 1 : match.gamesWon2;
      const required = match.format === "BEST_OF_7" ? 4 : match.format === "BEST_OF_5" ? 3 : 2;
      const matchWinner = g1 >= required ? 1 : g2 >= required ? 2 : null;
      matchData = {
        gamesWon1: g1,
        gamesWon2: g2,
        score1: match.score1 + newScore1,
        score2: match.score2 + newScore2,
        status: matchWinner ? "COMPLETED" : "IN_PROGRESS",
        endedAt: matchWinner ? new Date() : undefined,
      };
    } else {
      matchData = {
        score1: match.score1 + (newScore1 - game.player1Score),
        score2: match.score2 + (newScore2 - game.player2Score),
      };
    }

    const updatedMatch = await d.match.update({ where: { id: match.id }, data: matchData });
    res.json({ game: updatedGame, match: updatedMatch, deuce: deuceMode, isWinner });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/undo", authMiddleware, async (req, res) => {
  try {
    const d = db();
    const match = await d.match.findUnique({ where: { id: req.params.id }, include: { games: true } });
    if (!match) { res.status(404).json({ error: "Not found" }); return; }
    const game = match.games.find((g: any) => g.state === "IN_PROGRESS");
    if (!game || (game.player1Score === 0 && game.player2Score === 0)) { res.status(400).json({ error: "Nothing to undo" }); return; }
    const lastP1 = game.player1Score;
    const lastP2 = game.player2Score;
    const totalPoints = lastP1 + lastP2 - 1;
    const deuceMode = (lastP1 - 1 >= 10 && lastP2 >= 10) || (lastP1 >= 10 && lastP2 - 1 >= 10);
    let server = game.serverSide;
    if (deuceMode) {
      server = totalPoints % 2 === 0 ? server : (server === 1 ? 2 : 1);
    } else {
      server = Math.floor(totalPoints / 2) % 2 === 0 ? game.serverSide : (game.serverSide === 1 ? 2 : 1);
    }
    const updated = await d.game.update({ where: { id: game.id }, data: { player1Score: Math.max(0, lastP1 - 1), player2Score: lastP2 > 0 && lastP1 === 0 ? lastP2 : lastP2, serverSide: server } });
    res.json({ game: updated });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/let", authMiddleware, async (req, res) => {
  try {
    const d = db();
    const game = await d.game.findFirst({ where: { matchId: req.params.id, state: "IN_PROGRESS" } });
    if (!game) { res.status(400).json({ error: "No active game" }); return; }
    const updated = await d.game.update({ where: { id: game.id }, data: { letCount: { increment: 1 } } });
    res.json({ game: updated });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/end", authMiddleware, async (req, res) => {
  try {
    const match = await db().match.update({ where: { id: req.params.id }, data: { status: "COMPLETED", endedAt: new Date() } });
    res.json(match);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── LIVE ───────────────────────────────────────────────────────────────────────

app.get("/api/live/:tournamentId", async (req, res) => {
  const matches = await db().match.findMany({
    where: { tournamentId: req.params.tournamentId, status: "IN_PROGRESS" },
    include: { player1: true, player2: true, team1: true, team2: true, judge: true, games: true },
  });
  res.json(matches);
});

// ─── PUBLIC TOURNAMENT ──────────────────────────────────────────────────────────

app.get("/api/public/tournament/:id", async (req, res) => {
  const tournament = await db().tournament.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, type: true, system: true, format: true, status: true, tablesCount: true, startTime: true },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  const matches = await db().match.findMany({
    where: { tournamentId: req.params.id },
    include: { player1: true, player2: true, group: true },
    orderBy: [{ round: "asc" }, { matchIndex: "asc" }],
  });
  const live = matches.filter((m: any) => m.status === "IN_PROGRESS");
  const recent = matches.filter((m: any) => m.status === "COMPLETED").slice(-10).reverse();
  res.json({ tournament, live, recent, totalMatches: matches.length });
});

app.get("/api/public/tournament/:id/standings", async (req, res) => {
  try {
    const d = db();
    const groups = await d.group.findMany({
      where: { tournamentId: req.params.id },
      include: {
        groupPlayers: { include: { user: { select: { id: true, firstName: true, lastName: true, club: true } } } },
        matches: { include: { player1: true, player2: true } },
      },
    });
    const result = groups.map((g: any) => ({ id: g.id, name: g.name, standings: calculateGroupStandingsLocal(g.matches, g.groupPlayers) }));
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── RATING ─────────────────────────────────────────────────────────────────────

app.get("/api/rating", async (_req, res) => {
  const players = await db().user.findMany({ select: { id: true, firstName: true, lastName: true, club: true, rating: true }, orderBy: { rating: "desc" }, take: 100 });
  res.json(players);
});

export default app;
