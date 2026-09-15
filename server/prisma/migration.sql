-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORGANIZER', 'JUDGE', 'PLAYER', 'VIEWER');

-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('SINGLE', 'DOUBLE', 'TEAM');

-- CreateEnum
CREATE TYPE "TournamentSystem" AS ENUM ('ROUND_ROBIN', 'OLYMPIC', 'DOUBLE_ELIMINATION', 'MIXED');

-- CreateEnum
CREATE TYPE "MatchFormat" AS ENUM ('BEST_OF_3', 'BEST_OF_5', 'BEST_OF_7');

-- CreateEnum
CREATE TYPE "GameState" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('REGISTERED', 'WITHDRAWN', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('SINGLE', 'DOUBLE', 'TEAM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "club" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "club" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "dateOfBirth" TIMESTAMP(3),
    "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED',
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "club" TEXT,
    "captainId" TEXT,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TournamentType" NOT NULL,
    "system" "TournamentSystem" NOT NULL,
    "format" "MatchFormat" NOT NULL,
    "maxGroups" INTEGER,
    "playersPerGroup" INTEGER,
    "playersOut" INTEGER,
    "tablesCount" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "organizerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentUser" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "seed" INTEGER,
    "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "playersInGroup" INTEGER NOT NULL,
    "standings" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "groupId" TEXT,
    "bracketId" TEXT,
    "round" INTEGER,
    "tableNumber" INTEGER,
    "player1Id" TEXT,
    "player2Id" TEXT,
    "team1Id" TEXT,
    "team2Id" TEXT,
    "judgeId" TEXT,
    "matchType" "MatchType" NOT NULL DEFAULT 'SINGLE',
    "format" "MatchFormat" NOT NULL,
    "status" "GameState" NOT NULL DEFAULT 'NOT_STARTED',
    "score1" INTEGER NOT NULL DEFAULT 0,
    "score2" INTEGER NOT NULL DEFAULT 0,
    "gamesWon1" INTEGER NOT NULL DEFAULT 0,
    "gamesWon2" INTEGER NOT NULL DEFAULT 0,
    "sets1" JSONB DEFAULT '[]',
    "sets2" JSONB DEFAULT '[]',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "player1Score" INTEGER NOT NULL,
    "player2Score" INTEGER NOT NULL,
    "letCount" INTEGER NOT NULL DEFAULT 0,
    "serverSide" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bracket" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'WINNERS',
    "round" INTEGER NOT NULL DEFAULT 1,
    "matchups" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "userId" TEXT,
    "points" INTEGER NOT NULL,
    "won" INTEGER NOT NULL,
    "lost" INTEGER NOT NULL,
    "draws" INTEGER NOT NULL,
    "pointsFor" INTEGER NOT NULL,
    "pointsAgainst" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Player_club_idx" ON "Player"("club");

-- CreateIndex
CREATE INDEX "Player_rating_idx" ON "Player"("rating");

-- CreateIndex
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");

-- CreateIndex
CREATE INDEX "Tournament_startTime_idx" ON "Tournament"("startTime");

-- CreateIndex
CREATE INDEX "TournamentUser_tournamentId_idx" ON "TournamentUser"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentUser_tournamentId_seed_idx" ON "TournamentUser"("tournamentId", "seed");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentUser_tournamentId_userId_key" ON "TournamentUser"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "Group_tournamentId_idx" ON "Group"("tournamentId");

-- CreateIndex
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");

-- CreateIndex
CREATE INDEX "Match_groupId_idx" ON "Match"("groupId");

-- CreateIndex
CREATE INDEX "Match_bracketId_idx" ON "Match"("bracketId");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "Bracket_tournamentId_idx" ON "Bracket"("tournamentId");

-- CreateIndex
CREATE INDEX "Rating_userId_idx" ON "Rating"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_tournamentId_playerId_key" ON "Rating"("tournamentId", "playerId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentUser" ADD CONSTRAINT "TournamentUser_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentUser" ADD CONSTRAINT "TournamentUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_bracketId_fkey" FOREIGN KEY ("bracketId") REFERENCES "Bracket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_team1Id_fkey" FOREIGN KEY ("team1Id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_team2Id_fkey" FOREIGN KEY ("team2Id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bracket" ADD CONSTRAINT "Bracket_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

