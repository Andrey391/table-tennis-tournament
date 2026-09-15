import { prisma } from "../config/db.js";

export class TournamentService {
  async create(data: any, organizerId: string) {
    return prisma.tournament.create({ data: { ...data, organizerId } });
  }

  async getById(id: string) {
    return prisma.tournament.findUnique({
      where: { id },
      include: {
        groups: { include: { matches: { include: { player1: true, player2: true, team1: true, team2: true } } } },
        matches: { include: { player1: true, player2: true, team1: true, team2: true, judge: true } },
        brackets: true,
        ratings: { include: { player: true } },
        players: { include: { user: true } },
        teams: { include: { players: true } },
      },
    });
  }

  async getAll() {
    return prisma.tournament.findMany({
      include: { organizer: { select: { firstName: true, lastName: true } }, _count: { select: { matches: true, players: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(id: string, data: any) {
    return prisma.tournament.update({ where: { id }, data });
  }

  async generateDraw(tournamentId: string) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: { players: true } });
    if (!tournament) throw new Error("Tournament not found");
    const players = tournament.players.sort(() => Math.random() - 0.5);
    return prisma.$transaction(players.map((p: { id: string }, idx: number) => prisma.tournamentUser.update({ where: { id: p.id }, data: { seed: idx + 1 } })));
  }

  async createGroups(tournamentId: string, groupCount: number) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: { players: true } });
    if (!tournament) throw new Error("Tournament not found");
    const groups = [];
    for (let i = 0; i < groupCount; i++) {
      const group = await prisma.group.create({
        data: { tournamentId, name: `Group ${String.fromCharCode(65 + i)}`, playersInGroup: Math.ceil(tournament.players.length / groupCount) },
      });
      groups.push(group);
    }
    return groups;
  }
}

export class MatchService {
  async create(data: any) {
    return prisma.match.create({ data });
  }

  async updateScore(matchId: string, score: any, userId: string) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Match not found");
    const updated = await prisma.match.update({ where: { id: matchId }, data: { ...score, updatedAt: new Date() } });
    return updated;
  }

  async recordLet(matchId: string) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Match not found");
    return prisma.game.create({ data: { matchId, player1Score: match.score1, player2Score: match.score2, letCount: 1, serverSide: 1, state: "LET" } });
  }

  async endMatch(matchId: string, userId: string) {
    const match = await prisma.match.update({ where: { id: matchId }, data: { status: "COMPLETED", endedAt: new Date() } });
    return match;
  }

  async getByTournament(tournamentId: string) {
    return prisma.match.findMany({
      where: { tournamentId },
      include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true, games: true },
      orderBy: [{ round: "asc" }, { tableNumber: "asc" }],
    });
  }

  async getById(id: string) {
    return prisma.match.findUnique({
      where: { id },
      include: { player1: true, player2: true, team1: true, team2: true, judge: true, group: true, bracket: true, games: true },
    });
  }
}
