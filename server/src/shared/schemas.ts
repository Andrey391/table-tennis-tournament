import { z } from "zod";

// Booking start times are "HH:MM" — the overlap check parses them as minutes.
const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

// A "game" is a tournament that isn't rated — same roster, rounds and pairing.
export const CreateTournamentSchema = z.object({
  kind: z.enum(["TOURNAMENT", "GAME"]).default("TOURNAMENT"),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  tablesCount: z.number().int().min(1).max(50).default(4),
  maxPlayers: z.number().int().min(2).max(500).optional(),
  clubId: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  minRating: z.number().int().min(0).max(5000).optional(),
  maxRating: z.number().int().min(0).max(5000).optional(),
});

export const UpdateTournamentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  tablesCount: z.number().int().min(1).max(50).optional(),
  maxPlayers: z.number().int().min(2).max(500).nullable().optional(),
  clubId: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  startTime: z.string().datetime().nullable().optional(),
  endTime: z.string().datetime().nullable().optional(),
  minRating: z.number().int().min(0).max(5000).nullable().optional(),
  maxRating: z.number().int().min(0).max(5000).nullable().optional(),
});

export const CreateClubSchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().min(1).max(120),
  address: z.string().max(300).optional(),
  phone: z.string().max(40).optional(),
});

export const UpdateClubSchema = CreateClubSchema.partial();

export const CreateClubTableSchema = z.object({
  number: z.number().int().min(1).max(200),
  indoor: z.boolean().default(true),
});

// Booking a table always books it *for* something: either a casual game or a
// tournament. The booking row then points at whichever one it created.
export const CreateBookingSchema = z.object({
  clubId: z.string().min(1),
  tableId: z.string().optional(),
  date: z.string().datetime(),
  startTime: TimeOfDay,
  durationHours: z.number().min(0.5).max(8).default(1),
  eventType: z.enum(["GAME", "TOURNAMENT"]).default("GAME"),
  eventTitle: z.string().max(200).optional(),
});

export const SubscribeSchema = z.object({
  clubId: z.string().min(1),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  club: z.string().max(100).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
});

export const ChatMessageSchema = z.object({
  text: z.string().min(1).max(1000),
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

export const ForfeitSchema = z.object({
  loserSide: z.union([z.literal(1), z.literal(2)]),
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
  city: z.string().max(120).optional(),
  rating: z.number().int().min(0).max(5000).optional(),
  role: z.enum(["ADMIN", "ORGANIZER", "JUDGE", "PLAYER", "VIEWER"]).optional(),
});
