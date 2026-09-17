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
  tournament: { select: { organizerId: true, kind: true } },
  sets: { orderBy: { index: "asc" as const } },
};

// The set currently being played: the last one that has not finished.
function currentSet<T extends { status: string }>(match: { sets: T[] }): T | null {
  return match.sets.find(x => x.status !== "COMPLETED") ?? null;
}
const reloadMatch = (id: string) => db().match.findUnique({ where: { id }, include: matchInclude });

// Loads the tournament and confirms the caller is the one managing it (its creator).
async function loadOwnedTournament(res: any, tournamentId: string, userId: string) {
  const tournament = await db().tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return null; }
  if (tournament.organizerId !== userId) { res.status(403).json({ error: "Only the tournament manager can do this" }); return null; }
  return tournament;
}

const clubSelect = { id: true, name: true, city: true, address: true, phone: true };
// "9/9 players" counts approved participants only — pending requests don't fill the tournament.
const feedInclude = {
  organizer: { select: { id: true, firstName: true, lastName: true } },
  club: { select: clubSelect },
  _count: { select: { matches: true, players: { where: { status: "REGISTERED" as const } } } },
};
const bookingInclude = {
  club: { select: clubSelect },
  table: { select: { id: true, number: true, indoor: true } },
  tournament: { select: { id: true, kind: true, name: true, status: true } },
};

// Booking times are "HH:MM" plus a duration in hours, so overlap checks work in
// minutes-since-midnight within a single calendar day.
function timeToMinutes(hhmm: string) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}
function bookingsOverlap(startA: string, hoursA: number, startB: string, hoursB: number) {
  const a1 = timeToMinutes(startA), a2 = a1 + Math.round(hoursA * 60);
  const b1 = timeToMinutes(startB), b2 = b1 + Math.round(hoursB * 60);
  return a1 < b2 && b1 < a2;
}
// Bookings are keyed by calendar day; normalise to UTC midnight so "same day"
// doesn't depend on the submitter's timezone.
function startOfUtcDay(date: any) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
// A booking stores the day and the wall-clock start separately. The event it
// creates needs one timestamp, so combine them (and add the duration for the end).
function bookingStartsAt(day: Date, startTime: string) {
  return new Date(day.getTime() + timeToMinutes(startTime) * 60000);
}
function bookingEndsAt(day: Date, startTime: string, durationHours: number) {
  return new Date(bookingStartsAt(day, startTime).getTime() + Math.round(durationHours * 60) * 60000);
}

async function findBookingConflict(tableId: string, date: Date, startTime: string, durationHours: number) {
  const sameDay = await db().booking.findMany({ where: { tableId, date } });
  return sameDay.find((b: any) => bookingsOverlap(startTime, durationHours, b.startTime, b.durationHours)) || null;
}

// Same ownership rule as tournaments: whoever created the club manages it.
async function loadOwnedClub(res: any, clubId: string, userId: string) {
  const club = await db().club.findUnique({ where: { id: clubId } });
  if (!club) { res.status(404).json({ error: "Not found" }); return null; }
  if (club.createdById && club.createdById !== userId) { res.status(403).json({ error: "Only the club's manager can do this" }); return null; }
  return club;
}

// Loads the match and confirms the caller manages its tournament.
async function loadOwnedMatch(res: any, matchId: string, userId: string) {
  const match = await db().match.findUnique({
    where: { id: matchId },
    include: { tournament: { select: { organizerId: true, kind: true } }, sets: { orderBy: { index: "asc" } } },
  });
  if (!match) { res.status(404).json({ error: "Not found" }); return null; }
  if (match.tournament.organizerId !== userId) { res.status(403).json({ error: "Only the tournament manager can record this match" }); return null; }
  return match;
}

// A tournament with no unresolved matches left is done — but the manager can always
// start another round later, which flips it back to ACTIVE (see /pair).
async function maybeCompleteTournament(tournamentId: string) {
  const unresolved = await db().match.count({ where: { tournamentId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } });
  if (unresolved === 0) {
    await db().tournament.updateMany({ where: { id: tournamentId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
  }
}

interface RoundCandidate { userId: string; rating: number; wins: number; matchesPlayed: number }
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

// Round 1: seeded purely by rating. Later rounds: Swiss-style, ranked by wins so
// far (rating breaks ties), with a best-effort pass to avoid repeat pairings.
function generateRoundPairings(candidates: RoundCandidate[], isFirstRound: boolean, playedPairs: Set<string>) {
  const sorted = [...candidates].sort((a, b) => {
    if (!isFirstRound && a.wins !== b.wins) return b.wins - a.wins;
    return b.rating - a.rating;
  });

  let byeUserId: string | null = null;
  if (sorted.length % 2 === 1) {
    // Bye goes to whoever has played the MOST matches so far (sat out the fewest
    // times) — picking the fewest-matches player would give them the bye forever,
    // since sitting out keeps their count lowest. Rating tiebreaks (lowest first).
    let byeIdx = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].matchesPlayed > sorted[byeIdx].matchesPlayed || (sorted[i].matchesPlayed === sorted[byeIdx].matchesPlayed && sorted[i].rating < sorted[byeIdx].rating)) byeIdx = i;
    }
    byeUserId = sorted[byeIdx].userId;
    sorted.splice(byeIdx, 1);
  }

  const ids = sorted.map((c) => c.userId);
  const pairs: { player1Id: string; player2Id: string }[] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push({ player1Id: ids[i], player2Id: ids[i + 1] });

  for (let i = 0; i < pairs.length - 1; i++) {
    if (playedPairs.has(pairKey(pairs[i].player1Id, pairs[i].player2Id))) {
      const next = pairs[i + 1];
      const swappedA = { player1Id: pairs[i].player1Id, player2Id: next.player2Id };
      const swappedB = { player1Id: next.player1Id, player2Id: pairs[i].player2Id };
      if (!playedPairs.has(pairKey(swappedA.player1Id, swappedA.player2Id)) && !playedPairs.has(pairKey(swappedB.player1Id, swappedB.player2Id))) {
        pairs[i] = swappedA;
        pairs[i + 1] = swappedB;
      }
    }
  }

  return { pairs, byeUserId };
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

const ELO_K = 32;
function computeEloDelta(winnerRating: number, loserRating: number, k: number = ELO_K) {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const winnerDelta = Math.round(k * (1 - expectedWinner));
  return { winnerDelta, loserDelta: -winnerDelta };
}

// Updates both players' global rating using the match result (Elo). Called whenever
// a match resolves to COMPLETED with a clear winner.
async function applyEloUpdate(kind: string, winnerId: string | null, loserId: string | null) {
  // A GAME is deliberately unrated; only a TOURNAMENT moves anyone's Elo.
  if (kind !== "TOURNAMENT" || !winnerId || !loserId) return;
  const d = db();
  const [winner, loser] = await Promise.all([
    d.user.findUnique({ where: { id: winnerId }, select: { rating: true } }),
    d.user.findUnique({ where: { id: loserId }, select: { rating: true } }),
  ]);
  if (!winner || !loser) return;
  const { winnerDelta, loserDelta } = computeEloDelta(winner.rating, loser.rating);
  await d.$transaction([
    d.user.update({ where: { id: winnerId }, data: { rating: winner.rating + winnerDelta } }),
    d.user.update({ where: { id: loserId }, data: { rating: Math.max(0, loser.rating + loserDelta) } }),
  ]);
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
      `CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "password" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'PLAYER', "club" TEXT, "rating" INTEGER NOT NULL DEFAULT 100, "dateOfBirth" TIMESTAMP(3), "phone" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,
      `CREATE TABLE IF NOT EXISTS "Tournament" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "tablesCount" INTEGER NOT NULL DEFAULT 4, "status" TEXT NOT NULL DEFAULT 'DRAFT', "startTime" TIMESTAMP(3), "endTime" TIMESTAMP(3), "minRating" INTEGER, "maxRating" INTEGER, "organizerId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "TournamentUser" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "seed" INTEGER, "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED', "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TournamentUser_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "TournamentUser_tournamentId_userId_key" ON "TournamentUser"("tournamentId", "userId")`,
      `CREATE TABLE IF NOT EXISTS "Match" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "round" INTEGER NOT NULL DEFAULT 1, "matchIndex" INTEGER, "tableNumber" INTEGER, "player1Id" TEXT, "player2Id" TEXT, "judgeId" TEXT, "pointsToWin" INTEGER NOT NULL DEFAULT 11, "score1" INTEGER NOT NULL DEFAULT 0, "score2" INTEGER NOT NULL DEFAULT 0, "serverSide" INTEGER NOT NULL DEFAULT 1, "lastScorer" INTEGER, "prevServerSide" INTEGER, "letCount" INTEGER NOT NULL DEFAULT 0, "status" "MatchStatus" NOT NULL DEFAULT 'NOT_STARTED', "startedAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Match_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "AuditLog" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "action" TEXT NOT NULL, "entity" TEXT NOT NULL, "entityId" TEXT, "oldValue" JSONB, "newValue" JSONB, "ip" TEXT, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "Session" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "token" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Session_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token")`,
      `CREATE TABLE IF NOT EXISTS "Booking" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "club" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "startTime" TEXT NOT NULL, "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 1, "tableNumber" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "Subscription" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "club" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_club_key" ON "Subscription"("userId", "club")`,
      `CREATE TABLE IF NOT EXISTS "ChatMessage" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "text" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "Club" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "city" TEXT NOT NULL, "address" TEXT, "phone" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Club_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Club_name_city_key" ON "Club"("name", "city")`,
      `CREATE INDEX IF NOT EXISTS "Club_city_idx" ON "Club"("city")`,
      `CREATE TABLE IF NOT EXISTS "ClubTable" ("id" TEXT NOT NULL, "clubId" TEXT NOT NULL, "number" INTEGER NOT NULL, "indoor" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "ClubTable_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ClubTable_clubId_number_key" ON "ClubTable"("clubId", "number")`,
      `CREATE TABLE IF NOT EXISTS "MatchSet" ("id" TEXT NOT NULL, "matchId" TEXT NOT NULL, "index" INTEGER NOT NULL, "pointsToWin" INTEGER NOT NULL DEFAULT 11, "score1" INTEGER NOT NULL DEFAULT 0, "score2" INTEGER NOT NULL DEFAULT 0, "serverSide" INTEGER NOT NULL DEFAULT 1, "lastScorer" INTEGER, "prevServerSide" INTEGER, "letCount" INTEGER NOT NULL DEFAULT 0, "status" "MatchStatus" NOT NULL DEFAULT 'IN_PROGRESS', "winner" INTEGER, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3), CONSTRAINT "MatchSet_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "MatchSet_matchId_index_key" ON "MatchSet"("matchId", "index")`,
      `CREATE INDEX IF NOT EXISTS "MatchSet_matchId_idx" ON "MatchSet"("matchId")`,
    ];
    for (const t of tables) await d.$executeRawUnsafe(t);
    await d.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "round" INTEGER NOT NULL DEFAULT 1`);
    await d.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "rating" SET DEFAULT 100`);
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "minRating" INTEGER`);
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "maxRating" INTEGER`);
    await d.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT`);
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "description" TEXT`);
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "maxPlayers" INTEGER`);
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "clubId" TEXT`);
    // Moving Booking/Subscription off their old free-text "club" column needs the
    // backfill in server/prisma/migration.sql; this only adds the new columns.
    await d.$executeRawUnsafe(`ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "clubId" TEXT`);
    await d.$executeRawUnsafe(`ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "tableId" TEXT`);
    await d.$executeRawUnsafe(`ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "clubId" TEXT`);
    await d.$executeRawUnsafe(`ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "tournamentId" TEXT`);
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'TOURNAMENT'`);
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "pointsToWin" INTEGER NOT NULL DEFAULT 11`);
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT true`);
    await d.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "RoundBye" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "round" INTEGER NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RoundBye_pkey" PRIMARY KEY ("id"))`);
    await d.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RoundBye_tournamentId_round_key" ON "RoundBye"("tournamentId", "round")`);
    await d.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "setsWon1" INTEGER NOT NULL DEFAULT 0`);
    await d.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "setsWon2" INTEGER NOT NULL DEFAULT 0`);
    await d.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_clubId_key" ON "Subscription"("userId", "clubId")`);
    res.json({ status: "ok", message: "Schema created" });
  } catch (e: any) {
    res.json({ status: "ok", message: e.message?.includes("already exists") ? "Already exists" : "Partial" });
  }
});

// ─── AUTH ───────────────────────────────────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  try {
    const bcrypt = await import("bcryptjs");
    const { email, password, firstName, lastName, club, city } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    // This endpoint is unauthenticated self-signup, so the role is never taken from
    // the request body (that would let anyone register as ADMIN). Everyone who signs
    // up can organize their own tournaments.
    const user = await db().user.create({ data: { email, password: hashed, firstName, lastName, club, city, role: "ORGANIZER" } });
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || "secret", { expiresIn: "24h" });
    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, rating: user.rating, club: user.club } });
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
    const user = await db().user.findUnique({ where: { id: req.user.userId }, select: { id: true, email: true, firstName: true, lastName: true, role: true, club: true, city: true, rating: true, phone: true, dateOfBirth: true } });
    // A self-contained JWT outlives the account it was issued for (e.g. after a
    // database reset). 200 with a null body would leave the client "signed in" as
    // nobody until a later write failed on a foreign key.
    if (!user) { res.status(401).json({ error: "Account no longer exists" }); return; }
    res.json(user);
  } catch { res.status(401).json({ error: "Invalid token" }); }
});

// Play has three levels and the profile reports all three:
//   event (tournament or game) -> match -> set ("партия")
// A match is won on sets; a set is the thing actually played to 11 or 21, which
// is why the short/long split lives at set level.
function summariseMatches(matches: any[], userId: string) {
  const matchTally = { played: 0, wins: 0, losses: 0 };
  const setTally = { played: 0, wins: 0, losses: 0 };
  const byTarget: any = { 11: { played: 0, wins: 0 }, 21: { played: 0, wins: 0 } };

  for (const m of matches) {
    const isP1 = m.player1Id === userId;
    const mine = isP1 ? m.setsWon1 : m.setsWon2;
    const theirs = isP1 ? m.setsWon2 : m.setsWon1;

    matchTally.played++;
    if (mine > theirs) matchTally.wins++;
    else if (theirs > mine) matchTally.losses++;

    for (const set of m.sets || []) {
      if (set.status !== "COMPLETED") continue;
      const won = set.winner === (isP1 ? 1 : 2);
      setTally.played++;
      if (won) setTally.wins++; else setTally.losses++;
      if (!byTarget[String(set.pointsToWin)]) byTarget[String(set.pointsToWin)] = { played: 0, wins: 0 };
      byTarget[String(set.pointsToWin)].played++;
      if (won) byTarget[String(set.pointsToWin)].wins++;
    }
  }
  return { matches: matchTally, sets: setTally, byTarget };
}

app.get("/api/profile/stats", authMiddleware, async (req: any, res) => {
  const d = db();
  const userId = req.user.userId;

  const [events, matches] = await Promise.all([
    // An event someone withdrew from was still an event they took part in.
    d.tournamentUser.findMany({ where: { userId, status: { in: ["REGISTERED", "WITHDRAWN"] } }, select: { tournament: { select: { kind: true } } } }),
    d.match.findMany({
      where: { status: "COMPLETED", OR: [{ player1Id: userId }, { player2Id: userId }] },
      select: {
        player1Id: true, setsWon1: true, setsWon2: true,
        tournament: { select: { kind: true } },
        sets: { select: { score1: true, score2: true, pointsToWin: true, status: true, winner: true } },
      },
    }),
  ]);

  const byKind = (kind: string) => summariseMatches(matches.filter((m: any) => m.tournament.kind === kind), userId);

  res.json({
    events: {
      tournaments: events.filter((e: any) => e.tournament.kind === "TOURNAMENT").length,
      games: events.filter((e: any) => e.tournament.kind === "GAME").length,
    },
    tournaments: byKind("TOURNAMENT"),
    games: byKind("GAME"),
    total: summariseMatches(matches, userId),
  });
});

// ─── PLAYERS ────────────────────────────────────────────────────────────────────

app.get("/api/players", authMiddleware, async (_req, res) => {
  const players = await db().user.findMany({ select: { id: true, email: true, firstName: true, lastName: true, role: true, club: true, rating: true, phone: true, dateOfBirth: true, createdAt: true }, orderBy: { rating: "desc" } });
  res.json(players);
});

// A player edits their own profile. Rating is never client-settable — it only moves
// through Elo after a match — and admins are the only ones who can edit someone else.
// Anyone signed in can open anyone's profile: who they are, how they are doing,
// and the matches behind it — "who did I play last Thursday" had no answer before.
app.get("/api/players/:id", authMiddleware, async (req: any, res) => {
  const d = db();
  const player = await d.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, firstName: true, lastName: true, club: true, city: true, rating: true, createdAt: true },
  });
  if (!player) { res.status(404).json({ error: "Not found" }); return; }

  const matches = await d.match.findMany({
    where: { status: "COMPLETED", OR: [{ player1Id: player.id }, { player2Id: player.id }] },
    include: {
      player1: { select: { id: true, firstName: true, lastName: true, rating: true } },
      player2: { select: { id: true, firstName: true, lastName: true, rating: true } },
      tournament: { select: { id: true, name: true, kind: true } },
      sets: { select: { score1: true, score2: true, status: true }, orderBy: { index: "asc" } },
    },
    orderBy: { endedAt: "desc" },
    take: 25,
  });

  let wins = 0, losses = 0;
  for (const m of matches) {
    const isP1 = m.player1Id === player.id;
    const mine = isP1 ? m.setsWon1 : m.setsWon2;
    const theirs = isP1 ? m.setsWon2 : m.setsWon1;
    if (mine > theirs) wins++; else if (theirs > mine) losses++;
  }
  res.json({ player, matches, recent: { wins, losses } });
});

app.put("/api/players/:id", authMiddleware, async (req: any, res) => {
  try {
    if (req.params.id !== req.user.userId && req.user.role !== "ADMIN") {
      res.status(403).json({ error: "You can only edit your own profile" });
      return;
    }
    const { firstName, lastName, club, city, phone } = req.body;
    const user = await db().user.update({ where: { id: req.params.id }, data: { firstName, lastName, club, city, phone } });
    res.json(user);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── TOURNAMENTS ────────────────────────────────────────────────────────────────

// Event feed. Every filter is optional; with none of them this is the plain
// "all tournaments" list the dashboard used to show.
app.get("/api/tournaments", async (req, res) => {
  const { kind, city, clubId, status, from, to, q } = req.query as Record<string, string | undefined>;
  const tournaments = await db().tournament.findMany({
    where: {
      // Events marked private never appear in this feed; /mine still shows them.
      isPublic: true,
      ...(kind ? { kind } : {}),
      ...(clubId ? { clubId } : {}),
      // An event at a club in that city, or a venue-less one run by someone who
      // lives there — otherwise User.city would decide nothing at all.
      ...(city ? { OR: [{ club: { city } }, { clubId: null, organizer: { city } }] } : {}),
      ...(status ? { status: { in: status.split(",") } } : {}),
      ...(from || to ? { startTime: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    include: feedInclude,
    orderBy: [{ startTime: "asc" }, { createdAt: "desc" }],
  });
  res.json(tournaments);
});

// "My tournaments": everything the caller organises or takes part in, with the
// membership row attached so the client can split pending requests from entries.
app.get("/api/tournaments/mine", authMiddleware, async (req: any, res) => {
  const userId = req.user.userId;
  const kind = typeof req.query.kind === "string" && req.query.kind ? req.query.kind : undefined;
  const tournaments = await db().tournament.findMany({
    where: { ...(kind ? { kind } : {}), OR: [{ organizerId: userId }, { players: { some: { userId } } }] },
    include: { ...feedInclude, players: { where: { userId }, select: { status: true } } },
    orderBy: [{ startTime: "asc" }, { createdAt: "desc" }],
  });
  res.json(tournaments.map(({ players, ...t }: any) => ({ ...t, myStatus: players[0]?.status ?? null, isOrganizer: t.organizerId === userId })));
});

app.get("/api/tournaments/:id", async (req, res) => {
  const tournament = await db().tournament.findUnique({
    where: { id: req.params.id },
    include: {
      organizer: { select: { id: true, firstName: true, lastName: true } },
      club: { select: clubSelect },
      players: { include: { user: { select: playerSelect } }, orderBy: { seed: "asc" } },
      byes: { include: { user: { select: playerSelect } } },
      matches: { include: matchInclude, orderBy: [{ round: "asc" }, { matchIndex: "asc" }] },
    },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  res.json(tournament);
});

app.post("/api/tournaments", authMiddleware, async (req: any, res) => {
  try {
    const d = db();
    const { kind, name, description, tablesCount, maxPlayers, clubId, startTime, endTime, minRating, maxRating } = req.body;
    const tournament = await d.tournament.create({ data: { kind: kind === "GAME" ? "GAME" : "TOURNAMENT", name, description, tablesCount: tablesCount || 4, maxPlayers, clubId, startTime, endTime, minRating, maxRating, organizerId: req.user.userId } });
    // The organiser takes part in their own event.
    await d.tournamentUser.create({ data: { tournamentId: tournament.id, userId: req.user.userId, status: "REGISTERED" } });
    res.status(201).json(tournament);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put("/api/tournaments/:id", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;
    const { name, description, status, startTime, endTime, tablesCount, maxPlayers, clubId, minRating, maxRating, pointsToWin, isPublic } = req.body;
    const updated = await db().tournament.update({ where: { id: tournament.id }, data: { name, description, status, startTime, endTime, tablesCount, maxPlayers, clubId, minRating, maxRating, pointsToWin, isPublic } });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Deletes the event for good. Without this a mistyped tournament (or the event
// that every table booking creates) stayed in the public feed forever, since
// cancelling the booking deliberately leaves its event alone. Nothing cascades on
// its own, so everything pointing at the tournament is cleared in one transaction;
// a booking keeps existing and just loses its event.
app.delete("/api/tournaments/:id", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;
    const d = db();
    await d.$transaction([
      d.booking.updateMany({ where: { tournamentId: tournament.id }, data: { tournamentId: null } }),
      d.chatMessage.deleteMany({ where: { tournamentId: tournament.id } }),
      d.roundBye.deleteMany({ where: { tournamentId: tournament.id } }),
      // MatchSet rows cascade with their match.
      d.match.deleteMany({ where: { tournamentId: tournament.id } }),
      d.tournamentUser.deleteMany({ where: { tournamentId: tournament.id } }),
      d.tournament.delete({ where: { id: tournament.id } }),
    ]);
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Manager directly adds already-known players to the roster, pre-approved.
app.post("/api/tournaments/:id/players", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;

    const { userIds } = req.body;
    const d = db();
    const existing = await d.tournamentUser.findMany({ where: { tournamentId: req.params.id }, select: { userId: true, status: true } });
    const byId = new Map(existing.map((e: any) => [e.userId, e.status]));
    // Someone already REGISTERED is a no-op; a PENDING request or a player who had
    // withdrawn is promoted back onto the roster rather than duplicated.
    const affected = userIds.filter((id: string) => byId.get(id) !== "REGISTERED");
    if (tournament.maxPlayers != null) {
      const taken = existing.filter((e: any) => e.status === "REGISTERED").length;
      if (taken + affected.length > tournament.maxPlayers) {
        res.status(400).json({ error: `Only ${tournament.maxPlayers - taken} of ${tournament.maxPlayers} places left` });
        return;
      }
    }
    const created = await d.$transaction(affected.map((userId: string) => d.tournamentUser.upsert({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId } },
      create: { tournamentId: req.params.id, userId, status: "REGISTERED" },
      update: { status: "REGISTERED" },
    })));
    res.status(201).json(created);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Any signed-in user can request to join (if their rating fits the range) — the
// manager still has to approve before pairing.
app.post("/api/tournaments/:id/join", authMiddleware, async (req: any, res) => {
  try {
    const d = db();
    const tournament = await d.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    // A club night runs Swiss-style and nobody is eliminated, so a latecomer can
    // still be let in between rounds: they simply enter the next pairing with no
    // wins yet. Only a cancelled event is closed for good.
    if (tournament.status === "CANCELLED") { res.status(400).json({ error: "This tournament was cancelled" }); return; }
    const previous = await d.tournamentUser.findUnique({ where: { tournamentId_userId: { tournamentId: tournament.id, userId: req.user.userId } } });
    if (previous && previous.status === "REGISTERED") { res.status(400).json({ error: "You are already taking part" }); return; }

    if (tournament.maxPlayers != null) {
      const taken = await d.tournamentUser.count({ where: { tournamentId: tournament.id, status: "REGISTERED" } });
      if (taken >= tournament.maxPlayers) { res.status(400).json({ error: "This tournament is full" }); return; }
    }

    if (tournament.minRating != null || tournament.maxRating != null) {
      const user = await d.user.findUnique({ where: { id: req.user.userId }, select: { rating: true } });
      const rating = user?.rating ?? 0;
      if ((tournament.minRating != null && rating < tournament.minRating) || (tournament.maxRating != null && rating > tournament.maxRating)) {
        res.status(403).json({ error: `This tournament is for players rated ${tournament.minRating ?? 0}-${tournament.maxRating ?? "∞"}. Your rating: ${rating}` });
        return;
      }
    }

    if (previous) {
      // Withdrawn (or rejected) earlier — turn the existing row back into a request.
      const again = await d.tournamentUser.update({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: req.user.userId } },
        data: { status: "PENDING" },
      });
      res.status(201).json(again);
      return;
    }
    const entry = await d.tournamentUser.create({ data: { tournamentId: req.params.id, userId: req.user.userId, status: "PENDING" } });
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
    if (tournament.maxPlayers != null) {
      const taken = await db().tournamentUser.count({ where: { tournamentId: tournament.id, status: "REGISTERED" } });
      if (taken >= tournament.maxPlayers) { res.status(400).json({ error: "This tournament is full" }); return; }
    }
    const updated = await db().tournamentUser.update({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } },
      data: { status: "REGISTERED" },
    });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Manager rejects a pending request or drops a participant. Before any match has
// been played the row is simply deleted; afterwards the player is marked WITHDRAWN
// instead, which keeps the matches they already played in the standings while
// taking them out of every future pairing.
app.delete("/api/tournaments/:id/players/:userId", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;
    const d = db();
    const played = await d.match.count({
      where: { tournamentId: tournament.id, OR: [{ player1Id: req.params.userId }, { player2Id: req.params.userId }] },
    });
    if (played > 0) {
      await d.tournamentUser.update({
        where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } },
        data: { status: "WITHDRAWN" },
      });
      res.json({ ok: true, withdrawn: true });
      return;
    }
    await d.tournamentUser.delete({ where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.params.userId } } });
    res.json({ ok: true, withdrawn: false });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Generates a new round of pairs: round 1 (DRAFT -> ACTIVE) seeds by rating; every
// later round is Swiss-style, ranked by wins so far. Nobody is eliminated between
// rounds. Can be called again after a tournament auto-completed to keep playing.
app.post("/api/tournaments/:id/pair", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await loadOwnedTournament(res, req.params.id, req.user.userId);
    if (!tournament) return;
    const d = db();

    if (tournament.status === "DRAFT") {
      const rosterCount = await d.tournamentUser.count({ where: { tournamentId: tournament.id, status: "REGISTERED" } });
      if (rosterCount < 2) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }
    } else {
      const unresolved = await d.match.count({ where: { tournamentId: tournament.id, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } });
      if (unresolved > 0) { res.status(400).json({ error: "Finish every match in the current round before starting a new one" }); return; }
    }

    const [players, allMatches] = await Promise.all([
      d.tournamentUser.findMany({ where: { tournamentId: tournament.id, status: "REGISTERED" }, include: { user: { select: { id: true, rating: true } } } }),
      d.match.findMany({ where: { tournamentId: tournament.id }, select: { round: true, player1Id: true, player2Id: true, setsWon1: true, setsWon2: true } }),
    ]);
    if (players.length < 2) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }

    const isFirstRound = allMatches.length === 0;
    const currentRound = allMatches.reduce((max: number, m: any) => Math.max(max, m.round), 0);
    const newRound = currentRound + 1;

    const matchesPerPlayer = new Map<string, number>();
    const winsPerPlayer = new Map<string, number>();
    const playedPairs = new Set<string>();
    for (const m of allMatches) {
      if (!m.player1Id || !m.player2Id) continue;
      matchesPerPlayer.set(m.player1Id, (matchesPerPlayer.get(m.player1Id) || 0) + 1);
      matchesPerPlayer.set(m.player2Id, (matchesPerPlayer.get(m.player2Id) || 0) + 1);
      playedPairs.add(pairKey(m.player1Id, m.player2Id));
      if (m.setsWon1 > m.setsWon2) winsPerPlayer.set(m.player1Id, (winsPerPlayer.get(m.player1Id) || 0) + 1);
      else if (m.setsWon2 > m.setsWon1) winsPerPlayer.set(m.player2Id, (winsPerPlayer.get(m.player2Id) || 0) + 1);
    }

    const candidates: RoundCandidate[] = players.map((p: any) => ({
      userId: p.userId,
      rating: p.user?.rating || 0,
      wins: winsPerPlayer.get(p.userId) || 0,
      matchesPlayed: matchesPerPlayer.get(p.userId) || 0,
    }));

    if (isFirstRound) {
      const sorted = [...candidates].sort((a, b) => b.rating - a.rating);
      await d.$transaction(sorted.map((c, idx) => d.tournamentUser.update({ where: { tournamentId_userId: { tournamentId: tournament.id, userId: c.userId } }, data: { seed: idx + 1 } })));
    }

    const { pairs, byeUserId } = generateRoundPairings(candidates, isFirstRound, playedPairs);
    if (pairs.length === 0) { res.status(400).json({ error: "Need at least 2 approved players" }); return; }

    const tablesCount = tournament.tablesCount || 1;
    await d.$transaction([
      ...pairs.map((p, idx) => d.match.create({ data: { tournamentId: tournament.id, round: newRound, player1Id: p.player1Id, player2Id: p.player2Id, matchIndex: idx, pointsToWin: tournament.pointsToWin, tableNumber: (idx % tablesCount) + 1 } })),
      d.tournament.update({ where: { id: tournament.id }, data: { status: "ACTIVE" } }),
      // Who sat this one out, so the round can say so rather than the client
      // inferring it from "has no match here".
      ...(byeUserId ? [d.roundBye.upsert({
        where: { tournamentId_round: { tournamentId: tournament.id, round: newRound } },
        create: { tournamentId: tournament.id, round: newRound, userId: byeUserId },
        update: { userId: byeUserId },
      })] : []),
    ]);

    res.json({ message: "Paired", round: newRound, matches: pairs.length, bye: byeUserId });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/tournaments/:id/standings", async (req, res) => {
  try {
    const d = db();
    const tournament = await d.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        // Someone who left mid-event keeps the matches they already played.
        players: { where: { status: { in: ["REGISTERED", "WITHDRAWN"] } }, include: { user: { select: playerSelect } } },
        matches: { where: { status: "COMPLETED" }, select: { player1Id: true, player2Id: true, setsWon1: true, setsWon2: true, sets: { select: { score1: true, score2: true, status: true } } } },
      },
    });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }

    const stats = new Map<string, any>();
    for (const pl of tournament.players) {
      if (!pl.user) continue;
      stats.set(pl.userId, { userId: pl.userId, firstName: pl.user.firstName, lastName: pl.user.lastName, club: pl.user.club, rating: pl.user.rating, wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0 });
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
    const result = Array.from(stats.values()).sort((a: any, b: any) =>
      b.wins - a.wins || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst));
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Basic per-tournament message board (polled, not real-time). Manager + approved participants only.
async function assertCanUseChat(res: any, tournamentId: string, userId: string) {
  const d = db();
  const tournament = await d.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return null; }
  if (tournament.organizerId === userId) return tournament;
  const membership = await d.tournamentUser.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } });
  if (!membership || membership.status !== "REGISTERED") { res.status(403).json({ error: "Only participants can use this tournament's chat" }); return null; }
  return tournament;
}

app.get("/api/tournaments/:id/chat", authMiddleware, async (req: any, res) => {
  const tournament = await assertCanUseChat(res, req.params.id, req.user.userId);
  if (!tournament) return;
  const messages = await db().chatMessage.findMany({
    where: { tournamentId: req.params.id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
});

app.post("/api/tournaments/:id/chat", authMiddleware, async (req: any, res) => {
  try {
    const tournament = await assertCanUseChat(res, req.params.id, req.user.userId);
    if (!tournament) return;
    const { text } = req.body;
    const message = await db().chatMessage.create({
      data: { tournamentId: req.params.id, userId: req.user.userId, text },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.status(201).json(message);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── BOOKINGS ───────────────────────────────────────────────────────────────────

app.post("/api/bookings", authMiddleware, async (req: any, res) => {
  try {
    const d = db();
    const { clubId, tableId, date, startTime, durationHours } = req.body;
    if (!clubId || !date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(startTime))) { res.status(400).json({ error: "clubId, date and a HH:MM startTime are required" }); return; }
    const hours = durationHours || 1;
    const club = await d.club.findUnique({ where: { id: clubId } });
    if (!club) { res.status(404).json({ error: "Club not found" }); return; }
    if (tableId) {
      const table = await d.clubTable.findUnique({ where: { id: tableId } });
      if (!table || table.clubId !== club.id) { res.status(400).json({ error: "This table does not belong to the club" }); return; }
    }

    const day = startOfUtcDay(date);

    // Two people cannot hold the same table at overlapping times. Bookings without a
    // specific table are just a note that someone is coming, so they cannot clash.
    if (tableId) {
      const conflict = await findBookingConflict(tableId, day, startTime, hours);
      if (conflict) { res.status(409).json({ error: `Table is already booked from ${conflict.startTime} for ${conflict.durationHours}h` }); return; }
    }

    // The booking and the event it exists for are created together: a half-created
    // pair (a table held for nothing, or an event nobody has a table for) is never
    // a state worth persisting.
    const userId = req.user.userId;
    const isTournament = req.body.eventType === "TOURNAMENT";
    const startsAt = bookingStartsAt(day, startTime);
    const endsAt = bookingEndsAt(day, startTime, hours);
    const title = (req.body.eventTitle || "").trim() || club.name;
    const { pointsToWin, isPublic } = req.body;

    const booking = await d.$transaction(async (tx: any) => {
      // A game and a tournament are the same row; `kind` is the only difference.
      const event = await tx.tournament.create({
        data: {
          kind: isTournament ? "TOURNAMENT" : "GAME", name: title, clubId, startTime: startsAt, endTime: endsAt, organizerId: userId,
          // The "11 / 21" choice on the booking screen is the target its matches
          // get created with, and a private slot stays out of the city feed.
          ...(pointsToWin === 11 || pointsToWin === 21 ? { pointsToWin } : {}),
          ...(isPublic === undefined ? {} : { isPublic: !!isPublic }),
        },
      });
      // The organiser is a participant of their own event from the start.
      await tx.tournamentUser.create({ data: { tournamentId: event.id, userId, status: "REGISTERED" } });

      return tx.booking.create({
        data: {
          userId, clubId, tableId: tableId || null, date: day, startTime, durationHours: hours,
          tournamentId: event.id,
        },
        include: bookingInclude,
      });
    });

    res.status(201).json(booking);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/bookings/mine", authMiddleware, async (req: any, res) => {
  const bookings = await db().booking.findMany({ where: { userId: req.user.userId }, include: bookingInclude, orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  res.json(bookings);
});

app.delete("/api/bookings/:id", authMiddleware, async (req: any, res) => {
  try {
    const booking = await db().booking.findUnique({ where: { id: req.params.id } });
    if (!booking) { res.status(404).json({ error: "Not found" }); return; }
    if (booking.userId !== req.user.userId) { res.status(403).json({ error: "Not your booking" }); return; }
    await db().booking.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────────

app.get("/api/subscriptions/mine", authMiddleware, async (req: any, res) => {
  const subscriptions = await db().subscription.findMany({ where: { userId: req.user.userId }, include: { club: { select: clubSelect } }, orderBy: { createdAt: "desc" } });
  res.json(subscriptions);
});

app.post("/api/subscriptions", authMiddleware, async (req: any, res) => {
  try {
    const d = db();
    const { clubId } = req.body;
    const club = await d.club.findUnique({ where: { id: clubId } });
    if (!club) { res.status(404).json({ error: "Club not found" }); return; }
    const subscription = await d.subscription.create({ data: { userId: req.user.userId, clubId }, include: { club: { select: clubSelect } } });
    res.status(201).json(subscription);
  } catch (e: any) {
    if (e.code === "P2002") { res.status(400).json({ error: "Already subscribed" }); return; }
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/subscriptions/:clubId", authMiddleware, async (req: any, res) => {
  try {
    await db().subscription.delete({ where: { userId_clubId: { userId: req.user.userId, clubId: req.params.clubId } } });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- CLUBS ---------------------------------------------------------------------

app.get("/api/clubs", async (req, res) => {
  const city = typeof req.query.city === "string" && req.query.city ? req.query.city : undefined;
  const q = typeof req.query.q === "string" && req.query.q ? req.query.q : undefined;
  const clubs = await db().club.findMany({
    where: { ...(city ? { city } : {}), ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
    include: { _count: { select: { tables: true, subscriptions: true, tournaments: true } } },
    orderBy: [{ city: "asc" }, { name: "asc" }],
  });
  res.json(clubs);
});

// Powers the "your city" picker on the home screen - must stay above "/api/clubs/:id".
app.get("/api/clubs/cities", async (_req, res) => {
  const rows = await db().club.groupBy({ by: ["city"], _count: { _all: true }, orderBy: { city: "asc" } });
  res.json(rows.map((r: any) => ({ city: r.city, clubs: r._count._all })));
});

app.get("/api/clubs/:id", async (req, res) => {
  const club = await db().club.findUnique({
    where: { id: req.params.id },
    include: { tables: { orderBy: { number: "asc" } }, _count: { select: { subscriptions: true } } },
  });
  if (!club) { res.status(404).json({ error: "Not found" }); return; }
  res.json(club);
});

// Which tables are free on a given day, and what is already taken - the booking screen
// uses this to grey out slots instead of letting the user submit a clashing booking.
app.get("/api/clubs/:id/availability", async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  if (!date) { res.status(400).json({ error: "date is required" }); return; }
  const d = db();
  const day = startOfUtcDay(date);
  const [tables, bookings] = await Promise.all([
    d.clubTable.findMany({ where: { clubId: req.params.id }, orderBy: { number: "asc" } }),
    d.booking.findMany({ where: { clubId: req.params.id, date: day }, select: { tableId: true, startTime: true, durationHours: true } }),
  ]);
  res.json(tables.map((t: any) => ({
    ...t,
    busy: bookings.filter((b: any) => b.tableId === t.id).map((b: any) => ({ startTime: b.startTime, durationHours: b.durationHours })),
  })));
});

app.post("/api/clubs", authMiddleware, async (req: any, res) => {
  try {
    const { name, city, address, phone } = req.body;
    if (!name || !city) { res.status(400).json({ error: "name and city are required" }); return; }
    const club = await db().club.create({ data: { name, city, address, phone, createdById: req.user.userId } });
    res.status(201).json(club);
  } catch (e: any) {
    if (e.code === "P2002") { res.status(400).json({ error: "A club with this name already exists in this city" }); return; }
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/clubs/:id", authMiddleware, async (req: any, res) => {
  try {
    const club = await loadOwnedClub(res, req.params.id, req.user.userId);
    if (!club) return;
    const { name, city, address, phone } = req.body;
    const updated = await db().club.update({ where: { id: club.id }, data: { name, city, address, phone } });
    res.json(updated);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/clubs/:id/tables", authMiddleware, async (req: any, res) => {
  try {
    const club = await loadOwnedClub(res, req.params.id, req.user.userId);
    if (!club) return;
    const { number, indoor } = req.body;
    const table = await db().clubTable.create({ data: { clubId: club.id, number, indoor: indoor !== false } });
    res.status(201).json(table);
  } catch (e: any) {
    if (e.code === "P2002") { res.status(400).json({ error: "This table number already exists at the club" }); return; }
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/clubs/:id/tables/:tableId", authMiddleware, async (req: any, res) => {
  try {
    const club = await loadOwnedClub(res, req.params.id, req.user.userId);
    if (!club) return;
    const d = db();
    const table = await d.clubTable.findUnique({ where: { id: req.params.tableId } });
    if (!table || table.clubId !== club.id) { res.status(404).json({ error: "Not found" }); return; }
    await d.clubTable.delete({ where: { id: table.id } });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── MATCHES ────────────────────────────────────────────────────────────────────

// Ends a match and settles the result. There is no fixed number of sets: whoever
// won more of them takes the match, and an equal tally is a draw that moves
// nobody's rating.
async function finishMatch(match: any) {
  const d = db();
  await d.match.update({
    where: { id: match.id },
    data: { status: "COMPLETED", startedAt: match.startedAt || new Date(), endedAt: new Date() },
  });
  // Abandon a set that was still open when the judge ended the match.
  await d.matchSet.updateMany({
    where: { matchId: match.id, status: { not: "COMPLETED" } },
    data: { status: "CANCELLED", endedAt: new Date() },
  });
  if (match.setsWon1 !== match.setsWon2) {
    const p1Won = match.setsWon1 > match.setsWon2;
    await applyEloUpdate(match.tournament.kind, p1Won ? match.player1Id : match.player2Id, p1Won ? match.player2Id : match.player1Id);
  }
  await maybeCompleteTournament(match.tournamentId);
}

app.get("/api/matches/tournament/:tournamentId", async (req, res) => {
  const matches = await db().match.findMany({ where: { tournamentId: req.params.tournamentId }, include: matchInclude, orderBy: [{ round: "asc" }, { matchIndex: "asc" }] });
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
    await db().match.update({ where: { id: match.id }, data: { pointsToWin, tableNumber, judgeId } });
    res.json(await reloadMatch(match.id));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Starting a match opens its first set.
app.post("/api/matches/:id/start", authMiddleware, async (req: any, res) => {
  try {
    const d = db();
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    await d.$transaction([
      d.match.update({
        where: { id: match.id },
        data: { status: "IN_PROGRESS", startedAt: match.startedAt || new Date(), judgeId: req.user.userId },
      }),
      ...(match.sets.length === 0
        ? [d.matchSet.create({ data: { matchId: match.id, index: 1, pointsToWin: match.pointsToWin } })]
        : []),
    ]);
    res.json(await reloadMatch(match.id));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Scores a point in the current set. Finishing a set does NOT finish the match —
// the next set opens straight away and the judge decides when to stop.
app.post("/api/matches/:id/score", authMiddleware, async (req: any, res) => {
  try {
    const d = db();
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    if (match.status !== "IN_PROGRESS") { res.status(400).json({ error: "Match is not in progress" }); return; }
    const set = currentSet(match);
    if (!set) { res.status(400).json({ error: "No set in progress" }); return; }

    const { side } = req.body;
    if (side !== 1 && side !== 2) { res.status(400).json({ error: "side must be 1 or 2" }); return; }
    const score1 = side === 1 ? set.score1 + 1 : set.score1;
    const score2 = side === 2 ? set.score2 + 1 : set.score2;
    const deuce = isDeuce(score1, score2, set.pointsToWin);
    const server = nextServerSide(score1 + score2, set.serverSide, deuce);
    const setWinner = getMatchWinner(score1, score2, set.pointsToWin);

    await d.matchSet.update({
      where: { id: set.id },
      data: {
        score1, score2, serverSide: server, lastScorer: side, prevServerSide: set.serverSide,
        status: setWinner ? "COMPLETED" : "IN_PROGRESS",
        winner: setWinner,
        endedAt: setWinner ? new Date() : null,
      },
    });

    if (setWinner) {
      await d.$transaction([
        d.match.update({
          where: { id: match.id },
          data: setWinner === 1 ? { setsWon1: { increment: 1 } } : { setsWon2: { increment: 1 } },
        }),
        d.matchSet.create({ data: { matchId: match.id, index: set.index + 1, pointsToWin: match.pointsToWin } }),
      ]);
    }

    res.json({ match: await reloadMatch(match.id), deuce, setWinner });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Reverses exactly one point in the current set. If that set only exists because
// the previous one just ended, step back into the previous set and reopen it.
app.post("/api/matches/:id/undo", authMiddleware, async (req: any, res) => {
  try {
    const d = db();
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;

    const open = currentSet(match);
    const target = open && open.lastScorer != null
      ? open
      : [...match.sets].reverse().find((x: any) => x.status === "COMPLETED" && x.lastScorer != null) || null;
    if (!target) { res.status(400).json({ error: "Nothing to undo" }); return; }

    const reopening = target.status === "COMPLETED";
    const ops: any[] = [
      d.matchSet.update({
        where: { id: target.id },
        data: {
          score1: target.lastScorer === 1 ? Math.max(target.score1 - 1, 0) : target.score1,
          score2: target.lastScorer === 2 ? Math.max(target.score2 - 1, 0) : target.score2,
          serverSide: target.prevServerSide ?? target.serverSide,
          lastScorer: null, prevServerSide: null,
          status: "IN_PROGRESS", winner: null, endedAt: null,
        },
      }),
    ];
    if (reopening) {
      ops.push(d.match.update({
        where: { id: match.id },
        data: target.winner === 1 ? { setsWon1: { decrement: 1 } } : { setsWon2: { decrement: 1 } },
      }));
      if (open && open.id !== target.id && open.score1 === 0 && open.score2 === 0) {
        ops.push(d.matchSet.delete({ where: { id: open.id } }));
      }
    }
    await d.$transaction(ops);
    res.json({ match: await reloadMatch(match.id) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/let", authMiddleware, async (req: any, res) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    const set = currentSet(match);
    if (!set) { res.status(400).json({ error: "No set in progress" }); return; }
    await db().matchSet.update({ where: { id: set.id }, data: { letCount: { increment: 1 } } });
    res.json({ match: await reloadMatch(match.id) });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/matches/:id/end", authMiddleware, async (req: any, res) => {
  try {
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    await finishMatch(match);
    res.json(await reloadMatch(match.id));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Marks a no-show: the other side wins by walkover. Works from any state up to
// COMPLETED, so a match that never even started doesn't block the round forever.
app.post("/api/matches/:id/forfeit", authMiddleware, async (req: any, res) => {
  try {
    const d = db();
    const match = await loadOwnedMatch(res, req.params.id, req.user.userId);
    if (!match) return;
    if (match.status === "COMPLETED") { res.status(400).json({ error: "Match is already completed" }); return; }

    const { loserSide } = req.body;
    if (loserSide !== 1 && loserSide !== 2) { res.status(400).json({ error: "loserSide must be 1 or 2" }); return; }

    // A walkover is recorded as a single set to the target score, so the sets
    // tally and the per-set stats stay consistent with a played match.
    const nextIndex = match.sets.length ? Math.max(...match.sets.map((x: any) => x.index)) + 1 : 1;
    const open = currentSet(match);
    await d.$transaction([
      ...(open ? [d.matchSet.delete({ where: { id: open.id } })] : []),
      d.matchSet.create({
        data: {
          matchId: match.id,
          index: open ? open.index : nextIndex,
          pointsToWin: match.pointsToWin,
          score1: loserSide === 1 ? 0 : match.pointsToWin,
          score2: loserSide === 2 ? 0 : match.pointsToWin,
          status: "COMPLETED",
          winner: loserSide === 1 ? 2 : 1,
          endedAt: new Date(),
        },
      }),
      d.match.update({
        where: { id: match.id },
        data: loserSide === 1 ? { setsWon2: { increment: 1 } } : { setsWon1: { increment: 1 } },
      }),
    ]);

    const settled = await d.match.findUnique({ where: { id: match.id }, include: { tournament: { select: { kind: true } } } });
    if (settled) await finishMatch(settled);
    res.json(await reloadMatch(match.id));
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
    select: { id: true, kind: true, name: true, status: true, tablesCount: true, startTime: true, endTime: true, club: { select: clubSelect } },
  });
  if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
  const matches = await db().match.findMany({ where: { tournamentId: req.params.id }, include: matchInclude, orderBy: [{ round: "asc" }, { matchIndex: "asc" }] });
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
        // Someone who left mid-event keeps the matches they already played.
        players: { where: { status: { in: ["REGISTERED", "WITHDRAWN"] } }, include: { user: { select: playerSelect } } },
        matches: { where: { status: "COMPLETED" }, select: { player1Id: true, player2Id: true, setsWon1: true, setsWon2: true, sets: { select: { score1: true, score2: true, status: true } } } },
      },
    });
    if (!tournament) { res.status(404).json({ error: "Not found" }); return; }
    const stats = new Map<string, any>();
    for (const pl of tournament.players) {
      if (!pl.user) continue;
      stats.set(pl.userId, { userId: pl.userId, firstName: pl.user.firstName, lastName: pl.user.lastName, club: pl.user.club, rating: pl.user.rating, wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0 });
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
    const result = Array.from(stats.values()).sort((a: any, b: any) =>
      b.wins - a.wins || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst));
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── RATING ─────────────────────────────────────────────────────────────────────

app.get("/api/rating", async (_req, res) => {
  const players = await db().user.findMany({ select: { id: true, firstName: true, lastName: true, club: true, rating: true }, orderBy: { rating: "desc" }, take: 100 });
  res.json(players);
});

export default app;
