export function generateRoundRobinSchedule(players: any[], groupId?: string, startRound: number = 1): any[] {
  const n = players.length;
  const matches: any[] = [];

  if (n < 2) return matches;

  const list = n % 2 === 1 ? [...players, null] : [...players];

  const rounds = list.length - 1;
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < list.length / 2; i++) {
      const p1 = list[i];
      const p2 = list[list.length - 1 - i];
      if (p1 && p2) {
        matches.push({
          player1Id: p1.id,
          player2Id: p2.id,
          round: startRound + round,
          matchIndex: i,
          groupId,
        });
      }
    }
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  return matches;
}

export function generateOlympicBracket(players: any[], startRound: number = 1): any[] {
  const matches: any[] = [];
  const sorted = [...players].sort((a, b) => (a.seed || 999) - (b.seed || 999));
  const n = sorted.length;
  const totalRounds = Math.ceil(Math.log2(n));
  const firstRoundSize = Math.pow(2, totalRounds);

  const round1: any[] = [];
  for (let i = 0; i < firstRoundSize; i++) {
    const seed = i < n ? sorted[i] : null;
    const oppIdx = firstRoundSize - 1 - i;
    const opp = oppIdx < n ? sorted[oppIdx] : null;
    if (seed && opp) {
      round1.push({ player1Id: seed.id, player2Id: opp.id, round: startRound + totalRounds - 1, matchIndex: i });
    } else if (seed && !opp) {
      round1.push({ player1Id: seed.id, player2Id: null, round: startRound + totalRounds - 1, matchIndex: i, status: "COMPLETED", gamesWon1: 1, gamesWon2: 0 });
    }
  }

  matches.push(...round1);

  let currentRound = round1;
  for (let r = totalRounds - 2; r >= 0; r--) {
    const nextRound: any[] = [];
    for (let i = 0; i < currentRound.length; i += 2) {
      nextRound.push({
        player1Id: null,
        player2Id: null,
        round: startRound + r,
        matchIndex: Math.floor(i / 2),
      });
    }
    matches.push(...nextRound);
    currentRound = nextRound;
  }

  return matches;
}

export function generateDoubleElimination(players: any[]): any[] {
  const matches: any[] = [];
  const n = players.length;
  const totalRounds = Math.ceil(Math.log2(n));

  let round = 1;
  let currentPlayers = [...players].sort((a, b) => (a.seed || 999) - (b.seed || 999));

  while (currentPlayers.length > 1) {
    for (let i = 0; i < currentPlayers.length; i += 2) {
      matches.push({
        player1Id: currentPlayers[i].id,
        player2Id: currentPlayers[i + 1]?.id || null,
        round,
        matchIndex: Math.floor(i / 2),
        type: "WINNERS",
      });
    }
    const next: any[] = [];
    for (let i = 0; i < currentPlayers.length; i += 2) {
      if (currentPlayers[i + 1]) {
        next.push({ id: `pending_${round}_${i}`, seed: currentPlayers[i].seed });
      } else {
        next.push(currentPlayers[i]);
      }
    }
    currentPlayers = next;
    round++;
  }

  let losersRound = totalRounds + 1;
  let losers: any[] = [];
  for (let r = 1; r < round; r++) {
    for (let i = 0; i < Math.pow(2, r); i += 2) {
      losers.push({ id: `loser_${r}_${i}` });
    }
  }

  while (losers.length > 1) {
    for (let i = 0; i < losers.length; i += 2) {
      matches.push({
        player1Id: losers[i].id,
        player2Id: losers[i + 1]?.id || null,
        round: losersRound,
        matchIndex: Math.floor(i / 2),
        type: "LOSERS",
      });
    }
    losers = losers.filter((_, i) => i % 2 === 0);
    losersRound++;
  }

  matches.push({
    player1Id: null,
    player2Id: null,
    round: losersRound,
    matchIndex: 0,
    type: "GRAND_FINAL",
  });

  return matches;
}
