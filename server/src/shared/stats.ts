// Player statistics, head-to-head and leaderboards, all computed live from
// completed matches. Nothing here is cached or
// denormalised onto User: a reopened match simply drops out of the next read.

export type StatPlayer = { id: string; firstName: string; lastName: string; rating: number };

export type StatMatch = {
  id: string;
  tournamentId: string;
  player1Id: string | null;
  player2Id: string | null;
  setsWon1: number;
  setsWon2: number;
  eloDelta: number | null;
  rating1Before: number | null;
  rating2Before: number | null;
  endedAt: Date | null;
  player1: StatPlayer | null;
  player2: StatPlayer | null;
  tournament: { id: string; name: string; kind: string };
};

// One match from one player's side of the table.
function side(m: StatMatch, userId: string) {
  const isP1 = m.player1Id === userId;
  const mine = isP1 ? m.setsWon1 : m.setsWon2;
  const theirs = isP1 ? m.setsWon2 : m.setsWon1;
  return {
    isP1, mine, theirs,
    won: mine > theirs,
    lost: theirs > mine,
    opponent: isP1 ? m.player2 : m.player1,
    opponentBefore: isP1 ? m.rating2Before : m.rating1Before,
    myBefore: isP1 ? m.rating1Before : m.rating2Before,
    // Rating this match moved for this player; zero for games and walkovers.
    delta: m.eloDelta == null ? 0 : mine > theirs ? m.eloDelta : theirs > mine ? -m.eloDelta : 0,
  };
}

// A deciding set is one played at a level tally (2:2, 1:1) — the final score is
// one set apart and the loser took at least one. A 1:0 is not a decider.
const isDecider = (m: StatMatch) => Math.abs(m.setsWon1 - m.setsWon2) === 1 && Math.min(m.setsWon1, m.setsWon2) >= 1;

export const ACHIEVEMENTS = [
  "first_win", "wins_10", "wins_50", "matches_50", "streak_5",
  "giant_killer", "decider_5", "podium", "event_winner",
] as const;

// `matches` are this player's completed matches in any order; `placings` are their
// final places (1-based) in finished tournaments.
export function computePlayerStats(userId: string, currentRating: number, matches: StatMatch[], placings: number[]) {
  const sorted = matches.slice().sort((a, b) => (a.endedAt?.getTime() ?? 0) - (b.endedAt?.getTime() ?? 0));

  let wins = 0, losses = 0, setsWon = 0, setsLost = 0, deciders = 0, decidersWon = 0;
  let best = 0, run = 0;
  let bestWin: any = null;
  let giantKiller = false;
  const rivals = new Map<string, { opponent: StatPlayer; wins: number; losses: number }>();

  for (const m of sorted) {
    const s = side(m, userId);
    setsWon += s.mine; setsLost += s.theirs;
    if (s.won) { wins++; run = run > 0 ? run + 1 : 1; }
    else if (s.lost) { losses++; run = run < 0 ? run - 1 : -1; }
    best = Math.max(best, run);
    if (isDecider(m)) { deciders++; if (s.won) decidersWon++; }
    if (s.won && s.opponentBefore != null && (!bestWin || s.opponentBefore > bestWin.rating)) {
      bestWin = { matchId: m.id, tournamentId: m.tournamentId, opponent: s.opponent, rating: s.opponentBefore, score: `${s.mine}:${s.theirs}` };
    }
    if (s.won && s.opponentBefore != null && s.myBefore != null && s.opponentBefore - s.myBefore >= 100) giantKiller = true;
    if (s.opponent) {
      const r = rivals.get(s.opponent.id) ?? { opponent: s.opponent, wins: 0, losses: 0 };
      if (s.won) r.wins++; else if (s.lost) r.losses++;
      rivals.set(s.opponent.id, r);
    }
  }

  // Rating history, walked backwards from today's rating through every rated
  // match's delta, so it needs nothing stored beyond Match.eloDelta.
  const rated = sorted.filter(m => m.tournament.kind === "TOURNAMENT" && m.eloDelta != null);
  const ratingHistory: { date: Date | null; rating: number; delta: number; matchId: string | null }[] = [];
  let r = currentRating;
  for (let i = rated.length - 1; i >= 0; i--) {
    const s = side(rated[i], userId);
    ratingHistory.unshift({ date: rated[i].endedAt, rating: r, delta: s.delta, matchId: rated[i].id });
    r -= s.delta;
  }
  ratingHistory.unshift({ date: rated[0]?.endedAt ?? null, rating: r, delta: 0, matchId: null });

  const form = sorted.slice(-10).reverse().map(m => { const s = side(m, userId); return s.won ? "W" : s.lost ? "L" : "D"; });
  const rivalList = Array.from(rivals.values()).filter(x => x.wins + x.losses >= 2);
  const nemesis = rivalList.filter(x => x.losses > x.wins).sort((a, b) => (b.losses - b.wins) - (a.losses - a.wins) || b.losses - a.losses)[0] ?? null;
  const favourite = rivalList.filter(x => x.wins > x.losses).sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses) || b.wins - a.wins)[0] ?? null;

  const earned: Record<string, boolean> = {
    first_win: wins >= 1,
    wins_10: wins >= 10,
    wins_50: wins >= 50,
    matches_50: sorted.length >= 50,
    streak_5: best >= 5,
    giant_killer: giantKiller,
    decider_5: decidersWon >= 5,
    podium: placings.some(p => p <= 3),
    event_winner: placings.some(p => p === 1),
  };

  return {
    matches: { played: sorted.length, wins, losses },
    sets: { played: setsWon + setsLost, wins: setsWon, losses: setsLost },
    deciders: { played: deciders, wins: decidersWon },
    streak: { current: run, best },
    form,
    bestWin,
    nemesis,
    favourite,
    ratingHistory,
    events: { finished: placings.length, wins: placings.filter(p => p === 1).length, podiums: placings.filter(p => p <= 3).length },
    achievements: ACHIEVEMENTS.map(key => ({ key, earned: earned[key] })),
  };
}

// Every completed match between two players, from `a`'s side.
export function computeHeadToHead(a: string, matches: StatMatch[]) {
  let wins = 0, losses = 0, setsWon = 0, setsLost = 0;
  for (const m of matches) {
    const s = side(m, a);
    setsWon += s.mine; setsLost += s.theirs;
    if (s.won) wins++; else if (s.lost) losses++;
  }
  const recent = matches.slice()
    .sort((x, y) => (y.endedAt?.getTime() ?? 0) - (x.endedAt?.getTime() ?? 0))
    .slice(0, 10)
    .map(m => { const s = side(m, a); return { id: m.id, tournament: m.tournament, endedAt: m.endedAt, mine: s.mine, theirs: s.theirs, delta: s.delta }; });
  return { played: matches.length, wins, losses, setsWon, setsLost, recent };
}

export type LeaderMetric = "rating" | "wins" | "played";

// Leaderboard over a window of completed matches: rating gained, matches won, or
// matches played (activity). Rating gain only counts rated tournament matches.
export function computeLeaders(matches: StatMatch[], metric: LeaderMetric, limit = 20) {
  const rows = new Map<string, { player: StatPlayer; ratingChange: number; wins: number; losses: number; played: number }>();
  const row = (p: StatPlayer) => { const r = rows.get(p.id) ?? { player: p, ratingChange: 0, wins: 0, losses: 0, played: 0 }; rows.set(p.id, r); return r; };
  for (const m of matches) {
    if (!m.player1 || !m.player2) continue;
    for (const p of [m.player1, m.player2]) {
      const s = side(m, p.id);
      const r = row(p);
      r.played++;
      if (s.won) r.wins++; else if (s.lost) r.losses++;
      r.ratingChange += s.delta;
    }
  }
  const key = metric === "rating" ? "ratingChange" : metric;
  return Array.from(rows.values())
    .filter(r => metric !== "rating" || r.ratingChange !== 0)
    .sort((a, b) => b[key] - a[key] || b.wins - a.wins || b.player.rating - a.player.rating)
    .slice(0, limit);
}

// Start of the window a leaderboard covers: this calendar month, this year, or all time.
export function periodStart(period: string | undefined, now = new Date()): Date | null {
  if (period === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (period === "year") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return null;
}

// Match and set tallies from one player's side, straight off the matches' set
// counters (the rally-by-rally score is not recorded, so sets are all there is).
export function summariseMatches(matches: { player1Id: string | null; setsWon1: number; setsWon2: number }[], userId: string) {
  const matchTally = { played: 0, wins: 0, losses: 0 };
  const setTally = { played: 0, wins: 0, losses: 0 };
  for (const m of matches) {
    const isP1 = m.player1Id === userId;
    const mine = isP1 ? m.setsWon1 : m.setsWon2;
    const theirs = isP1 ? m.setsWon2 : m.setsWon1;

    matchTally.played++;
    if (mine > theirs) matchTally.wins++;
    else if (theirs > mine) matchTally.losses++;

    setTally.played += mine + theirs;
    setTally.wins += mine;
    setTally.losses += theirs;
  }
  return { matches: matchTally, sets: setTally };
}
