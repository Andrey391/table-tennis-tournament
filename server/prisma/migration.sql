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
CREATE INDEX "Match_status_idx" ON "Match"("status");

ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
