import { Router } from "../shared/router";
import { prisma } from "../config/db";

// Substitute for running the SQL migration on a deployment that cannot (Vercel).
// Runs DDL, so it is only reachable with the SETUP_KEY configured on the
// deployment, passed as ?key= or the x-setup-key header; without it, 404.
// server/prisma/migration.sql is the maintained, complete version of this.
export const setupRouter = Router();

setupRouter.get("/", async (req, res) => {
  const key = process.env.SETUP_KEY;
  if (!key || (req.query.key !== key && req.headers["x-setup-key"] !== key)) { res.status(404).json({ error: "Not found" }); return; }
  const d = prisma;
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
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "setsToWin" INTEGER NOT NULL DEFAULT 3`);
    await d.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "setsToWin" INTEGER NOT NULL DEFAULT 3`);
    await d.$executeRawUnsafe(`ALTER TABLE "Tournament" ALTER COLUMN "setsToWin" SET DEFAULT 3`);
    await d.$executeRawUnsafe(`ALTER TABLE "Match" ALTER COLUMN "setsToWin" SET DEFAULT 3`);
    await d.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "eloDelta" INTEGER`);
    await d.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "rating1Before" INTEGER`);
    await d.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "rating2Before" INTEGER`);
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
