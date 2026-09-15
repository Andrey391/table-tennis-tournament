export const ROLES = ["ADMIN", "ORGANIZER", "JUDGE", "PLAYER", "VIEWER"] as const;
export const TOURNAMENT_TYPES = ["SINGLE", "DOUBLE", "TEAM"] as const;
export const SYSTEMS = ["ROUND_ROBIN", "OLYMPIC", "DOUBLE_ELIMINATION", "MIXED"] as const;
export const FORMATS = ["BEST_OF_3", "BEST_OF_5", "BEST_OF_7"] as const;

export function formatScore(score1: number, score2: number): string {
  return `${score1}:${score2}`;
}

export function isGameComplete(score1: number, score2: number, format: string): boolean {
  const winScore = format === "BEST_OF_3" ? 2 : format === "BEST_OF_5" ? 3 : 4;
  if (Math.max(score1, score2) >= winScore && Math.abs(score1 - score2) >= 2) return true;
  return false;
}
