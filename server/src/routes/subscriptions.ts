import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { SubscribeSchema } from "../shared/schemas.js";

export const subscriptionRouter = Router();

// "Follow a club" list — no billing, just a saved-list feature (see "My subscriptions").
subscriptionRouter.get("/mine", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const subscriptions = await prisma.subscription.findMany({ where: { userId: req.user!.userId }, orderBy: { createdAt: "desc" } });
  res.json(subscriptions);
});

subscriptionRouter.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { club } = SubscribeSchema.parse(req.body);
    const subscription = await prisma.subscription.create({ data: { userId: req.user!.userId, club } });
    res.status(201).json(subscription);
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "Already subscribed" }); return; }
    res.status(400).json({ error: err.message });
  }
});

subscriptionRouter.delete("/:club", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.subscription.delete({ where: { userId_club: { userId: req.user!.userId, club: req.params.club } } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
