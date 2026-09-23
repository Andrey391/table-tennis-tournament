-- Migration: full reset to the current schema (server/prisma/schema.prisma).
--
-- IF YOU JUST WANT TO UPGRADE A DATABASE, THIS IS THE WRONG FILE. Run
-- server/prisma/migration.sql instead: it adds every new table and column
-- without touching your data. Use this one only when a clean slate is what
-- you actually want.
--
-- WARNING: DESTRUCTIVE AND DELIBERATE. This drops every application table and
-- recreates them empty. All users, tournaments, rosters, matches, bookings,
-- subscriptions and chat messages are lost. There is no backfill and nothing
-- is preserved. Back up first if you ever need any of it (`pg_dump`).
--
-- It does not care what state the database is currently in: every drop is
-- IF EXISTS + CASCADE and every type is recreated, so it works on an empty
-- database, on a half-migrated one, and on one still carrying the removed
-- Player/Team/Group/Bracket/Game tables. Safe to re-run at any time, at the
-- cost of wiping the data again.
--
-- The whole file is one transaction: if any statement fails, nothing is
-- applied and the database is left exactly as it was.
--
-- Run by hand against the target database, e.g.:
--   psql "$DATABASE_URL" -f server/prisma/migration-reset.sql
-- or paste into the Supabase SQL editor.
--
-- After it succeeds, seed a first account with:
--   npx tsx server/prisma/seed.ts

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop everything, children first. CASCADE also removes foreign keys
--    pointing at these tables from anything left behind.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "PasswordReset" CASCADE;
DROP TABLE IF EXISTS "Notification" CASCADE;
DROP TABLE IF EXISTS "ChatMessage" CASCADE;
DROP TABLE IF EXISTS "MatchSet" CASCADE;
DROP TABLE IF EXISTS "Game" CASCADE;
DROP TABLE IF EXISTS "Match" CASCADE;
DROP TABLE IF EXISTS "RoundBye" CASCADE;
DROP TABLE IF EXISTS "TournamentUser" CASCADE;
DROP TABLE IF EXISTS "Tournament" CASCADE;
DROP TABLE IF EXISTS "Booking" CASCADE;
DROP TABLE IF EXISTS "Subscription" CASCADE;
DROP TABLE IF EXISTS "ClubTable" CASCADE;
DROP TABLE IF EXISTS "Club" CASCADE;
DROP TABLE IF EXISTS "AuditLog" CASCADE;
DROP TABLE IF EXISTS "Session" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- Tables from the old round-robin/bracket model, gone from the schema. (The
-- current "Game" is a different, unrelated model and is dropped above.)
DROP TABLE IF EXISTS "Rating" CASCADE;
DROP TABLE IF EXISTS "GroupPlayer" CASCADE;
DROP TABLE IF EXISTS "Group" CASCADE;
DROP TABLE IF EXISTS "Bracket" CASCADE;
DROP TABLE IF EXISTS "Team" CASCADE;
DROP TABLE IF EXISTS "Player" CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Enums. Dropped and recreated so their values always match the schema.
-- ---------------------------------------------------------------------------

DROP TYPE IF EXISTS "Role";
DROP TYPE IF EXISTS "PlayerStatus";
DROP TYPE IF EXISTS "MatchStatus";
DROP TYPE IF EXISTS "GameState";
DROP TYPE IF EXISTS "TournamentType";
DROP TYPE IF EXISTS "TournamentSystem";
DROP TYPE IF EXISTS "MatchFormat";
DROP TYPE IF EXISTS "MatchType";

CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORGANIZER', 'JUDGE', 'PLAYER', 'VIEWER');
CREATE TYPE "PlayerStatus" AS ENUM ('PENDING', 'REGISTERED', 'WITHDRAWN', 'DISQUALIFIED');
CREATE TYPE "MatchStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'REFUNDED');

-- ---------------------------------------------------------------------------
-- 3. Tables, parents first.
--
--    "updatedAt" columns carry DEFAULT CURRENT_TIMESTAMP. Prisma always sets
--    them itself, but the default keeps hand-written INSERTs and the SQL
--    editor from failing on a NOT NULL column.
-- ---------------------------------------------------------------------------

-- The login account and the tournament participant are the same row: Match
-- references User directly, there is no separate Player model.
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "club" TEXT,
    "city" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT,
    -- A throwaway "try the app" account, or one of the sparring partners of its
    -- demo event. Hidden from the rating list and the leaderboards; the whole set
    -- is deleted once "demoExpiresAt" passes, and claiming the account clears it.
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "demoOwnerId" TEXT,
    "demoExpiresAt" TIMESTAMP(3),
    -- Personal-data consent (152-FZ), public-name consent and account deletion.
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "publicProfile" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_club_idx" ON "User"("club");
CREATE INDEX "User_city_idx" ON "User"("city");
CREATE INDEX "User_rating_idx" ON "User"("rating");
CREATE INDEX "User_demoExpiresAt_idx" ON "User"("demoExpiresAt");

-- A venue. Bookings, subscriptions and tournaments point here; the free-text
-- User.club string is only a display-level "home club" note.
CREATE TABLE "Club" (
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
CREATE UNIQUE INDEX "Club_name_city_key" ON "Club"("name", "city");
CREATE INDEX "Club_city_idx" ON "Club"("city");
ALTER TABLE "Club" ADD CONSTRAINT "Club_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ClubTable" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "indoor" BOOLEAN NOT NULL DEFAULT true,
    "pricePerHour" DOUBLE PRECISION,

    CONSTRAINT "ClubTable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubTable_clubId_number_key" ON "ClubTable"("clubId", "number");
CREATE INDEX "ClubTable_clubId_idx" ON "ClubTable"("clubId");
ALTER TABLE "ClubTable" ADD CONSTRAINT "ClubTable_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- organizerId is the tournament's manager; every write action is gated on it.
-- `kind` separates a rated TOURNAMENT from an unrated GAME — same container
-- otherwise: roster, rounds, pairing, standings.
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TOURNAMENT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tablesCount" INTEGER NOT NULL DEFAULT 4,
    "maxPlayers" INTEGER,
    "setsToWin" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "minRating" INTEGER,
    "maxRating" INTEGER,
    "ratingWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "access" TEXT NOT NULL DEFAULT 'OPEN',
    "archivedAt" TIMESTAMP(3),
    "clubId" TEXT,
    "organizerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");
CREATE INDEX "Tournament_kind_status_idx" ON "Tournament"("kind", "status");
CREATE INDEX "Tournament_startTime_idx" ON "Tournament"("startTime");
CREATE INDEX "Tournament_clubId_idx" ON "Tournament"("clubId");
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Roster join table. "seed" is set once, at round 1, and never updated again.
CREATE TABLE "TournamentUser" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seed" INTEGER,
    "ratingStart" DOUBLE PRECISION,
    "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TournamentUser_tournamentId_userId_key" ON "TournamentUser"("tournamentId", "userId");
CREATE INDEX "TournamentUser_tournamentId_idx" ON "TournamentUser"("tournamentId");
CREATE INDEX "TournamentUser_tournamentId_seed_idx" ON "TournamentUser"("tournamentId", "seed");
ALTER TABLE "TournamentUser" ADD CONSTRAINT "TournamentUser_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentUser" ADD CONSTRAINT "TournamentUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- With an odd headcount exactly one player sits each round out; this records who,
-- so the round can say it rather than the client guessing from missing matches.
CREATE TABLE "RoundBye" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundBye_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoundBye_tournamentId_round_key" ON "RoundBye"("tournamentId", "round");
CREATE INDEX "RoundBye_tournamentId_idx" ON "RoundBye"("tournamentId");
ALTER TABLE "RoundBye" ADD CONSTRAINT "RoundBye_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoundBye" ADD CONSTRAINT "RoundBye_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A match holds a run of sets. There is no fixed "best of N": whoever won more
-- sets takes the match, and the judge decides when to stop.
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "matchIndex" INTEGER,
    "tableNumber" INTEGER,
    "player1Id" TEXT,
    "player2Id" TEXT,
    "judgeId" TEXT,
    "setsToWin" INTEGER NOT NULL DEFAULT 3,
    "eloDelta" DOUBLE PRECISION,
    "eloDeltaLoser" DOUBLE PRECISION,
    "rating1Before" DOUBLE PRECISION,
    "rating2Before" DOUBLE PRECISION,
    "setsWon1" INTEGER NOT NULL DEFAULT 0,
    "setsWon2" INTEGER NOT NULL DEFAULT 0,
    "status" "MatchStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");
CREATE INDEX "Match_tournamentId_round_idx" ON "Match"("tournamentId", "round");
CREATE INDEX "Match_status_idx" ON "Match"("status");
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One set ("партия") inside a match: the thing actually played to 11 or 21.
-- Point-by-point state lives here, so /undo reverses a point within the set.
CREATE TABLE "MatchSet" (
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
CREATE UNIQUE INDEX "MatchSet_matchId_index_key" ON "MatchSet"("matchId", "index");
CREATE INDEX "MatchSet_matchId_idx" ON "MatchSet"("matchId");
ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A table reservation, optionally paid: "priceTotal" snapshots the table's
-- pricePerHour x durationHours at booking time, null when the table is free.
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "tableId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceTotal" DOUBLE PRECISION,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentRef" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");
CREATE INDEX "Booking_clubId_date_idx" ON "Booking"("clubId", "date");
CREATE INDEX "Booking_tableId_date_idx" ON "Booking"("tableId", "date");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "ClubTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- What the table was booked for — a tournament or a game, which are the same
-- table. Cancelling a booking leaves the event alone, and deleting an event just
-- detaches it from the booking.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "Follow a club" list — no billing, just a saved list.
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subscription_userId_clubId_key" ON "Subscription"("userId", "clubId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-tournament message board, polled rather than real-time.
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB,
    "link" TEXT,
    "tournamentId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_tournamentId_idx" ON "Notification"("tournamentId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AuditLog" (
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
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Standalone by design: the schema declares no relation from Session to User.
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Tournament_organizerId_idx" ON "Tournament"("organizerId");
CREATE INDEX "Tournament_isPublic_startTime_idx" ON "Tournament"("isPublic", "startTime");
CREATE INDEX "TournamentUser_userId_idx" ON "TournamentUser"("userId");
CREATE INDEX "Match_player1Id_idx" ON "Match"("player1Id");
CREATE INDEX "Match_player2Id_idx" ON "Match"("player2Id");
CREATE INDEX "Match_status_endedAt_idx" ON "Match"("status", "endedAt");
CREATE INDEX "ChatMessage_tournamentId_createdAt_idx" ON "ChatMessage"("tournamentId", "createdAt");

COMMIT;
