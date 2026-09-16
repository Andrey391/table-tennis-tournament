-- Migration: replace the round-robin/group/bracket tournament system with
-- rating-seeded pairs (see CLAUDE.md "Tournament flow").
--
-- WARNING: destructive. This drops the Player, Team, Group, GroupPlayer,
-- Bracket, Game and Rating tables entirely, and recreates Tournament,
-- TournamentUser and Match with a different structure — all existing
-- tournament/roster/match data is lost. Back up first if you need to keep
-- it (e.g. `pg_dump` the affected tables). User, AuditLog and Session are
-- left untouched.
--
-- Assumes the base schema (User table, Role and PlayerStatus enums,
-- AuditLog, Session) is already deployed. If you're starting from a
-- completely empty database instead, run `npx prisma db push` rather
-- than this file — it will create everything from scratch.
--
-- Run by hand against the target database, e.g.:
--   psql "$DATABASE_URL" -f server/prisma/migration.sql
-- or paste into the Supabase SQL editor.
--
-- Safe to re-run: Tournament/TournamentUser/Match are dropped and
-- recreated every time, so if you already applied an earlier version of
-- this file, re-running the latest version picks up new columns (e.g.
-- Match.round) at the cost of wiping tournament/roster/match data again.

BEGIN;

-- Drop tables that no longer exist in the new schema. CASCADE also drops
-- their foreign keys onto Match/Tournament so those can be recreated clean.
DROP TABLE IF EXISTS "Game" CASCADE;
DROP TABLE IF EXISTS "Rating" CASCADE;
DROP TABLE IF EXISTS "GroupPlayer" CASCADE;
DROP TABLE IF EXISTS "Group" CASCADE;
DROP TABLE IF EXISTS "Bracket" CASCADE;
DROP TABLE IF EXISTS "Team" CASCADE;
DROP TABLE IF EXISTS "Player" CASCADE;

-- Tournament, TournamentUser and Match changed shape enough to recreate.
DROP TABLE IF EXISTS "Match" CASCADE;
DROP TABLE IF EXISTS "TournamentUser" CASCADE;
DROP TABLE IF EXISTS "Tournament" CASCADE;

-- Enums no longer used.
DROP TYPE IF EXISTS "TournamentType";
DROP TYPE IF EXISTS "TournamentSystem";
DROP TYPE IF EXISTS "MatchFormat";
DROP TYPE IF EXISTS "MatchType";

-- GameState already covered exactly the states MatchStatus needs
-- (NOT_STARTED / IN_PROGRESS / COMPLETED / CANCELLED) — rename it if it's
-- there, otherwise create MatchStatus fresh (e.g. on an empty database).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GameState') THEN
    ALTER TYPE "GameState" RENAME TO "MatchStatus";
  ELSIF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MatchStatus') THEN
    CREATE TYPE "MatchStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  END IF;
END $$;

-- User keeps its columns; it just needs the indexes the old Player table
-- used to carry.
CREATE INDEX IF NOT EXISTS "User_club_idx" ON "User"("club");
CREATE INDEX IF NOT EXISTS "User_rating_idx" ON "User"("rating");

-- New accounts now start at 300 instead of 1000 (Elo baseline). Existing
-- users' ratings are left as-is — this only changes the default for new rows.
ALTER TABLE "User" ALTER COLUMN "rating" SET DEFAULT 300;

-- Self-service join requests need a pending state before the tournament
-- manager approves them.
ALTER TYPE "PlayerStatus" ADD VALUE IF NOT EXISTS 'PENDING';

-- Tournament: simplified, no type/system/format/group sizing.
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tablesCount" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "minRating" INTEGER,
    "maxRating" INTEGER,
    "organizerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");
CREATE INDEX "Tournament_startTime_idx" ON "Tournament"("startTime");

ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TournamentUser: roster join table, no teamId.
CREATE TABLE "TournamentUser" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seed" INTEGER,
    "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentUser_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TournamentUser_tournamentId_idx" ON "TournamentUser"("tournamentId");
CREATE INDEX "TournamentUser_tournamentId_seed_idx" ON "TournamentUser"("tournamentId", "seed");
CREATE UNIQUE INDEX "TournamentUser_tournamentId_userId_key" ON "TournamentUser"("tournamentId", "userId");

ALTER TABLE "TournamentUser" ADD CONSTRAINT "TournamentUser_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentUser" ADD CONSTRAINT "TournamentUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Match: one match = one game to pointsToWin (11 or 21); player1/player2
-- reference User directly instead of the removed Player model.
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "matchIndex" INTEGER,
    "tableNumber" INTEGER,
    "player1Id" TEXT,
    "player2Id" TEXT,
    "judgeId" TEXT,
    "pointsToWin" INTEGER NOT NULL DEFAULT 11,
    "score1" INTEGER NOT NULL DEFAULT 0,
    "score2" INTEGER NOT NULL DEFAULT 0,
    "serverSide" INTEGER NOT NULL DEFAULT 1,
    "lastScorer" INTEGER,
    "prevServerSide" INTEGER,
    "letCount" INTEGER NOT NULL DEFAULT 0,
    "status" "MatchStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");
CREATE INDEX "Match_tournamentId_round_idx" ON "Match"("tournamentId", "round");
CREATE INDEX "Match_status_idx" ON "Match"("status");

ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table bookings, club subscriptions, per-tournament chat — additive, not part of
-- the drop/recreate group above (no existing data to worry about, safe to reuse).
CREATE TABLE IF NOT EXISTS "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "club" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "tableNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Booking_userId_idx" ON "Booking"("userId");
CREATE INDEX IF NOT EXISTS "Booking_club_date_idx" ON "Booking"("club", "date");
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "club" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_club_key" ON "Subscription"("userId", "club");
CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");
DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChatMessage_tournamentId_idx" ON "ChatMessage"("tournamentId");
DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- Clubs, cities and event scheduling.
--
-- Additive and idempotent: no drops of Tournament/TournamentUser/Match here,
-- so applying this section on top of an already-migrated database keeps all
-- tournament data. It does move Booking.club / Subscription.club (free text)
-- and Booking.tableNumber onto real Club / ClubTable rows, backfilling a club
-- per distinct name found in those columns, then drops the old text columns.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Club_name_city_key" ON "Club"("name", "city");
CREATE INDEX IF NOT EXISTS "Club_city_idx" ON "Club"("city");
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
DO $$ BEGIN
  ALTER TABLE "Club" ADD CONSTRAINT "Club_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ClubTable" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "indoor" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClubTable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClubTable_clubId_number_key" ON "ClubTable"("clubId", "number");
CREATE INDEX IF NOT EXISTS "ClubTable_clubId_idx" ON "ClubTable"("clubId");
DO $$ BEGIN
  ALTER TABLE "ClubTable" ADD CONSTRAINT "ClubTable_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Players get a home city, used by the "near you" event feed.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT;
CREATE INDEX IF NOT EXISTS "User_city_idx" ON "User"("city");

-- Tournaments become schedulable events with a venue and a capacity.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "maxPlayers" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
CREATE INDEX IF NOT EXISTS "Tournament_clubId_idx" ON "Tournament"("clubId");
DO $$ BEGIN
  ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Bookings and subscriptions point at a Club row instead of a free-text name.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "tableId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "clubId" TEXT;

-- Backfill: one Club per distinct name that existing rows referred to. The city
-- is unknown at this point, so it gets a placeholder an admin can correct later.
INSERT INTO "Club" ("id", "name", "city", "updatedAt")
SELECT gen_random_uuid()::text, src."name", 'Не указан', CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "club" AS "name" FROM "Booking" WHERE "club" IS NOT NULL AND "club" <> ''
  UNION
  SELECT DISTINCT "club" AS "name" FROM "Subscription" WHERE "club" IS NOT NULL AND "club" <> ''
) src
ON CONFLICT ("name", "city") DO NOTHING;

UPDATE "Booking" b SET "clubId" = c."id"
FROM "Club" c WHERE b."clubId" IS NULL AND c."name" = b."club";

UPDATE "Subscription" s SET "clubId" = c."id"
FROM "Club" c WHERE s."clubId" IS NULL AND c."name" = s."club";

-- Each table number a booking mentioned becomes a real table at that club.
INSERT INTO "ClubTable" ("id", "clubId", "number")
SELECT gen_random_uuid()::text, b."clubId", b."tableNumber"
FROM (SELECT DISTINCT "clubId", "tableNumber" FROM "Booking" WHERE "clubId" IS NOT NULL AND "tableNumber" IS NOT NULL) b
ON CONFLICT ("clubId", "number") DO NOTHING;

UPDATE "Booking" b SET "tableId" = t."id"
FROM "ClubTable" t
WHERE b."tableId" IS NULL AND t."clubId" = b."clubId" AND t."number" = b."tableNumber";

-- Rows whose club name was blank can't be mapped to a venue; drop them rather
-- than leave a NOT NULL violation behind.
DELETE FROM "Booking" WHERE "clubId" IS NULL;
DELETE FROM "Subscription" WHERE "clubId" IS NULL;

ALTER TABLE "Booking" ALTER COLUMN "clubId" SET NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "clubId" SET NOT NULL;

ALTER TABLE "Booking" DROP COLUMN IF EXISTS "club";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "tableNumber";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "club";

DROP INDEX IF EXISTS "Booking_club_date_idx";
DROP INDEX IF EXISTS "Subscription_userId_club_key";
CREATE INDEX IF NOT EXISTS "Booking_clubId_date_idx" ON "Booking"("clubId", "date");
CREATE INDEX IF NOT EXISTS "Booking_tableId_date_idx" ON "Booking"("tableId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_clubId_key" ON "Subscription"("userId", "clubId");

DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "ClubTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;


COMMIT;
