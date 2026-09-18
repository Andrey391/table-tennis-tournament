export interface RoundCandidate {
  userId: string;
  rating: number;
  wins: number;
  matchesPlayed: number;
  // Manual seed set by the manager before round 1 (1 = top). Unseeded players
  // follow the seeded ones, by rating.
  seed?: number | null;
}

export interface RoundPairResult {
  pairs: { player1Id: string; player2Id: string }[];
  byeUserId: string | null;
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

// Round 1: the manager's manual seeding if any, otherwise rating. Later rounds: Swiss-style, ranked by
// wins so far (rating breaks ties), with a best-effort pass to avoid
// repeating a pairing that already happened earlier in the tournament.
export function generateRoundPairings(
  candidates: RoundCandidate[],
  isFirstRound: boolean,
  playedPairs: Set<string>
): RoundPairResult {
  const sorted = [...candidates].sort((a, b) => {
    if (!isFirstRound && a.wins !== b.wins) return b.wins - a.wins;
    if (isFirstRound) {
      const sa = a.seed ?? Infinity, sb = b.seed ?? Infinity;
      if (sa !== sb) return sa - sb;
    }
    return b.rating - a.rating;
  });

  let byeUserId: string | null = null;
  if (sorted.length % 2 === 1) {
    // Bye goes to whoever has played the MOST matches so far (i.e. sat out
    // the fewest times) — picking the fewest-matches player here would just
    // give the bye to whoever already has one, over and over, since sitting
    // out keeps their match count the lowest forever. Rating tiebreaks
    // (lowest first) among players tied on matches played.
    let byeIdx = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (
        sorted[i].matchesPlayed > sorted[byeIdx].matchesPlayed ||
        (sorted[i].matchesPlayed === sorted[byeIdx].matchesPlayed && sorted[i].rating < sorted[byeIdx].rating)
      ) {
        byeIdx = i;
      }
    }
    byeUserId = sorted[byeIdx].userId;
    sorted.splice(byeIdx, 1);
  }

  const ids = sorted.map((c) => c.userId);
  const pairs: { player1Id: string; player2Id: string }[] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push({ player1Id: ids[i], player2Id: ids[i + 1] });

  // Single best-effort pass: if a pair already played, try swapping the second
  // player with the next pair's second player to break up the rematch.
  for (let i = 0; i < pairs.length - 1; i++) {
    if (playedPairs.has(pairKey(pairs[i].player1Id, pairs[i].player2Id))) {
      const next = pairs[i + 1];
      const swappedA = { player1Id: pairs[i].player1Id, player2Id: next.player2Id };
      const swappedB = { player1Id: next.player1Id, player2Id: pairs[i].player2Id };
      if (!playedPairs.has(pairKey(swappedA.player1Id, swappedA.player2Id)) && !playedPairs.has(pairKey(swappedB.player1Id, swappedB.player2Id))) {
        pairs[i] = swappedA;
        pairs[i + 1] = swappedB;
      }
    }
  }

  return { pairs, byeUserId };
}
