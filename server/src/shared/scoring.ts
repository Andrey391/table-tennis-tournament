export function isGameWinner(score1: number, score2: number): number | null {
  if (score1 >= 11 && score1 - score2 >= 2) return 1;
  if (score2 >= 11 && score2 - score1 >= 2) return 2;
  return null;
}

export function isDeuce(score1: number, score2: number): boolean {
  return score1 >= 10 && score2 >= 10;
}

export function getRequiredWins(format: string): number {
  switch (format) {
    case "BEST_OF_3": return 2;
    case "BEST_OF_5": return 3;
    case "BEST_OF_7": return 4;
    default: return 2;
  }
}

export function calculateServeSide(totalPoints: number, currentServer: number, isDeuceMode: boolean): number {
  if (isDeuceMode) {
    return currentServer;
  }
  return Math.floor(totalPoints / 2) % 2 === 0 ? currentServer : (currentServer === 1 ? 2 : 1);
}

export function shouldSwitchServer(totalPoints: number, isDeuceMode: boolean): boolean {
  if (isDeuceMode) return true;
  return totalPoints % 2 === 0;
}

export function getMatchWinner(gamesWon1: number, gamesWon2: number, format: string): number | null {
  const required = getRequiredWins(format);
  if (gamesWon1 >= required) return 1;
  if (gamesWon2 >= required) return 2;
  return null;
}
