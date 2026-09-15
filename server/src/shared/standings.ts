export interface GroupStanding {
  userId: string;
  firstName: string;
  lastName: string;
  club?: string;
  seed?: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
  matchPoints: number;
  headToHead: Record<string, { wins: number; gamesWon: number; gamesLost: number }>;
}

export function calculateGroupStandings(matches: any[], players: any[]): GroupStanding[] {
  const standings: Map<string, GroupStanding> = new Map();

  for (const p of players) {
    standings.set(p.userId || p.id, {
      userId: p.userId || p.id,
      firstName: p.user?.firstName || p.firstName,
      lastName: p.user?.lastName || p.lastName,
      club: p.user?.club || p.club,
      seed: p.seed,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointsWon: 0,
      pointsLost: 0,
      matchPoints: 0,
      headToHead: {},
    });
  }

  for (const m of matches) {
    if (m.status !== "COMPLETED") continue;
    const p1 = m.player1;
    const p2 = m.player2;
    if (!p1 || !p2) continue;

    const id1 = p1.userId || p1.id;
    const id2 = p2.userId || p2.id;

    let s1 = standings.get(id1);
    let s2 = standings.get(id2);
    if (!s1 || !s2) continue;

    s1.gamesWon += m.gamesWon1;
    s1.gamesLost += m.gamesWon2;
    s1.pointsWon += m.score1;
    s1.pointsLost += m.score2;
    s2.gamesWon += m.gamesWon2;
    s2.gamesLost += m.gamesWon1;
    s2.pointsWon += m.score2;
    s2.pointsLost += m.score1;

    if (m.gamesWon1 > m.gamesWon2) {
      s1.wins++;
      s2.losses++;
      s1.matchPoints += 2;
    } else {
      s2.wins++;
      s1.losses++;
      s2.matchPoints += 2;
    }

    if (!s1.headToHead[id2]) s1.headToHead[id2] = { wins: 0, gamesWon: 0, gamesLost: 0 };
    if (!s2.headToHead[id1]) s2.headToHead[id1] = { wins: 0, gamesWon: 0, gamesLost: 0 };

    s1.headToHead[id2].gamesWon += m.gamesWon1;
    s1.headToHead[id2].gamesLost += m.gamesWon2;
    s2.headToHead[id1].gamesWon += m.gamesWon2;
    s2.headToHead[id1].gamesLost += m.gamesWon1;

    if (m.gamesWon1 > m.gamesWon2) {
      s1.headToHead[id2].wins++;
    } else {
      s2.headToHead[id1].wins++;
    }
  }

  const arr = Array.from(standings.values());

  arr.sort((a, b) => {
    if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;

    const h2h = a.headToHead[b.userId];
    if (h2h) {
      const other = b.headToHead[a.userId];
      if (h2h.wins !== other?.wins) return h2h.wins - other.wins;
    }

    const aRatio = a.gamesLost > 0 ? a.gamesWon / a.gamesLost : a.gamesWon;
    const bRatio = b.gamesLost > 0 ? b.gamesWon / b.gamesLost : b.gamesWon;
    if (Math.abs(aRatio - bRatio) > 0.001) return bRatio - aRatio;

    const aPts = a.pointsLost > 0 ? a.pointsWon / a.pointsLost : a.pointsWon;
    const bPts = b.pointsLost > 0 ? b.pointsWon / b.pointsLost : b.pointsWon;
    if (Math.abs(aPts - bPts) > 0.001) return bPts - aPts;

    if (a.seed && b.seed) return a.seed - b.seed;
    return 0;
  });

  arr.forEach((s, i) => { s.matchPoints = i; });

  arr.forEach((s, i) => { (s as any).position = i + 1; });

  return arr;
}
