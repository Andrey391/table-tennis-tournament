import { Router, Response } from "express";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { MarkNotificationsReadSchema } from "../shared/schemas";
import { NOTIFICATION_TTL_DAYS } from "../shared/notify";

export const notificationRouter = Router();

const PAGE = 50;

// The caller's inbox, newest first, with the unread count. Anything older than
// the retention window is dropped here rather than by a scheduled job — neither
// deployment has a scheduler, and an inbox only grows while its owner uses it.
notificationRouter.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  await prisma.notification.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - NOTIFICATION_TTL_DAYS * 86400 * 1000) } } })
    .catch((e) => console.error("[NOTIFY sweep]", e?.message));
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: PAGE }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  res.json({ items, unread });
});

// The header bell polls this: one count, nothing else. `latestId` lets the
// client tell a new arrival from the same unread item it already showed.
notificationRouter.get("/unread", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const [unread, latest] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findFirst({ where: { userId, readAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({ unread, latest });
});

// Marks the listed notifications read, or all of the caller's when `ids` is
// omitted. Only ever touches the caller's own rows.
notificationRouter.post("/read", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids } = MarkNotificationsReadSchema.parse(req.body ?? {});
    const { count } = await prisma.notification.updateMany({
      where: { userId: req.user!.userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    res.json({ ok: true, count });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});
