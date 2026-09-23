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

  // Best-effort rematch avoidance: for every pair that already played, look for
  // ANY later pair (not just the immediate neighbor) whose second players can be
  // swapped so that both pairs stop being repeats, and keep sweeping until no
  // more such swap exists. Each successful swap strictly reduces the number of
  // repeat pairs, so this always terminates; it still isn't a full matching
  // (only player2 slots are ever swapped, and it won't backtrack out of a swap
  // that turns out to block a later one), but it clears far more repeats than a
  // single neighbor-only pass, which is all that's warranted at club-night scale.
  let swapped = true;
  while (swapped) {
    swapped = false;
    for (let i = 0; i < pairs.length; i++) {
      if (!playedPairs.has(pairKey(pairs[i].player1Id, pairs[i].player2Id))) continue;
      for (let j = i + 1; j < pairs.length; j++) {
        const swappedI = { player1Id: pairs[i].player1Id, player2Id: pairs[j].player2Id };
        const swappedJ = { player1Id: pairs[j].player1Id, player2Id: pairs[i].player2Id };
        if (!playedPairs.has(pairKey(swappedI.player1Id, swappedI.player2Id)) && !playedPairs.has(pairKey(swappedJ.player1Id, swappedJ.player2Id))) {
          pairs[i] = swappedI;
          pairs[j] = swappedJ;
          swapped = true;
          break;
        }
      }
    }
  }

  return { pairs, byeUserId };
}
