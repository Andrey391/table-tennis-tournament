import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { UpdateProfileSchema } from "../shared/schemas.js";
import bcrypt from "bcryptjs";

export const playerRouter = Router();

const listSelect = { id: true, email: true, firstName: true, lastName: true, role: true, club: true, city: true, rating: true, createdAt: true };
// What the owner gets back after editing — the same shape `/auth/me` returns, so
// the client can drop it straight into its session user.
const selfSelect = { ...listSelect, phone: true, dateOfBirth: true };

playerRouter.get("/", authMiddleware, async (_req, res: Response) => {
  const players = await prisma.user.findMany({ select: listSelect, orderBy: { rating: "desc" } });
  res.json(players);
});

// Anyone signed in can open anyone's profile: who they are, how they are doing,
// and the matches behind it. The match list is what "who did I play last
// Thursday" needs, and the profile screen had no answer for it.
playerRouter.get("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const player = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, firstName: true, lastName: true, club: true, city: true, rating: true, createdAt: true },
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
  let wins = 0, losses = 0;
  for (const m of matches) {
    const isP1 = m.player1Id === player.id;
    const mine = isP1 ? m.setsWon1 : m.setsWon2;
    const theirs = isP1 ? m.setsWon2 : m.setsWon1;
    if (mine > theirs) wins++; else if (theirs > mine) losses++;
  }
  res.json({ player, matches, recent: { wins, losses } });
});

// A player edits their own profile. Rating is never client-settable — it only moves
// through Elo after a match — and admins are the only ones who can edit someone else.
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
    res.status(400).json({ error: err.message });
  }
});

export const ratingRouter = Router();

ratingRouter.get("/", async (_req, res: Response) => {
  const players = await prisma.user.findMany({
    select: { id: true, firstName: true, lastName: true, club: true, city: true, rating: true },
    orderBy: { rating: "desc" },
    take: 100,
  });
  res.json(players);
});
