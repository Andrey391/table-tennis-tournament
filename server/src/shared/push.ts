import webpush from "web-push";
import { prisma } from "../config/db";
import type { NewNotification } from "./notify";

// Web Push: the in-app inbox, delivered to a phone with the app closed. The one
// message that matters at a club night is "round 3 is out, you play Ivan at table
// 2", and polling cannot say it to a phone in someone's pocket.
//
// Off unless VAPID keys are configured (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT, a mailto: or https: contact; generate a pair with
// `npx web-push generate-vapid-keys`). Read on first use, like the mail settings,
// so a deployment without them still starts and only push stays silent.
//
// The payload is the notification itself (type, params, link), never text: the
// service worker renders it with the same dictionary the inbox uses, in the
// language stored with the device.

let configured: boolean | null = null;

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function ready(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@localhost", pub, priv);
    configured = true;
  } catch (err: any) {
    console.error("[PUSH config]", err?.message);
    configured = false;
  }
  return configured;
}

// Sends each notification to every device of its recipient. Never throws, same
// as notify(). Sends go out in parallel and are awaited (a serverless function is
// frozen once it answers), each capped by a short timeout so a slow push service
// cannot hold up pairing a round. Endpoints the push service reports gone are
// deleted.
export async function sendPush(items: NewNotification[]): Promise<void> {
  if (!items.length || !ready()) return;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: [...new Set(items.map((n) => n.userId))] } } });
    if (!subs.length) return;
    const gone: string[] = [];
    await Promise.allSettled(items.flatMap((n) => subs.filter((s) => s.userId === n.userId).map(async (s) => {
      const payload = JSON.stringify({ type: n.type, params: n.params ?? {}, link: n.link ?? null, tournamentId: n.tournamentId ?? null, lang: s.lang });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, timeout: 5000, urgency: "high" });
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(s.id);
        else console.error("[PUSH send]", err?.statusCode ?? "", err?.message);
      }
    })));
    if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  } catch (err: any) {
    console.error("[PUSH]", err?.message);
  }
}
