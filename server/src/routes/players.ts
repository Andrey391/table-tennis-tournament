import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { UpdateProfileSchema } from "../shared/schemas.js";

export const playerRouter = Router();

const listSelect = { id: true, email: true, firstName: true, lastName: true, role: true, club: true, city: true, rating: true, createdAt: true };

playerRouter.get("/", authMiddleware, async (_req, res: Response) => {
  const players = await prisma.user.findMany({ select: listSelect, orderBy: { rating: "desc" } });
  res.json(players);
});

// A player edits their own profile. Rating is never client-settable — it only moves
// through Elo after a match — and admins are the only ones who can edit someone else.
playerRouter.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.params.id !== req.user!.userId && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "You can only edit your own profile" });
      return;
    }
    const data = UpdateProfileSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: listSelect });
    res.json(user);
  } catch (err: any) {
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
