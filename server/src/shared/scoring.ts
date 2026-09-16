export const POINTS_TO_WIN_OPTIONS = [11, 21] as const;

export function isDeuce(score1: number, score2: number, pointsToWin: number): boolean {
  return score1 >= pointsToWin - 1 && score2 >= pointsToWin - 1;
}

export function getMatchWinner(score1: number, score2: number, pointsToWin: number): number | null {
  if (score1 >= pointsToWin && score1 - score2 >= 2) return 1;
  if (score2 >= pointsToWin && score2 - score1 >= 2) return 2;
  return null;
}

// Server switches every 2 points normally, every point once both players are one point from winning (deuce).
export function nextServerSide(totalPoints: number, currentServer: number, deuceMode: boolean): number {
  const shouldSwitch = deuceMode ? totalPoints % 2 !== 0 : Math.floor(totalPoints / 2) % 2 !== 0;
  return shouldSwitch ? (currentServer === 1 ? 2 : 1) : currentServer;
}
