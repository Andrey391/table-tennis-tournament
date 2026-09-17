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
