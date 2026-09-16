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

const playerSelect = { id: true, firstName: true, lastName: true, club: true, rating: true };
const matchInclude = {
  player1: { select: playerSelect },
  player2: { select: playerSelect },
  judge: { select: { id: true, firstName: true, lastName: true } },
  tournament: { select: { organizerId: true } },
};

// Loads the tournament and confirms the caller is the one managing it (its creator).
async function loadOwnedTournament(res: any, tournamentId: string, userId: string) {
  const tournament = await db().tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return null; }
  if (tournament.organizerId !== userId) { res.status(403).json({ error: "Only the tournament manager can do this" }); return null; }
  return tournament;
}

// Loads the match and confirms the caller manages its tournament.
async function loadOwnedMatch(res: any, matchId: string, userId: string) {
  const match = await db().match.findUnique({ where: { id: matchId }, include: { tournament: { select: { organizerId: true } } } });
  if (!match) { res.status(404).json({ error: "Not found" }); return null; }
  if (match.tournament.organizerId !== userId) { res.status(403).json({ error: "Only the tournament manager can record this match" }); return null; }
  return match;
}

function isDeuce(score1: number, score2: number, pointsToWin: number) {
  return score1 >= pointsToWin - 1 && score2 >= pointsToWin - 1;
}
function getMatchWinner(score1: number, score2: number, pointsToWin: number) {
  if (score1 >= pointsToWin && score1 - score2 >= 2) return 1;
  if (score2 >= pointsToWin && score2 - score1 >= 2) return 2;
  return null;
}
function nextServerSide(totalPoints: number, currentServer: number, deuceMode: boolean) {
  const shouldSwitch = deuceMode ? totalPoints % 2 !== 0 : Math.floor(totalPoints / 2) % 2 !== 0;
  return shouldSwitch ? (currentServer === 1 ? 2 : 1) : currentServer;
}

// ─── SCHEMA SETUP ───────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => { res.json({ status: "ok", time: new Date().toISOString() }); });

app.get("/api/setup", async (_req, res) => {
  const d = db();
  const doBlock = (body: string) => `DO $$ BEGIN ${body}; EXCEPTION WHEN duplicate_object THEN null; END $$`;
  try {
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORGANIZER', 'JUDGE', 'PLAYER', 'VIEWER')`));
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "PlayerStatus" AS ENUM ('PENDING', 'REGISTERED', 'WITHDRAWN', 'DISQUALIFIED')`));
    await d.$executeRawUnsafe(doBlock(`CREATE TYPE "MatchStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`));

    const tables = [
      `CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "password" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'PLAYER', "club" TEXT, "rating" INTEGER NOT NULL DEFAULT 1000, "dateOfBirth" TIMESTAMP(3), "phone" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,
      `CREATE TABLE IF NOT EXISTS "Tournament" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "tablesCount" INTEGER NOT NULL DEFAULT 4, "status" TEXT NOT NULL DEFAULT 'DRAFT', "startTime" TIMESTAMP(3), "endTime" TIMESTAMP(3), "organizerId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "TournamentUser" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "seed" INTEGER, "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED', "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TournamentUser_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "TournamentUser_tournamentId_userId_key" ON "TournamentUser"("tournamentId", "userId")`,
      `CREATE TABLE IF NOT EXISTS "Match" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "matchIndex" INTEGER, "tableNumber" INTEGER, "player1Id" TEXT, "player2Id" TEXT, "judgeId" TEXT, "pointsToWin" INTEGER NOT NULL DEFAULT 11, "score1" INTEGER NOT NULL DEFAULT 0, "score2" INTEGER NOT NULL DEFAULT 0, "serverSide" INTEGER NOT NULL DEFAULT 1, "lastScorer" INTEGER, "prevServerSide" INTEGER, "letCount" INTEGER NOT NULL DEFAULT 0, "status" "MatchStatus" NOT NULL DEFAULT 'NOT_STARTED', "startedAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Match_pkey" PRIMARY KEY ("id"))`,
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
    const { email, password, firstName, lastName, club } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    // This endpoint is unauthenticated self-signup, so the role is never taken from
    // the request body (that would let anyone register as ADMIN). Everyone who signs
    // up can organize their own tournaments.
    const user = await db().user.create({ data: { email, password: hashed, firstName, lastName, club, role: "ORGANIZER" } });
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

// ─── PLAYERS ────────────────────────────────────────────────────────────────────

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

app.get("/api/tournaments", async (_req, res) => {
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
      organizer: { select: { id: true, firstName: true, lastName: true } },
      players: { include: { user: { select: playerSelect } }, orderBy: { seed: "asc" } },
      matches: { include: matchInclude, orderBy: [{ matchIndex: "asc" }] },
    },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  res.json(tournament);
});

app.post("/api/tournaments", authMiddleware, async (req: any, res) => {
  try {
    const { name, tablesCount, startTime } = req.body;
    const tournament = await db().tournament.create({ data: { name, tablesCount: tablesCount || 4, startTime, organizerId: req.user.userId } });
    res.status(201).json(tournament);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put("/api/tournaments/:id", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;
    const { name, status, startTime, endTime, tablesCount } = req.body;
    const updated = await db().tournament.update({ where: { id: tournament.id }, data: { name, status, startTime, endTime, tablesCount } });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Manager directly adds already-known players to the roster, pre-approved.
app.post("/api/tournaments/:id/players", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "Roster is locked, cannot add players" }); return; }

    const { userIds } = req.body;
    const d = db();
    const existing = await d.tournamentUser.findMany({ where: { tournamentId: req.params.id }, select: { userId: true } });
    const existingIds = new Set(existing.map((e: any) => e.userId));
    const newUsers = userIds.filter((id: string) => !existingIds.has(id));
    const created = await d.$transaction(newUsers.map((userId: string) => d.tournamentUser.create({ data: { tournamentId: req.params.id, userId, status: "REGISTERED" } })));
    res.status(201).json(created);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Any signed-in user can request to join — the manager has to approve before pairing.
app.post("/api/tournaments/:id/join", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await db().tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "This tournament is no longer accepting participants" }); return; }
    const entry = await db().tournamentUser.create({ data: { tournamentId: req.params.id, userId: req.user.userId, status: "PENDING" } });
    res.status(201).json(entry);
  } catch (e: any) {
    if (e.code === "P2002") { res.status(400).json({ error: "Already requested to join" }); return; }
    res.status(400).json({ error: e.message });
  }
});

// Manager approves a pending join request.
app.post("/api/tournaments/:id/players/:userId/approve", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;
    const updated = await db().tournamentUser.update({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } },
      data: { status: "REGISTERED" },
    });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Manager rejects a pending request or removes an already-approved participant.
app.delete("/api/tournaments/:id/players/:userId", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "Roster is locked, cannot remove players" }); return; }
    await db().tournamentUser.delete({ where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } } });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Locks the roster and pairs approved players by rating: strongest with next-strongest, and so on.
app.post("/api/tournaments/:id/pair", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;
    if (tournament.status !== "DRAFT") { res.status(400).json({ error: "Tournament already paired" }); return; }

    const d = db();
    const players = await d.tournamentUser.findMany({
      where: { tournamentId: tournament.id, status: "REGISTERED" },
      include: { user: { select: { id: true, rating: true } } },
    });
    if (players.length < 2) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }

    const sorted = [...players].sort((a: any, b: any) => (b.user?.rating || 0) - (a.user?.rating || 0));
    await d.$transaction(sorted.map((p: any, idx: number) => d.tournamentUser.update({ where: { id: p.id }, data: { seed: idx + 1 } })));

    const pairs: { player1Id: string; player2Id: string }[] = [];
    for (let i = 0; i + 1 < sorted.length; i += 2) pairs.push({ player1Id: sorted[i].userId, player2Id: sorted[i + 1].userId });
    const bye = sorted.length % 2 === 1 ? sorted[sorted.length - 1] : null;
    const tablesCount = tournament.tablesCount || 1;

    await d.$transaction([
      ...pairs.map((p, idx) => d.match.create({ data: { tournamentId: tournament.id, player1Id: p.player1Id, player2Id: p.player2Id, matchIndex: idx, tableNumber: (idx % tablesCount) + 1 } })),
      d.tournament.update({ where: { id: tournament.id }, data: { status: "ACTIVE" } }),
    ]);

    res.json({ message: "Paired", matches: pairs.length, bye: bye?.userId || null });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/tournaments/:id/standings", async (req, res) => {
  try {
    const d = db();
    const tournament = await d.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        players: { where: { status: "REGISTERED" }, include: { user: { select: playerSelect } } },
        matches: { where: { status: "COMPLETED" }, select: { player1Id: true, player2Id: true, score1: true, score2: true } },
      },
    });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }

    const stats = new Map<string, any>();
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
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── MATCHES ────────────────────────────────────────────────────────────────────

app.get("/api/matches/tournament/:tournamentId", async (req, res) => {
  const matches = await db().match.findMany({ where: { tournamentId: req.params.tournamentId }, include: matchInclude, orderBy: [{ matchIndex: "asc" }] });
  res.json(matches);
});

app.get("/api/matches/:id", async (req, res) => {
  const match = await db().match.findUnique({ where: { id: req.params.id }, include: matchInclude });
  if (!match) { res.status(404).json({ error: "Not found" }); return; }
  res.json(match);
});

app.put("/api/matches/:id", authMiddleware, async (req: any, res) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    if (match.status !== "NOT_STARTED") { res.status(400).json({ error: "Can only change settings before the match starts" }); return; }
    const { pointsToWin, tableNumber, judgeId } = req.body;
    const updated = await db().match.update({ where: { id: match.id }, data: { pointsToWin, tableNumber, judgeId }, include: matchInclude });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/start", authMiddleware, async (req: any, res) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    const updated = await db().match.update({ where: { id: match.id }, data: { status: "IN_PROGRESS", startedAt: new Date(), judgeId: req.user.userId }, include: matchInclude });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/score", authMiddleware, async (req: any, res) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    if (match.status !== "IN_PROGRESS") { res.status(400).json({ error: "Match is not in progress" }); return; }

    const { side } = req.body;
    const score1 = side === 1 ? match.score1 + 1 : match.score1;
    const score2 = side === 2 ? match.score2 + 1 : match.score2;
    const deuce = isDeuce(score1, score2, match.pointsToWin);
    const server = nextServerSide(score1 + score2, match.serverSide, deuce);
    const winner = getMatchWinner(score1, score2, match.pointsToWin);

    const updated = await db().match.update({
      where: { id: match.id },
      data: { score1, score2, serverSide: server, lastScorer: side, prevServerSide: match.serverSide, status: winner ? "COMPLETED" : "IN_PROGRESS", endedAt: winner ? new Date() : undefined },
      include: matchInclude,
    });
    res.json({ match: updated, deuce, winner });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/undo", authMiddleware, async (req: any, res) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    if (!match.lastScorer) { res.status(400).json({ error: "Nothing to undo" }); return; }
    const score1 = match.lastScorer === 1 ? Math.max(match.score1 - 1, 0) : match.score1;
    const score2 = match.lastScorer === 2 ? Math.max(match.score2 - 1, 0) : match.score2;
    const updated = await db().match.update({
      where: { id: match.id },
      data: { score1, score2, serverSide: match.prevServerSide || 1, lastScorer: null, prevServerSide: null, status: "IN_PROGRESS", endedAt: null },
      include: matchInclude,
    });
    res.json({ match: updated });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/let", authMiddleware, async (req: any, res) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    const updated = await db().match.update({ where: { id: match.id }, data: { letCount: { increment: 1 } }, include: matchInclude });
    res.json({ match: updated });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/end", authMiddleware, async (req: any, res) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    const updated = await db().match.update({ where: { id: match.id }, data: { status: "COMPLETED", endedAt: new Date() }, include: matchInclude });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── LIVE ───────────────────────────────────────────────────────────────────────

app.get("/api/live/:tournamentId", async (req, res) => {
  const matches = await db().match.findMany({ where: { tournamentId: req.params.tournamentId, status: "IN_PROGRESS" }, include: matchInclude });
  res.json(matches);
});

// ─── PUBLIC TOURNAMENT ──────────────────────────────────────────────────────────

app.get("/api/public/tournament/:id", async (req, res) => {
  const tournament = await db().tournament.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, status: true, tablesCount: true, startTime: true },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  const matches = await db().match.findMany({ where: { tournamentId: req.params.id }, include: matchInclude, orderBy: [{ matchIndex: "asc" }] });
  const live = matches.filter((m: any) => m.status === "IN_PROGRESS");
  const recent = matches.filter((m: any) => m.status === "COMPLETED").slice(-10).reverse();
  res.json({ tournament, live, recent, totalMatches: matches.length });
});

app.get("/api/public/tournament/:id/standings", async (req, res) => {
  try {
    const d = db();
    const tournament = await d.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        players: { where: { status: "REGISTERED" }, include: { user: { select: playerSelect } } },
        matches: { where: { status: "COMPLETED" }, select: { player1Id: true, player2Id: true, score1: true, score2: true } },
      },
    });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    const stats = new Map<string, any>();
    for (const p of tournament.players) {
      if (!p.user) continue;
      stats.set(p.userId, { userId: p.userId, firstName: p.user.firstName, lastName: p.user.lastName, club: p.user.club, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
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
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── RATING ─────────────────────────────────────────────────────────────────────

app.get("/api/rating", async (_req, res) => {
  const players = await db().user.findMany({ select: { id: true, firstName: true, lastName: true, club: true, rating: true }, orderBy: { rating: "desc" }, take: 100 });
  res.json(players);
});

export default app;
