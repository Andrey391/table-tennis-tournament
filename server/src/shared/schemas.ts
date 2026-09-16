import { z } from "zod";

export const CreateTournamentSchema = z.object({
  name: z.string().min(1).max(200),
  tablesCount: z.number().int().min(1).max(50).default(4),
  startTime: z.string().datetime().optional(),
});

export const UpdateTournamentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tablesCount: z.number().int().min(1).max(50).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

export const AddPlayersSchema = z.object({
  userIds: z.array(z.string()).min(1),
});

export const MatchSettingsSchema = z.object({
  pointsToWin: z.union([z.literal(11), z.literal(21)]).optional(),
  tableNumber: z.number().int().min(1).optional(),
  judgeId: z.string().optional(),
});

export const ScorePointSchema = z.object({
  side: z.union([z.literal(1), z.literal(2)]),
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
  club: z.string().max(100).optional(),
  rating: z.number().int().min(0).max(5000).optional(),
  role: z.enum(["ADMIN", "ORGANIZER", "JUDGE", "PLAYER", "VIEWER"]).optional(),
});
