import { Response } from "express";
import { Router } from "../shared/router";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { MarkNotificationsReadSchema, PushSubscribeSchema, PushUnsubscribeSchema } from "../shared/schemas";
import { NOTIFICATION_TTL_DAYS } from "../shared/notify";
import { pushPublicKey } from "../shared/push";

export const notificationRouter = Router();

const PAGE = 50;

// The caller's inbox, newest first, with the unread count. Anything older than
// the retention window is dropped here rather than by a scheduled job — neither
// deployment has a scheduler, and an inbox only grows while its owner uses it.
notificationRouter.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  // The sweep runs alongside the reads rather than before them: it only removes
  // rows past the retention window, which the page of 50 newest never shows.
  const [, items, unread] = await Promise.all([
    prisma.notification.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - NOTIFICATION_TTL_DAYS * 86400 * 1000) } } })
      .catch((e) => console.error("[NOTIFY sweep]", e?.message)),
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

// Web Push (shared/push.ts). The client asks for the server's public key first:
// null means push is not configured here, and the client offers nothing.
notificationRouter.get("/push/key", (_req, res: Response) => {
  res.json({ publicKey: pushPublicKey() });
});

// Registers this device for the caller, or moves it to them: a phone that changes
// hands (log out, someone else logs in) keeps one endpoint, and it must stop
// receiving the previous owner's notifications. Also how the client updates the
// language the device renders in.
notificationRouter.post("/push/subscribe", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { endpoint, keys, lang } = PushSubscribeSchema.parse(req.body ?? {});
    const data = { userId: req.user!.userId, p256dh: keys.p256dh, auth: keys.auth, lang: lang ?? "ru" };
    await prisma.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...data }, update: data });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Only ever removes the caller's own device.
notificationRouter.post("/push/unsubscribe", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { endpoint } = PushUnsubscribeSchema.parse(req.body ?? {});
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.userId } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});
