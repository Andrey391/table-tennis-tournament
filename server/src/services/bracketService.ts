import { prisma } from "../config/db.js";

export class BracketService {
  static generateOlympicBracket(players: { id: string; seed?: number | null }[]) {
    const sorted = [...players].sort((a, b) => (a.seed || 999) - (b.seed || 999));
    const n = Math.pow(2, Math.ceil(Math.log2(sorted.length || 2)));
    const padded = [...sorted, ...Array(n - sorted.length).fill(null)];
    const matchups = [];
    for (let i = 0; i < padded.length / 2; i++) {
      matchups.push({ player1: padded[i], player2: padded[padded.length - 1 - i], round: 1 });
    }
    return matchups;
  }

  static generateRoundRobin(groups: { id: string; players: { id: string }[] }[]) {
    const schedule = [];
    for (const group of groups) {
      const players = group.players;
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          schedule.push({ groupId: group.id, player1Id: players[i].id, player2Id: players[j].id });
        }
      }
    }
    return schedule;
  }

  static calculateStandings(matches: any[]) {
    const stats: Record<string, { won: number; lost: number; draws: number; pointsFor: number; pointsAgainst: number; gamesWon: number; gamesLost: number }> = {};
    for (const m of matches) {
      if (m.status !== "COMPLETED") continue;
      const p1 = m.player1Id || m.team1Id;
      const p2 = m.player2Id || m.team2Id;
      if (!p1 || !p2) continue;
      if (!stats[p1]) stats[p1] = { won: 0, lost: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, gamesWon: 0, gamesLost: 0 };
      if (!stats[p2]) stats[p2] = { won: 0, lost: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, gamesWon: 0, gamesLost: 0 };
      if (m.gamesWon1 > m.gamesWon2) {
        stats[p1].won++;
        stats[p2].lost++;
      } else if (m.gamesWon2 > m.gamesWon1) {
        stats[p2].won++;
        stats[p1].lost++;
      } else {
        stats[p1].draws++;
        stats[p2].draws++;
      }
      stats[p1].pointsFor += m.score1;
      stats[p1].pointsAgainst += m.score2;
      stats[p1].gamesWon += m.gamesWon1;
      stats[p1].gamesLost += m.gamesWon2;
      stats[p2].pointsFor += m.score2;
      stats[p2].pointsAgainst += m.score1;
      stats[p2].gamesWon += m.gamesWon2;
      stats[p2].gamesLost += m.gamesWon1;
    }
    return Object.entries(stats)
      .map(([id, s]) => ({
        id,
        ...s,
        points: s.won * 3 + s.draws,
        gameRatio: s.gamesWon / (s.gamesLost || 1),
        pointRatio: s.pointsFor / (s.pointsAgainst || 1),
      }))
      .sort((a, b) => b.points - a.points || b.gameRatio - a.gameRatio || b.pointRatio - a.pointRatio);
  }
}
