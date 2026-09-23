import { Router, Response } from "express";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { UpdateProfileSchema } from "../shared/schemas";
import { summariseMatches } from "../shared/stats";
import { notDemo } from "../shared/demo";
import { startOfUtcDay } from "../shared/booking";
import { playerSelect } from "../shared/queries";
import bcrypt from "bcryptjs";

export const playerRouter = Router();

// Any signed-up account can read this list, so it carries no contact details.
const listSelect = { id: true, firstName: true, lastName: true, role: true, city: true, rating: true, createdAt: true };
// What the owner gets back after editing — the same shape `/auth/me` returns, so
// the client can drop it straight into its session user.
const selfSelect = { ...listSelect, email: true, phone: true, dateOfBirth: true };

playerRouter.get("/", authMiddleware, async (_req, res: Response) => {
  // Demo accounts are throwaway, and their sparring partners are not people at
  // all — neither belongs in a list of players you can add to a real event.
  const players = await prisma.user.findMany({ where: notDemo, select: listSelect, orderBy: { rating: "desc" } });
  res.json(players);
});

// Anyone can open anyone's profile, signed in or not: who they are, how they are
// doing, and the matches behind it. Unauthenticated because a guest browsing the
// rating table must be able to tap through to a player — the select below is the
// public shape (no email, no phone), unlike GET /players, which stays gated.
playerRouter.get("/:id", async (req: AuthenticatedRequest, res: Response) => {
  const player = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, firstName: true, lastName: true, city: true, rating: true, createdAt: true },
  });
  if (!player) { res.status(404).json({ error: "Not found" }); return; }

  const matches = await prisma.match.findMany({
    where: { status: "COMPLETED", OR: [{ player1Id: player.id }, { player2Id: player.id }] },
    include: {
      player1: { select: { id: true, firstName: true, lastName: true, rating: true } },
      player2: { select: { id: true, firstName: true, lastName: true, rating: true } },
      tournament: { select: { id: true, name: true, kind: true } },
      sets: { select: { index: true, winner: true, status: true }, orderBy: { index: "asc" } },
    },
    orderBy: { endedAt: "desc" },
    take: 25,
  });

  // Rated matches only move the rating, but the record covers everything played.
  const { wins, losses } = summariseMatches(matches, player.id).matches;
  res.json({ player, matches, recent: { wins, losses } });
});

// A player's matches on one calendar day — the personal counterpart to a club's
// table timeline (GET /clubs/:id/availability). A match has no scheduled time of
// its own (only startedAt/endedAt, set once a judge actually opens/settles it), so
// a day's matches are either already played (real start/end, positioned exactly
// like a booking) or not yet started, in which case the event's own startTime is
// the only "when" there is. Unauthenticated for the same reason GET /players/:id
// is: a guest tapping through the rating table can look at anyone's day.
playerRouter.get("/:id/schedule", async (req, res: Response) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  if (!date) { res.status(400).json({ error: "date is required" }); return; }
  const dayStart = startOfUtcDay(date);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const playerId = req.params.id;

  const matches = await prisma.match.findMany({
    where: {
      AND: [
        { OR: [{ player1Id: playerId }, { player2Id: playerId }] },
        { OR: [
          { status: "COMPLETED", endedAt: { gte: dayStart, lt: dayEnd } },
          { status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, tournament: { startTime: { gte: dayStart, lt: dayEnd } } },
        ] },
      ],
    },
    include: {
      player1: { select: playerSelect },
      player2: { select: playerSelect },
      tournament: { select: { id: true, name: true, kind: true, startTime: true } },
      sets: { orderBy: { index: "asc" } },
    },
    orderBy: [{ startedAt: "asc" }],
  });
  res.json(matches);
});

// A player edits their own profile. Rating is never client-settable — it only moves
// through the FNTR formula after a match — and admins are the only ones who can edit someone else.
playerRouter.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.params.id !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "You can only edit your own profile" });
      return;
    }
    const { currentPassword, newPassword, dateOfBirth, ...rest } = UpdateProfileSchema.parse(req.body);

    // Only the fields that were actually sent are written, so a form that submits
    // one changed field doesn't blank the rest.
    const data: Record<string, unknown> = { ...rest };
    if (dateOfBirth !== undefined) data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;

    if (newPassword) {
      const current = await prisma.user.findUnique({ where: { id: req.params.id }, select: { password: true } });
      if (!current) { res.status(404).json({ error: "Not found" }); return; }
      // An admin editing someone else has no current password to offer; the owner does.
      if (req.params.id === req.user!.userId) {
        if (!currentPassword || !(await bcrypt.compare(currentPassword, current.password))) {
          res.status(400).json({ error: "Current password is wrong" });
          return;
        }
      }
      data.password = await bcrypt.hash(newPassword, 10);
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: selfSelect });
    res.json(user);
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "An account with this email already exists" }); return; }
    res.status(400).json({ error: publicError(err) });
  }
});

export const ratingRouter = Router();

ratingRouter.get("/", async (_req, res: Response) => {
  const players = await prisma.user.findMany({
    where: notDemo,
    select: { id: true, firstName: true, lastName: true, city: true, rating: true },
    orderBy: { rating: "desc" },
    take: 100,
  });
  res.json(players);
});
