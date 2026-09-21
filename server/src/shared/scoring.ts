// Scoring is per set, not per point: the judge records who took each set and
// nothing tracks the rally-by-rally score. The helpers that used to live here
// (isDeuce, getMatchWinner, nextServerSide, POINTS_TO_WIN_OPTIONS) went with the
// point-by-point board and are not coming back by accident — see CLAUDE.md.
// What remains is the rating maths, which is still applied when a match is settled.

export const DEFAULT_RATING_WEIGHT = 0.5;
const RATING_CUTOFF = 100;

const round2 = (n: number) => Math.round(n * 100) / 100;

// The FNTR (Russian Table Tennis Federation) rating update, applied per match:
//   winner gains  (100 - (Rw - Rl)) / 10 * KT
//   loser  loses  half of that
// Rw/Rl are the two players' ratings, KT the tournament's significance coefficient
// (0.1-1, FNTR default 0.5). A win over someone more than 100 points weaker is worth
// nothing to either side; without that cut-off the formula would go negative and the
// winner would lose points. Unlike Elo the exchange is not zero-sum, so both deltas
// are returned and stored. `loserDelta` is <= 0. Values are kept to two decimals.
export function computeFntrDelta(winnerRating: number, loserRating: number, weight: number = DEFAULT_RATING_WEIGHT): { winnerDelta: number; loserDelta: number } {
  const gap = winnerRating - loserRating;
  if (gap > RATING_CUTOFF) return { winnerDelta: 0, loserDelta: 0 };
  const winnerDelta = round2(((RATING_CUTOFF - gap) / 10) * weight);
  const half = round2(winnerDelta / 2);
  return { winnerDelta, loserDelta: half === 0 ? 0 : -half };
}

// Checks an optional rally score typed in for a set ("11:7"). Both numbers or
// neither; when given, the side credited with the set must have the higher score.
// Returns an error message, or null when the input is acceptable.
export function checkSetScore(side: 1 | 2, score1?: number | null, score2?: number | null): string | null {
  const has1 = score1 != null, has2 = score2 != null;
  if (!has1 && !has2) return null;
  if (has1 !== has2) return "Enter both scores of the set or neither";
  if (score1 === score2) return "A set cannot end level";
  if ((side === 1) !== (score1! > score2!)) return "The set score does not match who took the set";
  return null;
}

// A match cannot end level in table tennis, and one with no sets has no result.
// Returns an error message, or null when the tally can be settled.
export function checkCanEnd(setsWon1: number, setsWon2: number): string | null {
  if (setsWon1 + setsWon2 === 0) return "No sets recorded yet";
  if (setsWon1 === setsWon2) return "A match cannot end in a draw: play a deciding set";
  return null;
}
