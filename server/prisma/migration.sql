-- Migration: bring an existing database up to the current schema
-- (server/prisma/schema.prisma) WITHOUT losing data.
--
-- THIS IS THE ONE TO RUN. It only adds: new tables, new columns, new indexes
-- and new foreign keys, each guarded so re-running it is harmless. Nothing is
-- dropped except the two legacy free-text club columns, and those are only
-- touched after their contents have been migrated onto real Club rows.
--
-- It does not care how far behind the database is. Applying it to a schema
-- from any earlier point brings it to the current one:
--   * Club / ClubTable tables, Tournament.kind, MatchSet (sets within a match)
--   * User.city, Tournament.description/maxPlayers/clubId
--   * Booking.clubId/tableId/tournamentId, Subscription.clubId
--   * starting rating default of 100
--
-- For a deliberate clean slate instead, use migration-reset.sql — that one
-- drops every table and recreates them empty.
--
-- The whole file is one transaction: if any statement fails, nothing is
-- applied and the database is left exactly as it was.
--
-- Run by hand against the target database, e.g.:
--   psql "$DATABASE_URL" -f server/prisma/migration.sql
-- or paste into the Supabase SQL editor.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enums. Created if missing; PENDING was added to PlayerStatus when
--    self-service join requests arrived.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORGANIZER', 'JUDGE', 'PLAYER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PlayerStatus" AS ENUM ('PENDING', 'REGISTERED', 'WITHDRAWN', 'DISQUALIFIED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MatchStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TYPE "PlayerStatus" ADD VALUE IF NOT EXISTS 'PENDING';

-- ---------------------------------------------------------------------------
-- 2. Players: home city, and the current starting rating.
--    Existing ratings are left alone — this only changes the default for rows
--    inserted from now on.
-- ---------------------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT;
CREATE INDEX IF NOT EXISTS "User_city_idx" ON "User"("city");
CREATE INDEX IF NOT EXISTS "User_club_idx" ON "User"("club");
CREATE INDEX IF NOT EXISTS "User_rating_idx" ON "User"("rating");
ALTER TABLE "User" ALTER COLUMN "rating" SET DEFAULT 100;

-- ---------------------------------------------------------------------------
-- 3. Clubs and their tables.
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
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Club_name_city_key" ON "Club"("name", "city");
CREATE INDEX IF NOT EXISTS "Club_city_idx" ON "Club"("city");
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

-- ---------------------------------------------------------------------------
-- 4. Tournaments become schedulable events with a venue and a capacity.
-- ---------------------------------------------------------------------------

ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "maxPlayers" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
CREATE INDEX IF NOT EXISTS "Tournament_clubId_idx" ON "Tournament"("clubId");
DO $$ BEGIN
  ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 5. Bookings and subscriptions: point at a Club row, and record the event the
--    booking was made for.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT,
    "tableId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "gameId" TEXT,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "tableId" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "tournamentId" TEXT;

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "clubId" TEXT;

-- Legacy shape only: Booking.club / Subscription.club held a free-text club
-- name and Booking.tableNumber an integer. Turn each distinct name into a real
-- Club row, map the rows onto it, then drop the old columns. Skipped entirely
-- on a database that never had them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Booking' AND column_name = 'club')
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Subscription' AND column_name = 'club') THEN

    -- The city isn't recoverable from a bare name, so it gets a placeholder an
    -- admin can correct afterwards.
    EXECUTE $backfill$
      INSERT INTO "Club" ("id", "name", "city", "updatedAt")
      SELECT gen_random_uuid()::text, src."name", 'Не указан', CURRENT_TIMESTAMP
      FROM (
        SELECT DISTINCT "club" AS "name" FROM "Booking" WHERE "club" IS NOT NULL AND "club" <> ''
        UNION
        SELECT DISTINCT "club" AS "name" FROM "Subscription" WHERE "club" IS NOT NULL AND "club" <> ''
      ) src
      ON CONFLICT ("name", "city") DO NOTHING
    $backfill$;

    EXECUTE 'UPDATE "Booking" b SET "clubId" = c."id" FROM "Club" c WHERE b."clubId" IS NULL AND c."name" = b."club"';
    EXECUTE 'UPDATE "Subscription" s SET "clubId" = c."id" FROM "Club" c WHERE s."clubId" IS NULL AND c."name" = s."club"';

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Booking' AND column_name = 'tableNumber') THEN
      EXECUTE $tables$
        INSERT INTO "ClubTable" ("id", "clubId", "number")
        SELECT gen_random_uuid()::text, b."clubId", b."tableNumber"
        FROM (SELECT DISTINCT "clubId", "tableNumber" FROM "Booking" WHERE "clubId" IS NOT NULL AND "tableNumber" IS NOT NULL) b
        ON CONFLICT ("clubId", "number") DO NOTHING
      $tables$;
      EXECUTE 'UPDATE "Booking" b SET "tableId" = t."id" FROM "ClubTable" t WHERE b."tableId" IS NULL AND t."clubId" = b."clubId" AND t."number" = b."tableNumber"';
    END IF;

    -- A blank club name can't be mapped to a venue.
    EXECUTE 'DELETE FROM "Booking" WHERE "clubId" IS NULL';
    EXECUTE 'DELETE FROM "Subscription" WHERE "clubId" IS NULL';

    EXECUTE 'ALTER TABLE "Booking" DROP COLUMN IF EXISTS "club"';
    EXECUTE 'ALTER TABLE "Booking" DROP COLUMN IF EXISTS "tableNumber"';
    EXECUTE 'ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "club"';
    EXECUTE 'DROP INDEX IF EXISTS "Booking_club_date_idx"';
    EXECUTE 'DROP INDEX IF EXISTS "Subscription_userId_club_key"';
  END IF;
END $$;

-- clubId can only be made mandatory once nothing is left without one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Booking" WHERE "clubId" IS NULL) THEN
    EXECUTE 'ALTER TABLE "Booking" ALTER COLUMN "clubId" SET NOT NULL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Subscription" WHERE "clubId" IS NULL) THEN
    EXECUTE 'ALTER TABLE "Subscription" ALTER COLUMN "clubId" SET NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Booking_userId_idx" ON "Booking"("userId");
CREATE INDEX IF NOT EXISTS "Booking_clubId_date_idx" ON "Booking"("clubId", "date");
CREATE INDEX IF NOT EXISTS "Booking_tableId_date_idx" ON "Booking"("tableId", "date");
CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_clubId_key" ON "Subscription"("userId", "clubId");

DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "ClubTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
-- Cancelling a booking leaves its event alone; deleting an event just detaches it.
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 6. Per-tournament chat, created here for databases that predate it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChatMessage_tournamentId_idx" ON "ChatMessage"("tournamentId");

-- A chat message whose tournament is gone would block the foreign key below.
DELETE FROM "ChatMessage" WHERE "tournamentId" NOT IN (SELECT "id" FROM "Tournament");

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 7. Three levels of play: event (tournament or game) -> match -> set.
--
--    A "game" is a tournament that isn't rated, so it is the same table with a
--    different `kind`. A match is no longer a single game to 11/21: it holds a
--    run of sets, and whoever won more of them takes the match.
-- ---------------------------------------------------------------------------

ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'TOURNAMENT';
CREATE INDEX IF NOT EXISTS "Tournament_kind_status_idx" ON "Tournament"("kind", "status");

ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "setsWon1" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "setsWon2" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "MatchSet" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "pointsToWin" INTEGER NOT NULL DEFAULT 11,
    "score1" INTEGER NOT NULL DEFAULT 0,
    "score2" INTEGER NOT NULL DEFAULT 0,
    "serverSide" INTEGER NOT NULL DEFAULT 1,
    "lastScorer" INTEGER,
    "prevServerSide" INTEGER,
    "letCount" INTEGER NOT NULL DEFAULT 0,
    "status" "MatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "winner" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "MatchSet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MatchSet_matchId_index_key" ON "MatchSet"("matchId", "index");
CREATE INDEX IF NOT EXISTS "MatchSet_matchId_idx" ON "MatchSet"("matchId");
DO $$ BEGIN
  ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Every match played under the old model was exactly one set. Move its score
-- into a MatchSet row so nothing is lost, then drop the per-point columns that
-- now live on the set. Skipped on a database that never had them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Match' AND column_name = 'score1') THEN

    EXECUTE $sets$
      INSERT INTO "MatchSet" ("id", "matchId", "index", "pointsToWin", "score1", "score2", "serverSide", "lastScorer", "prevServerSide", "letCount", "status", "winner", "startedAt", "endedAt")
      SELECT
        gen_random_uuid()::text, m."id", 1, m."pointsToWin", m."score1", m."score2", m."serverSide",
        m."lastScorer", m."prevServerSide", m."letCount",
        CASE WHEN m."status" = 'COMPLETED' THEN 'COMPLETED'::"MatchStatus" ELSE 'IN_PROGRESS'::"MatchStatus" END,
        CASE WHEN m."status" = 'COMPLETED' AND m."score1" > m."score2" THEN 1
             WHEN m."status" = 'COMPLETED' AND m."score2" > m."score1" THEN 2
             ELSE NULL END,
        COALESCE(m."startedAt", m."createdAt"), m."endedAt"
      FROM "Match" m
      WHERE m."status" <> 'NOT_STARTED'
        AND NOT EXISTS (SELECT 1 FROM "MatchSet" s WHERE s."matchId" = m."id")
    $sets$;

    EXECUTE $tally$
      UPDATE "Match" m SET
        "setsWon1" = CASE WHEN m."status" = 'COMPLETED' AND m."score1" > m."score2" THEN 1 ELSE 0 END,
        "setsWon2" = CASE WHEN m."status" = 'COMPLETED' AND m."score2" > m."score1" THEN 1 ELSE 0 END
      WHERE m."status" = 'COMPLETED'
    $tally$;

    EXECUTE 'ALTER TABLE "Match" DROP COLUMN IF EXISTS "score1"';
    EXECUTE 'ALTER TABLE "Match" DROP COLUMN IF EXISTS "score2"';
    EXECUTE 'ALTER TABLE "Match" DROP COLUMN IF EXISTS "serverSide"';
    EXECUTE 'ALTER TABLE "Match" DROP COLUMN IF EXISTS "lastScorer"';
    EXECUTE 'ALTER TABLE "Match" DROP COLUMN IF EXISTS "prevServerSide"';
    EXECUTE 'ALTER TABLE "Match" DROP COLUMN IF EXISTS "letCount"';
  END IF;
END $$;

-- 12. The event carries the target score its matches are created with, so the
-- "11 / 21" choice made when booking a table is actually honoured.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "pointsToWin" INTEGER NOT NULL DEFAULT 11;


-- 13. An event can stay out of the public feed, and the round a player sat out is
-- recorded rather than guessed from "has no match this round".
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ip" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "RoundBye" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundBye_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RoundBye_tournamentId_round_key" ON "RoundBye"("tournamentId", "round");
CREATE INDEX IF NOT EXISTS "RoundBye_tournamentId_idx" ON "RoundBye"("tournamentId");
DO $$ BEGIN
  ALTER TABLE "RoundBye" ADD CONSTRAINT "RoundBye_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RoundBye" ADD CONSTRAINT "RoundBye_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 14. Matches finish themselves. Everything that counts — profile tallies,
-- standings, Elo — reads COMPLETED matches, and completing one used to need the
-- judge to remember a button that has no equivalent at the table.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "setsToWin" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "setsToWin" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "eloDelta" INTEGER;


-- NOTE: an earlier iteration of this branch had a standalone "Game" table and a
-- "Booking"."gameId" column. Games are Tournament rows now, so neither is used
-- any more. They are deliberately left in place rather than dropped: nothing
-- reads them, and dropping a table is not something a data-preserving migration
-- should do behind your back. Remove them by hand once you have checked they
-- hold nothing you want.


COMMIT;
