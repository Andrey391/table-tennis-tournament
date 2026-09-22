import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "../config/db";
import { revertRatingUpdate } from "../routes/matches";

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

// One opponent: the demo starts as the shortest complete evening there is —
// one pair, one match to score and settle — rather than four matches the
// visitor has no reason to play, each of which would block the next round.
// The roster is not capped, though: a club night is Swiss-style and takes
// whoever turns up, so `maxPlayers` stays unset and more players can join the
// demo event like any other.
//
// "Гость 1" / "Гость 2" rather than invented personal names, which would read
// as real club members in the roster and the match history. The ratings differ
// so round-1 seeding, which sorts by rating, visibly does something.
const DEMO_OPPONENTS = [
  { firstName: "Гость", lastName: "2", rating: 260 },
];

// The sparring partner's address starts with this, and it is the only thing that
// tells an unfilled seat from a person who took it (a joined guest gets "guest-"):
// the invitation link hands that seat to a real visitor, so "still the sparring
// partner" is exactly "the seat is open". Kept in the address rather than a new
// column so neither hand-maintained SQL file has to change.
const SPARRING_PREFIX = "demo-";
const GUEST_PREFIX = "guest-";
const demoEmail = (prefix = SPARRING_PREFIX) => `${prefix}${randomUUID()}@demo.local`;

// Where the invitation link goes wrong, with the HTTP status the route answers.
export class DemoJoinError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// True while the demo event still has its sparring partner in the roster — i.e.
// while an invitation link can still be redeemed. Read on every event fetch so
// the manager's invite card disappears the moment someone takes the seat.
export async function hasOpenDemoSeat(tournamentId: string): Promise<boolean> {
  const seat = await prisma.tournamentUser.findFirst({
    where: { tournamentId, tournament: { organizer: { isDemo: true } }, user: { isDemo: true, email: { startsWith: SPARRING_PREFIX } } },
    select: { id: true },
  });
  return !!seat;
}

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

// Creates the guest, its sparring partner and the event they are already on the
// roster of: a guest with no event to run would land on an empty screen, which
// is the thing this flow exists to avoid.
export async function createDemoAccount(): Promise<DemoAccount> {
  // A password nobody knows: the account is reachable by the token this call
  // returns, and gets a real one when it is claimed.
  const password = await bcrypt.hash(randomUUID(), 10);
  const expiresAt = new Date(Date.now() + DEMO_TTL_HOURS * 3600 * 1000);

  // Ids are chosen here rather than read back, so the event can name its roster
  // without a second query.
  const guestId = randomUUID();
  const opponents = DEMO_OPPONENTS.map((o) => ({
    ...o, id: randomUUID(), email: demoEmail(), password, role: "PLAYER" as const, city: "Москва",
    club: "Демо-клуб", isDemo: true, demoOwnerId: guestId, demoExpiresAt: expiresAt,
  }));

  const guestData = {
    id: guestId, email: demoEmail(), password, firstName: "Гость", lastName: "1", role: "ORGANIZER" as const,
    city: "Москва", rating: 220, isDemo: true, demoExpiresAt: expiresAt,
  };
  const tournamentId = randomUUID();

  // Three separate writes, not one `$transaction`. The pooled Postgres both
  // deployments talk to drops the connection partway through a multi-statement
  // transaction (`P1017`), which made this endpoint fail outright while plain
  // single-statement writes like /auth/register went through. Atomicity is worth
  // little here anyway: a half-built demo is a throwaway account with no event,
  // and it is swept within the day like any other. What matters is that the
  // visitor gets an event, so a failure after the users exist cleans up after
  // itself rather than handing back a guest with nothing to open.
  try {
    await prisma.user.create({ data: guestData });
    await prisma.user.createMany({ data: opponents });
    // DRAFT, not ACTIVE: pairing the room is the first thing the tour shows, and
    // it is what turns the roster into round 1.
    await prisma.tournament.create({
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
    });
  } catch (err) {
    const ids = [guestId, ...opponents.map((o) => o.id)];
    await prisma.tournamentUser.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.tournament.deleteMany({ where: { id: tournamentId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    throw err;
  }
  return { userId: guestId, role: guestData.role, tournamentId, expiresAt };
}

export interface DemoJoin { userId: string; role: string; matchId: string | null }

// Redeems an invitation: a second person takes the sparring partner's seat in the
// demo event, so the evening has two real players who each open the same match on
// their own phone. The seat is *moved* rather than a third player added — the
// roster row and any match already paired point at the new account, with the
// sparring partner's rating, so nothing about the round changes but who is in it.
// One seat, one taker: a second visitor with the same link is told it is taken.
export async function joinDemoSeat(tournamentId: string): Promise<DemoJoin> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { organizerId: true, status: true, organizer: { select: { isDemo: true, demoExpiresAt: true, city: true } } },
  });
  if (!tournament?.organizer.isDemo || tournament.status === "CANCELLED") throw new DemoJoinError("This invitation is no longer valid", 404);
  const expiresAt = tournament.organizer.demoExpiresAt;
  if (expiresAt && expiresAt < new Date()) throw new DemoJoinError("This demo has expired", 410);

  const seat = await prisma.tournamentUser.findFirst({
    where: { tournamentId, user: { isDemo: true, email: { startsWith: SPARRING_PREFIX } } },
    select: { userId: true, user: { select: { rating: true } } },
  });
  if (!seat) throw new DemoJoinError("Someone has already joined this game", 409);

  const guestId = randomUUID();
  await prisma.user.create({
    data: {
      id: guestId, email: demoEmail(GUEST_PREFIX), password: await bcrypt.hash(randomUUID(), 10),
      firstName: "Гость", lastName: "2", role: "PLAYER", city: tournament.organizer.city, rating: seat.user?.rating ?? 100,
      // Owned by the manager and expiring with them, so claiming the account
      // keeps this player (and their matches) instead of sweeping them away.
      isDemo: true, demoOwnerId: tournament.organizerId, demoExpiresAt: expiresAt,
    },
  });
  try {
    // Fails (P2025) if another visitor took the seat between the read and here.
    await prisma.tournamentUser.update({ where: { tournamentId_userId: { tournamentId, userId: seat.userId } }, data: { userId: guestId } });
  } catch (err: any) {
    await prisma.user.delete({ where: { id: guestId } }).catch(() => {});
    if (err?.code === "P2025") throw new DemoJoinError("Someone has already joined this game", 409);
    throw err;
  }
  // Round 1 may already be paired: the seat's matches and bye follow the new player.
  await prisma.match.updateMany({ where: { tournamentId, player1Id: seat.userId }, data: { player1Id: guestId } });
  await prisma.match.updateMany({ where: { tournamentId, player2Id: seat.userId }, data: { player2Id: guestId } });
  await prisma.roundBye.updateMany({ where: { tournamentId, userId: seat.userId }, data: { userId: guestId } });
  // The sparring partner has no rows left to hold it up.
  await prisma.user.delete({ where: { id: seat.userId } }).catch(() => {});

  const match = await prisma.match.findFirst({
    where: { tournamentId, OR: [{ player1Id: guestId }, { player2Id: guestId }] },
    orderBy: { round: "desc" }, select: { id: true },
  });
  return { userId: guestId, role: "PLAYER", matchId: match?.id ?? null };
}

// The tour walks the visitor through pairing round 1 and settling their own
// match — scoring it for real, which (being a TOURNAMENT-kind event) moves both
// players' rating the same as any other match. That is fine while it stays
// theirs, but the second the tour ends, "Гость 1"/"Гость 2" is a throwaway
// pairing standing in for whoever actually turns up, so its rating change has
// to disappear before the visitor starts entering real scores. Wipes round 1
// back to freshly-paired (no sets, NOT_STARTED) and hands back any rating it
// moved, rather than the whole event: pairing already happened, and re-pairing
// would reshuffle who's on which table for no reason.
export async function resetDemoRound1(tournamentId: string, userId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, organizerId: true, status: true, organizer: { select: { isDemo: true } } },
  });
  if (!tournament || tournament.organizerId !== userId || !tournament.organizer.isDemo) return;

  const matches = await prisma.match.findMany({
    where: { tournamentId, round: 1 },
    select: { id: true, player1Id: true, player2Id: true, setsWon1: true, setsWon2: true, eloDelta: true, eloDeltaLoser: true },
  });
  if (!matches.length) return;

  for (const match of matches) {
    await revertRatingUpdate(match).catch((e) => console.error("[DEMO reset]", e?.message));
  }
  const matchIds = matches.map((m) => m.id);
  await prisma.matchSet.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.updateMany({
    where: { id: { in: matchIds } },
    data: {
      status: "NOT_STARTED", setsWon1: 0, setsWon2: 0, startedAt: null, endedAt: null,
      eloDelta: null, eloDeltaLoser: null, rating1Before: null, rating2Before: null,
    },
  });
  // The ratings the two brought to the event no longer mean anything once the
  // match that would have pinned them is undone.
  await prisma.tournamentUser.updateMany({ where: { tournamentId }, data: { ratingStart: null } });
  // Pairing already flipped this to ACTIVE; settling round 1 may since have
  // flipped it to COMPLETED. Either way there is an unplayed match again now.
  await prisma.tournament.updateMany({ where: { id: tournamentId, status: { not: "CANCELLED" } }, data: { status: "ACTIVE" } });
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
  // user or a tournament goes before the row it points at. Sequential rather
  // than wrapped in one transaction, for the same reason creation is: this
  // pooled database drops a connection partway through a multi-statement
  // transaction. A sweep that stops halfway simply leaves rows for the next one.
  for (const step of [
    () => prisma.chatMessage.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tournamentId: { in: tournamentIds } }] } }),
    () => prisma.roundBye.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tournamentId: { in: tournamentIds } }] } }),
    // MatchSet rows cascade with their match.
    () => prisma.match.deleteMany({ where: { OR: [{ tournamentId: { in: tournamentIds } }, byUser, { judgeId: { in: userIds } }] } }),
    () => prisma.tournamentUser.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tournamentId: { in: tournamentIds } }] } }),
    () => prisma.booking.updateMany({ where: { tournamentId: { in: tournamentIds } }, data: { tournamentId: null } }),
    () => prisma.booking.deleteMany({ where: { userId: { in: userIds } } }),
    () => prisma.subscription.deleteMany({ where: { userId: { in: userIds } } }),
    () => prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } }),
    () => prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } }),
    () => prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
    () => prisma.club.updateMany({ where: { createdById: { in: userIds } }, data: { createdById: null } }),
    () => prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]) await step();
  return userIds.length;
}
