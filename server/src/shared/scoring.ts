// Scoring is per set, not per point: the judge records who took each set and
// nothing tracks the rally-by-rally score. The helpers that used to live here
// (isDeuce, getMatchWinner, nextServerSide, POINTS_TO_WIN_OPTIONS) went with the
// point-by-point board and are not coming back by accident — see CLAUDE.md.
// What remains is the rating maths, which is still applied when a match is settled.

const ELO_K = 32;

// Standard Elo update: expected score from the rating gap, actual score is 1/0
// for win/loss, delta is symmetric (winner's gain equals loser's loss).
export function computeEloDelta(winnerRating: number, loserRating: number, k: number = ELO_K): { winnerDelta: number; loserDelta: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const winnerDelta = Math.round(k * (1 - expectedWinner));
  return { winnerDelta, loserDelta: -winnerDelta };
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
