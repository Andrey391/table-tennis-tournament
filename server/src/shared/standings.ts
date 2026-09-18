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
  // What the winner gained (and the loser gave up); null for an unrated match.
  eloDelta?: number | null;
};

export type StandingsPlayer = {
  userId: string;
  user: { firstName: string; lastName: string; club: string | null; rating: number } | null;
};

export type StandingsRow = {
  userId: string; firstName: string; lastName: string; club?: string | null; rating: number;
  wins: number; losses: number; setsWon: number; setsLost: number; buchholz: number;
  // Net rating movement across this event's matches.
  ratingChange: number;
};

export function computeStandings(players: StandingsPlayer[], matches: StandingsMatch[]): StandingsRow[] {
  const stats = new Map<string, StandingsRow>();
  const opponents = new Map<string, string[]>();
  for (const p of players) {
    if (!p.user) continue;
    stats.set(p.userId, { userId: p.userId, firstName: p.user.firstName, lastName: p.user.lastName, club: p.user.club, rating: p.user.rating, wins: 0, losses: 0, setsWon: 0, setsLost: 0, buchholz: 0, ratingChange: 0 });
    opponents.set(p.userId, []);
  }
  for (const m of matches) {
    if (!m.player1Id || !m.player2Id) continue;
    const s1 = stats.get(m.player1Id);
    const s2 = stats.get(m.player2Id);
    if (!s1 || !s2) continue;
    s1.setsWon += m.setsWon1; s1.setsLost += m.setsWon2;
    s2.setsWon += m.setsWon2; s2.setsLost += m.setsWon1;
    const delta = m.eloDelta ?? 0;
    if (m.setsWon1 > m.setsWon2) { s1.wins++; s2.losses++; s1.ratingChange += delta; s2.ratingChange -= delta; }
    else if (m.setsWon2 > m.setsWon1) { s2.wins++; s1.losses++; s2.ratingChange += delta; s1.ratingChange -= delta; }
    opponents.get(m.player1Id)!.push(m.player2Id);
    opponents.get(m.player2Id)!.push(m.player1Id);
  }
  for (const row of stats.values()) {
    row.buchholz = (opponents.get(row.userId) || []).reduce((sum, id) => sum + (stats.get(id)?.wins || 0), 0);
  }
  return Array.from(stats.values()).sort((a, b) =>
    b.wins - a.wins || b.buchholz - a.buchholz || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost));
}
