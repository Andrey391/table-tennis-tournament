import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "../config/db";

// A visitor who has never run a club night cannot judge the app from the feed:
// the whole point of it is pairing a room of players and recording sets at the
// table, and none of that is visible until you do it. So "try it" hands them a
// real account with a real event already on the roster — they pair it, score it
// and read the table exactly the way a manager does on the night.
//
// It is a real account rather than a browser-side fake so the evening they run
// survives signing up: claiming the account is an UPDATE, not an import.

// How long an unclaimed demo lives. Long enough to come back to after the
// evening, short enough that nobody expects it to be storage.
export const DEMO_TTL_HOURS = 24;

// Ratings are deliberately spread out: with everyone on 100 the seeding step of
// the tour would pair an arbitrary order and look like it did nothing.
const DEMO_OPPONENTS = [
  { firstName: "Алексей", lastName: "Морозов", rating: 340 },
  { firstName: "Марина", lastName: "Зотова", rating: 295 },
  { firstName: "Павел", lastName: "Гринёв", rating: 250 },
  { firstName: "Ольга", lastName: "Савина", rating: 205 },
  { firstName: "Тимур", lastName: "Юсупов", rating: 170 },
  { firstName: "Дарья", lastName: "Белова", rating: 140 },
  { firstName: "Никита", lastName: "Орлов", rating: 115 },
];

const demoEmail = () => `demo-${randomUUID()}@demo.local`;

// Everything a demo account owns is hidden from the rating list, the
// leaderboards and the public feed. Spell the filter once so a new list cannot
// quietly start showing sparring partners next to real players.
export const notDemo = { isDemo: false };

export interface DemoAccount {
  userId: string;
  role: string;
  tournamentId: string;
  expiresAt: Date;
}

// Creates the guest, its sparring partners and the event they are already on the
// roster of, in one transaction: a guest with no event to run would land on an
// empty screen, which is the thing this flow exists to avoid.
export async function createDemoAccount(): Promise<DemoAccount> {
  // A password nobody knows: the account is reachable by the token this call
  // returns, and gets a real one when it is claimed.
  const password = await bcrypt.hash(randomUUID(), 10);
  const expiresAt = new Date(Date.now() + DEMO_TTL_HOURS * 3600 * 1000);

  // Ids are chosen here rather than read back, so the seven opponents go in as
  // one `createMany` and the event can name its roster without a second query.
  const guestId = randomUUID();
  const opponents = DEMO_OPPONENTS.map((o) => ({
    ...o, id: randomUUID(), email: demoEmail(), password, role: "PLAYER" as const, city: "Москва",
    club: "Демо-клуб", isDemo: true, demoOwnerId: guestId, demoExpiresAt: expiresAt,
  }));

  // The array form, not `$transaction(async tx => ...)`: an interactive
  // transaction holds one session open across several round trips, which a
  // connection pooler in front of the database does not reliably survive. A
  // batch is just as atomic and is one round trip.
  const guestData = {
    id: guestId, email: demoEmail(), password, firstName: "Гость", lastName: "Демо", role: "ORGANIZER" as const,
    city: "Москва", rating: 220, isDemo: true, demoExpiresAt: expiresAt,
  };
  const tournamentId = randomUUID();
  await prisma.$transaction([
    prisma.user.create({ data: guestData }),
    prisma.user.createMany({ data: opponents }),
    // DRAFT, not ACTIVE: pairing the room is the first thing the tour shows, and
    // it is what turns the roster into round 1.
    prisma.tournament.create({
      data: {
        id: tournamentId,
        name: "Демо-вечер", kind: "TOURNAMENT", status: "DRAFT", tablesCount: 2, setsToWin: 3,
        description: "Тренировочный турнир, чтобы попробовать приложение. Его никто, кроме тебя, не видит.",
        // Out of the city feed: a visitor poking at the app is not an event
        // anyone can turn up to.
        isPublic: false,
        organizerId: guestId, startTime: new Date(),
        players: {
          create: [{ id: guestId }, ...opponents].map((u) => ({ userId: u.id, status: "REGISTERED" })),
        },
      },
    }),
  ]);
  return { userId: guestId, role: guestData.role, tournamentId, expiresAt };
}

// Deletes every demo set whose time is up, with the events they played. Called
// opportunistically when a new demo starts rather than from a scheduled job:
// there is no scheduler on either deployment target, and the only moment demo
// rows can pile up is when demos are being created.
export async function sweepExpiredDemos(): Promise<number> {
  const expired = await prisma.user.findMany({
    where: { isDemo: true, demoExpiresAt: { lt: new Date() } },
    select: { id: true },
  });
  if (!expired.length) return 0;
  const userIds = expired.map((u) => u.id);
  const tournaments = await prisma.tournament.findMany({
    where: { organizerId: { in: userIds } },
    select: { id: true },
  });
  const tournamentIds = tournaments.map((t) => t.id);
  const byUser = { OR: [{ player1Id: { in: userIds } }, { player2Id: { in: userIds } }] };

  // Nothing here cascades on its own (the same reason DELETE /tournaments/:id
  // clears its rows by hand), so the order matters: everything pointing at a
  // user or a tournament goes before the row it points at.
  await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tournamentId: { in: tournamentIds } }] } }),
    prisma.roundBye.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tournamentId: { in: tournamentIds } }] } }),
    // MatchSet rows cascade with their match.
    prisma.match.deleteMany({ where: { OR: [{ tournamentId: { in: tournamentIds } }, byUser, { judgeId: { in: userIds } }] } }),
    prisma.tournamentUser.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tournamentId: { in: tournamentIds } }] } }),
    prisma.booking.updateMany({ where: { tournamentId: { in: tournamentIds } }, data: { tournamentId: null } }),
    prisma.booking.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.subscription.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } }),
    prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.club.updateMany({ where: { createdById: { in: userIds } }, data: { createdById: null } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
  return userIds.length;
}
