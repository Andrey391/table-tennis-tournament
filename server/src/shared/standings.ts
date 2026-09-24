import { bracketOf, BracketMatchInput } from "./bracket";

// Tournament standings, computed straight from completed matches.
//
// Ranking: matches won, then Buchholz (the sum of every opponent's wins), then set
// difference. Buchholz is the usual Swiss tiebreak: after three or four rounds half
// the room is on the same number of wins, and "who did you beat to get there" is
// what separates them. A match settled with an equal set tally counts for neither
// side (the server no longer lets one be settled, but old data may hold them).

export type StandingsMatch = {
  player1Id: string | null;
  player2Id: string | null;
  setsWon1: number;
  setsWon2: number;
  // What the winner gained and what the loser gave up (FNTR is not zero-sum, so they
  // differ); null for an unrated match.
  eloDelta?: number | null;
  eloDeltaLoser?: number | null;
};

export type StandingsPlayer = {
  userId: string;
  user: { firstName: string; lastName: string; rating: number } | null;
};

export type StandingsRow = {
  userId: string; firstName: string; lastName: string; rating: number;
  wins: number; losses: number; setsWon: number; setsLost: number; buchholz: number;
  // Sonneborn-Berger: sum of the wins of every opponent this player actually beat
  // (a loss credits nothing, unlike Buchholz which counts every opponent played).
  // A secondary Swiss tiebreak — rewards beating strong opponents specifically,
  // rather than just having played a strong schedule.
  sonnebornBerger: number;
  // Net rating movement across this event's matches.
  ratingChange: number;
};

export type StandingsTiebreak = "buchholz" | "sonnebornberger";

export function computeStandings(players: StandingsPlayer[], matches: StandingsMatch[], tiebreak: StandingsTiebreak = "buchholz"): StandingsRow[] {
  const stats = new Map<string, StandingsRow>();
  const opponents = new Map<string, string[]>();
  const beatenOpponents = new Map<string, string[]>();
  for (const p of players) {
    if (!p.user) continue;
    stats.set(p.userId, { userId: p.userId, firstName: p.user.firstName, lastName: p.user.lastName, rating: p.user.rating, wins: 0, losses: 0, setsWon: 0, setsLost: 0, buchholz: 0, sonnebornBerger: 0, ratingChange: 0 });
    opponents.set(p.userId, []);
    beatenOpponents.set(p.userId, []);
  }
  for (const m of matches) {
    if (!m.player1Id || !m.player2Id) continue;
    const s1 = stats.get(m.player1Id);
    const s2 = stats.get(m.player2Id);
    if (!s1 || !s2) continue;
    s1.setsWon += m.setsWon1; s1.setsLost += m.setsWon2;
    s2.setsWon += m.setsWon2; s2.setsLost += m.setsWon1;
    const gain = m.eloDelta ?? 0, loss = m.eloDeltaLoser ?? 0;
    if (m.setsWon1 > m.setsWon2) { s1.wins++; s2.losses++; s1.ratingChange += gain; s2.ratingChange += loss; beatenOpponents.get(m.player1Id)!.push(m.player2Id); }
    else if (m.setsWon2 > m.setsWon1) { s2.wins++; s1.losses++; s2.ratingChange += gain; s1.ratingChange += loss; beatenOpponents.get(m.player2Id)!.push(m.player1Id); }
    opponents.get(m.player1Id)!.push(m.player2Id);
    opponents.get(m.player2Id)!.push(m.player1Id);
  }
  for (const row of stats.values()) {
    row.ratingChange = Math.round(row.ratingChange * 100) / 100;
    row.buchholz = (opponents.get(row.userId) || []).reduce((sum, id) => sum + (stats.get(id)?.wins || 0), 0);
    row.sonnebornBerger = (beatenOpponents.get(row.userId) || []).reduce((sum, id) => sum + (stats.get(id)?.wins || 0), 0);
  }
  const tiebreakValue = (row: StandingsRow) => (tiebreak === "sonnebornberger" ? row.sonnebornBerger : row.buchholz);
  return Array.from(stats.values()).sort((a, b) =>
    b.wins - a.wins || tiebreakValue(b) - tiebreakValue(a) || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost));
}

// The standings of one event, in the order its format ranks by: a Swiss event by
// the table above, a bracket by the places played for (shared/bracket.ts), with
// the table only ordering players tied on a place (the 5-8 group of a knockout).
// Bracket rows carry `place`, shared by ties. Every list of an event's standings
// (its page, the public board, the results podium, a player's placings) goes
// through here so they all agree.
export function eventStandings(
  event: { format: string; players: (StandingsPlayer & { seed: number | null; status: string })[]; matches: (StandingsMatch & BracketMatchInput)[] },
  tiebreak: StandingsTiebreak = "buchholz",
): (StandingsRow & { place?: number })[] {
  const rows = computeStandings(event.players, event.matches, tiebreak);
  const bracket = event.matches.length ? bracketOf(event) : null;
  if (!bracket) return rows;
  const key = (id: string) => bracket.place.get(id) ?? Infinity;
  rows.sort((a, b) => key(a.userId) - key(b.userId));
  return rows.map((r) => ({ ...r, place: 1 + rows.filter((o) => key(o.userId) < key(r.userId)).length }));
}
