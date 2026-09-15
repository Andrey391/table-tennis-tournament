import { z } from "zod";

export const CreateTournamentSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["SINGLE", "DOUBLE", "TEAM"]),
  system: z.enum(["ROUND_ROBIN", "OLYMPIC", "DOUBLE_ELIMINATION", "MIXED"]),
  format: z.enum(["BEST_OF_3", "BEST_OF_5", "BEST_OF_7"]),
  maxGroups: z.number().int().min(1).max(16).optional(),
  playersPerGroup: z.number().int().min(2).max(16).optional(),
  playersOut: z.number().int().min(1).optional(),
  tablesCount: z.number().int().min(1).max(50).default(4),
  startTime: z.string().datetime().optional(),
});

export const CreatePlayerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  club: z.string().max(100).optional(),
  rating: z.number().int().min(0).max(5000).default(1000),
  dateOfBirth: z.string().datetime().optional(),
});

export const UpdateScoreSchema = z.object({
  matchId: z.string(),
  gamesWon1: z.number().int().min(0),
  gamesWon2: z.number().int().min(0),
  score1: z.number().int().min(0),
  score2: z.number().int().min(0),
  sets1: z.array(z.array(z.number())).optional(),
  sets2: z.array(z.array(z.number())).optional(),
  state: z.enum(["IN_PROGRESS", "COMPLETED"]),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(["ADMIN", "ORGANIZER", "JUDGE", "PLAYER", "VIEWER"]).optional(),
});
