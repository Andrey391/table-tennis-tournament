import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { CreateGameSchema, GameSettingsSchema, ScorePointSchema, ForfeitSchema } from "../shared/schemas.js";
import { isDeuce, getMatchWinner, nextServerSide } from "../shared/scoring.js";

export const gameRouter = Router();

const playerSelect = { id: true, firstName: true, lastName: true, club: true, rating: true };
const gameInclude = {
  organizer: { select: { id: true, firstName: true, lastName: true } },
  player1: { select: playerSelect },
  player2: { select: playerSelect },
  club: { select: { id: true, name: true, city: true, address: true } },
  table: { select: { id: true, number: true } },
};

// Unlike a tournament match, a casual game is scored by anyone actually involved:
// its creator or either of the two players. There's no separate judge here.
async function loadPlayableGame(res: Response, gameId: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) { res.status(404).json({ error: "Not found" }); return null; }
  if (game.organizerId !== userId && game.player1Id !== userId && game.player2Id !== userId) {
    res.status(403).json({ error: "Only the players or the game's creator can score it" });
    return null;
  }
  return game;
}

// NOTE: games never touch User.rating. That's the point of them — see CLAUDE.md
// "Games are unrated". Don't add an applyEloUpdate call here.

gameRouter.get("/", async (req, res: Response) => {
  const { city, clubId, status, from, to } = req.query as Record<string, string | undefined>;
  const games = await prisma.game.findMany({
    where: {
      ...(clubId ? { clubId } : {}),
      ...(city ? { club: { city } } : {}),
      ...(status ? { status: { in: status.split(",") as any } } : {}),
      ...(from || to ? { startTime: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: gameInclude,
    orderBy: [{ startTime: "asc" }, { createdAt: "desc" }],
  });
  res.json(games);
});

// "My games" — anything the caller created or is playing in. Above "/:id".
gameRouter.get("/mine", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const games = await prisma.game.findMany({
    where: { OR: [{ organizerId: userId }, { player1Id: userId }, { player2Id: userId }] },
    include: gameInclude,
    orderBy: [{ startTime: "asc" }, { createdAt: "desc" }],
  });
  res.json(games);
});

gameRouter.get("/:id", async (req, res: Response) => {
  const game = await prisma.game.findUnique({ where: { id: req.params.id }, include: gameInclude });
  if (!game) { res.status(404).json({ error: "Not found" }); return; }
  res.json(game);
});

// The creator takes the first slot; the second is left open for someone to join.
gameRouter.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = CreateGameSchema.parse(req.body);
    const userId = req.user!.userId;
    const game = await prisma.game.create({
      data: {
        title: data.title,
        clubId: data.clubId,
        tableId: data.tableId,
        startTime: data.startTime ? new Date(data.startTime) : undefined,
        pointsToWin: data.pointsToWin ?? 11,
        organizerId: userId,
        player1Id: userId,
        player2Id: data.player2Id,
      },
      include: gameInclude,
    });
    res.status(201).json(game);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Anyone signed in can take the free slot while the game hasn't started.
gameRouter.post("/:id/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const game = await prisma.game.findUnique({ where: { id: req.params.id } });
    if (!game) { res.status(404).json({ error: "Not found" }); return; }
    if (game.status !== "NOT_STARTED") { res.status(400).json({ error: "This game has already started" }); return; }
    if (game.player1Id === userId || game.player2Id === userId) { res.status(400).json({ error: "You are already in this game" }); return; }

    const slot = !game.player1Id ? "player1Id" : !game.player2Id ? "player2Id" : null;
    if (!slot) { res.status(400).json({ error: "This game is full" }); return; }

    const updated = await prisma.game.update({ where: { id: game.id }, data: { [slot]: userId }, include: gameInclude });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

gameRouter.post("/:id/leave", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const game = await prisma.game.findUnique({ where: { id: req.params.id } });
    if (!game) { res.status(404).json({ error: "Not found" }); return; }
    if (game.status !== "NOT_STARTED") { res.status(400).json({ error: "This game has already started" }); return; }

    const slot = game.player1Id === userId ? "player1Id" : game.player2Id === userId ? "player2Id" : null;
    if (!slot) { res.status(400).json({ error: "You are not in this game" }); return; }

    const updated = await prisma.game.update({ where: { id: game.id }, data: { [slot]: null }, include: gameInclude });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Point target is a per-game choice, settable only before the first point.
gameRouter.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const game = await loadPlayableGame(res, req.params.id, req.user!.userId);
    if (!game) return;
    const data = GameSettingsSchema.parse(req.body);
    if (data.pointsToWin && game.status !== "NOT_STARTED") {
      res.status(400).json({ error: "Can't change the target score once the game has started" });
      return;
    }
    const updated = await prisma.game.update({ where: { id: game.id }, data, include: gameInclude });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

gameRouter.post("/:id/start", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const game = await loadPlayableGame(res, req.params.id, req.user!.userId);
    if (!game) return;
    if (!game.player1Id || !game.player2Id) { res.status(400).json({ error: "The game needs two players" }); return; }
    const updated = await prisma.game.update({
      where: { id: game.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
      include: gameInclude,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

gameRouter.post("/:id/score", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const game = await loadPlayableGame(res, req.params.id, req.user!.userId);
    if (!game) return;
    if (game.status !== "IN_PROGRESS") { res.status(400).json({ error: "Game is not in progress" }); return; }

    const { side } = ScorePointSchema.parse(req.body);
    const score1 = side === 1 ? game.score1 + 1 : game.score1;
    const score2 = side === 2 ? game.score2 + 1 : game.score2;
    const deuce = isDeuce(score1, score2, game.pointsToWin);
    const server = nextServerSide(score1 + score2, game.serverSide, deuce);
    const winner = getMatchWinner(score1, score2, game.pointsToWin);

    const updated = await prisma.game.update({
      where: { id: game.id },
      data: {
        score1, score2, serverSide: server, lastScorer: side, prevServerSide: game.serverSide,
        status: winner ? "COMPLETED" : "IN_PROGRESS",
        endedAt: winner ? new Date() : undefined,
      },
      include: gameInclude,
    });

    // No Elo update, no tournament to complete — a finished game is just a record.
    res.json({ game: updated, deuce, winner });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

gameRouter.post("/:id/undo", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const game = await loadPlayableGame(res, req.params.id, req.user!.userId);
    if (!game) return;
    if (game.lastScorer == null) { res.status(400).json({ error: "Nothing to undo" }); return; }

    const updated = await prisma.game.update({
      where: { id: game.id },
      data: {
        score1: game.lastScorer === 1 ? Math.max(0, game.score1 - 1) : game.score1,
        score2: game.lastScorer === 2 ? Math.max(0, game.score2 - 1) : game.score2,
        serverSide: game.prevServerSide ?? game.serverSide,
        lastScorer: null,
        prevServerSide: null,
        status: "IN_PROGRESS",
        endedAt: null,
      },
      include: gameInclude,
    });
    res.json({ game: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

gameRouter.post("/:id/let", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const game = await loadPlayableGame(res, req.params.id, req.user!.userId);
    if (!game) return;
    const updated = await prisma.game.update({ where: { id: game.id }, data: { letCount: game.letCount + 1 }, include: gameInclude });
    res.json({ game: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

gameRouter.post("/:id/end", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const game = await loadPlayableGame(res, req.params.id, req.user!.userId);
    if (!game) return;
    const updated = await prisma.game.update({
      where: { id: game.id },
      data: { status: "COMPLETED", endedAt: new Date() },
      include: gameInclude,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Walkover, same reasoning as a match forfeit: a player who never showed up
// would otherwise leave the game stuck at NOT_STARTED forever.
gameRouter.post("/:id/forfeit", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const game = await loadPlayableGame(res, req.params.id, req.user!.userId);
    if (!game) return;
    if (game.status === "COMPLETED") { res.status(400).json({ error: "Game is already finished" }); return; }

    const { loserSide } = ForfeitSchema.parse(req.body);
    const updated = await prisma.game.update({
      where: { id: game.id },
      data: {
        score1: loserSide === 1 ? 0 : game.pointsToWin,
        score2: loserSide === 2 ? 0 : game.pointsToWin,
        status: "COMPLETED",
        endedAt: new Date(),
      },
      include: gameInclude,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

gameRouter.delete("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const game = await prisma.game.findUnique({ where: { id: req.params.id } });
    if (!game) { res.status(404).json({ error: "Not found" }); return; }
    if (game.organizerId !== req.user!.userId) { res.status(403).json({ error: "Only the game's creator can delete it" }); return; }
    await prisma.game.delete({ where: { id: game.id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
