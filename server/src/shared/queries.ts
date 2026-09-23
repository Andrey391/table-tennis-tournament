// Prisma selects, includes and filters that more than one route needs. They used to
// be re-declared file by file (and a third time in api/index.ts), which is how two
// copies of the same response ended up with different fields.

import { normalizeCity } from "./city";

export const playerSelect = { id: true, firstName: true, lastName: true, city: true, rating: true };

export const clubSelect = { id: true, name: true, city: true, address: true, phone: true };

export const matchInclude = {
  player1: { select: playerSelect },
  player2: { select: playerSelect },
  judge: { select: { id: true, firstName: true, lastName: true } },
  tournament: { select: { organizerId: true, kind: true } },
  sets: { orderBy: { index: "asc" as const } },
};

// How many participants a feed card shows faces for; `_count` says how many more.
// An event's own page (GET /tournaments/:id and the demo reset). The organizer's
// `isDemo` is there so the demo-seat lookup only runs for a demo event; the
// route strips it before answering.
export const tournamentDetailInclude = {
  organizer: { select: { id: true, firstName: true, lastName: true, isDemo: true } },
  club: { select: clubSelect },
  players: { include: { user: { select: playerSelect } }, orderBy: { seed: "asc" as const } },
  byes: { include: { user: { select: playerSelect } } },
  matches: { include: matchInclude, orderBy: [{ round: "asc" as const }, { matchIndex: "asc" as const }] },
};

export const FEED_PLAYERS = 4;

// "9/9 players" counts approved participants only — pending requests don't fill the tournament.
export const feedInclude = {
  organizer: { select: { id: true, firstName: true, lastName: true } },
  club: { select: clubSelect },
  _count: { select: { matches: true, players: { where: { status: "REGISTERED" as const } } } },
  // The avatars on the feed card: the strongest few of those taking part.
  players: {
    where: { status: "REGISTERED" as const },
    orderBy: { user: { rating: "desc" as const } },
    take: FEED_PLAYERS,
    select: { userId: true, user: { select: playerSelect } },
  },
};

export const bookingInclude = {
  club: { select: clubSelect },
  table: { select: { id: true, number: true, indoor: true, pricePerHour: true } },
  tournament: { select: { id: true, kind: true, name: true, status: true } },
};

// Someone who left mid-event keeps the matches they already played, so WITHDRAWN
// rows belong in every table and tally; pairing reads REGISTERED only.
export const PLAYED_STATUSES = { in: ["REGISTERED", "WITHDRAWN"] as ("REGISTERED" | "WITHDRAWN")[] };

// What computeStandings needs from a tournament.
export const standingsInclude = {
  players: { where: { status: PLAYED_STATUSES }, include: { user: { select: playerSelect } } },
  matches: { where: { status: "COMPLETED" as const }, select: { player1Id: true, player2Id: true, setsWon1: true, setsWon2: true, eloDelta: true, eloDeltaLoser: true } },
};

// An event at a club in that city, or one with no venue run by someone who lives
// there — otherwise `User.city`, which every account is asked for at signup, would
// decide nothing at all.
// Case-insensitive, because the city is free text and "москва" is Moscow too.
export const cityIs = (city: string) => ({ equals: normalizeCity(city), mode: "insensitive" as const });
export const inCity = (city: string) => ({ OR: [{ club: { city: cityIs(city) } }, { clubId: null, organizer: { city: cityIs(city) } }] });

// Optional string query parameter: absent, repeated or empty all mean "not given".
export const queryString = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
