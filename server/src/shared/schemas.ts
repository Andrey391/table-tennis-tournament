import { z } from "zod";
import { normalizeCity } from "./city";

// Booking start times are "HH:MM" — the overlap check parses them as minutes.
const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

// Cities are typed by hand; store them tidy so they compare and list as one.
const City = z.string().max(120).transform(normalizeCity);

// A "game" is a tournament that isn't rated — same roster, rounds and pairing.
// `name` is optional (falls back to the club's name, or a generic one for the
// kind — see the create route) but `startTime` is required: a club night without
// a date is not something anyone can actually show up to, while a name is just a
// label. This mirrors POST /bookings, which has required exactly this the same way.
export const CreateTournamentSchema = z.object({
  kind: z.enum(["TOURNAMENT", "GAME"]).default("TOURNAMENT"),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  tablesCount: z.number().int().min(1).max(50).default(4),
  maxPlayers: z.number().int().min(2).max(500).optional(),
  // Target score the event's matches are created with; a judge can still change
  // it on a match that hasn't started.
  // How many sets the matches of this event are played to. It is a target the
  // scoring screen prompts at, not a cap: a match runs as long as the pair play.
  setsToWin: z.number().int().min(1).optional(),
  // False keeps the event out of the public feed; its participants still see it.
  isPublic: z.boolean().optional(),
  // OPEN (default) invites anyone to request a seat; CLOSED hides that invite in
  // the client. Either way a self-join still lands as PENDING until the manager
  // approves it — this only controls who is shown the door.
  access: z.enum(["OPEN", "CLOSED"]).optional(),
  clubId: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  minRating: z.number().int().min(0).max(5000).optional(),
  maxRating: z.number().int().min(0).max(5000).optional(),
  // FNTR significance coefficient (KT): scales the rating this event's matches move.
  ratingWeight: z.number().min(0.1).max(1).optional(),
});

export const UpdateTournamentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  tablesCount: z.number().int().min(1).max(50).optional(),
  maxPlayers: z.number().int().min(2).max(500).nullable().optional(),
  setsToWin: z.number().int().min(1).optional(),
  isPublic: z.boolean().optional(),
  access: z.enum(["OPEN", "CLOSED"]).optional(),
  clubId: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  startTime: z.string().datetime().nullable().optional(),
  endTime: z.string().datetime().nullable().optional(),
  minRating: z.number().int().min(0).max(5000).nullable().optional(),
  maxRating: z.number().int().min(0).max(5000).nullable().optional(),
  ratingWeight: z.number().min(0.1).max(1).optional(),
});

export const CreateClubSchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().trim().min(1).max(120).transform(normalizeCity),
  address: z.string().max(300).optional(),
  phone: z.string().max(40).optional(),
});

export const UpdateClubSchema = CreateClubSchema.partial();

export const CreateClubTableSchema = z.object({
  number: z.number().int().min(1).max(200),
  indoor: z.boolean().default(true),
  // Per-hour price, in the club's local currency. Omitted/null means the
  // table is free to book, same as before this field existed.
  pricePerHour: z.number().min(0).max(100000).optional(),
});

export const UpdateClubTableSchema = z.object({
  number: z.number().int().min(1).max(200).optional(),
  indoor: z.boolean().optional(),
  pricePerHour: z.number().min(0).max(100000).nullable().optional(),
});

// Booking a table always books it *for* something: either a casual game or a
// tournament. The booking row then points at whichever one it created.
export const CreateBookingSchema = z.object({
  clubId: z.string().min(1),
  tableId: z.string().optional(),
  date: z.string().datetime(),
  startTime: TimeOfDay,
  durationHours: z.number().min(0.5).max(8).default(1),
  // The event's actual start/end instant, as the booking screen's own browser
  // resolved "date + startTime" in its local timezone. `date`/`startTime` above
  // stay wall-clock strings (used only for same-day overlap arithmetic, which
  // doesn't care about timezone); without these the server would have to guess
  // an instant from a bare "HH:MM" and guess wrong for anyone not in UTC.
  eventStartTime: z.string().datetime().optional(),
  eventEndTime: z.string().datetime().optional(),
  eventType: z.enum(["GAME", "TOURNAMENT"]).default("GAME"),
  eventTitle: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  setsToWin: z.number().int().min(1).optional(),
  // How many tables the event's rounds will spread across. Checked against how
  // many of the club's tables are actually free at this date/time (see
  // countFreeTables in shared/booking.ts) before the event is created.
  tablesCount: z.number().int().min(1).max(50).optional(),
  // A table held for a private knockabout doesn't belong in the city feed.
  isPublic: z.boolean().optional(),
  // OPEN (default) or CLOSED — see CreateTournamentSchema. Ignored for a GAME.
  access: z.enum(["OPEN", "CLOSED"]).optional(),
  // Tournament-only settings, same as CreateTournamentSchema — a booking for a
  // TOURNAMENT is how a tournament is created at all now, so it carries the
  // same knobs the old bookingless form used to.
  maxPlayers: z.number().int().min(2).max(500).optional(),
  minRating: z.number().int().min(0).max(5000).optional(),
  maxRating: z.number().int().min(0).max(5000).optional(),
  ratingWeight: z.number().min(0.1).max(1).optional(),
});

export const SubscribeSchema = z.object({
  clubId: z.string().min(1),
});

// Everything a person can change about themselves. `rating` is deliberately
// absent: it is computed from settled matches, and letting it be posted
// would make the whole ladder meaningless. `role` is absent for the same reason
// as at signup — it would be a free promotion to ADMIN.
export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  city: City.nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  dateOfBirth: z.string().datetime().nullable().optional(),
  // Giving or withdrawing the consent to a public name (152-FZ art. 10.1).
  publicProfile: z.boolean().optional(),
  // A new password is only accepted together with the current one, so a borrowed
  // unlocked phone can't be used to take the account over.
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).max(200).optional(),
});

export const ChatMessageSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

// No `ids` marks the whole inbox read.
export const MarkNotificationsReadSchema = z.object({
  ids: z.array(z.string()).max(200).optional(),
});

export const AddPlayersSchema = z.object({
  userIds: z.array(z.string()).min(1),
});

export const MatchSettingsSchema = z.object({
  setsToWin: z.number().int().min(1).optional(),
  tableNumber: z.number().int().min(1).optional(),
  judgeId: z.string().optional(),
});

// Which side took a set. Scoring records whole sets, not points.
// The rally score of the set ("11:7") is optional and only kept for the record.
export const SetResultSchema = z.object({
  side: z.union([z.literal(1), z.literal(2)]),
  score1: z.number().int().min(0).max(99).nullish(),
  score2: z.number().int().min(0).max(99).nullish(),
});

// Manual round-1 seeding: the full order of approved players, top seed first.
export const SeedingSchema = z.object({
  userIds: z.array(z.string()).min(1),
});

// A friendly game recorded after the fact, in one step: who, and the set tally.
export const QuickGameSchema = z.object({
  opponentId: z.string().min(1),
  setsWon1: z.number().int().min(0).max(20),
  setsWon2: z.number().int().min(0).max(20),
  clubId: z.string().optional(),
  name: z.string().max(120).optional(),
});

export const ForfeitSchema = z.object({
  loserSide: z.union([z.literal(1), z.literal(2)]),
});

// Login only looks the address up, so it is not format-checked: the seeded
// accounts are "admin@localhost", which a strict email check rejects.
export const LoginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(6),
});

// Self-signup from the Register screen. Role and rating are deliberately absent:
// taking them from the request body would let anyone register as an ADMIN with a
// rating of their choosing.
export const SelfRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  city: City.optional(),
  // Consent to the processing of personal data (152-FZ art. 9) is not optional:
  // no tick, no account. Whether the name may be shown to anyone at all is a
  // separate consent (art. 10.1), and saying no to it still gets an account.
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You have to accept the privacy policy and the terms of use" }) }),
  publicProfile: z.boolean().default(false),
});

// Signing up from inside a demo. Same fields as a fresh signup — the point is
// that it updates the account the visitor is already using instead of creating a
// second one, so the event they ran comes with them.
export const ClaimDemoSchema = SelfRegisterSchema;

// Deleting one's own account asks for the password again: it cannot be undone.
export const DeleteAccountSchema = z.object({ password: z.string().min(1) });

export const DemoJoinSchema = z.object({ tournamentId: z.string().min(1).max(100) });

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  city: City.optional(),
  rating: z.number().int().min(0).max(5000).optional(),
  role: z.enum(["ADMIN", "ORGANIZER", "JUDGE", "PLAYER", "VIEWER"]).optional(),
});
