import { apiService } from "../services/api";
import type { Lang } from "../i18n/dict";

// Push notifications on this device (the service worker is src/sw.ts, the sending
// side server/src/shared/push.ts). Kept outside React, like lib/tour.ts: several
// screens ask for the state and one button changes it.
//
// States, in the order they are checked:
//   unavailable   the server has no VAPID keys, so there is nothing to offer;
//   needs-install an iPhone/iPad in the browser: iOS lets only a home-screen app
//                 receive push, so the offer becomes "add to home screen";
//   unsupported   a browser with no Push API at all;
//   denied        the user blocked notifications, only browser settings undo it;
//   off / on      whether this device holds a subscription.
export type PushState = "unavailable" | "needs-install" | "unsupported" | "denied" | "off" | "on";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

let keyRequest: Promise<string | null> | null = null;
const serverKey = () => keyRequest ??= apiService.notifications.pushKey()
  .then(r => (r.data.publicKey as string | null) ?? null)
  .catch(() => { keyRequest = null; return null; });

const base64ToBytes = (s: string) => {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]);

// Registered once at startup (index.tsx). Nothing else depends on it being there.
export function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(err => console.error("[sw]", err));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register("/sw.js");
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!(await serverKey())) return "unavailable";
  if (!supported()) return isIos() && !standalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && (await currentSubscription()) ? "on" : "off";
}

// Must run from a tap: browsers (iOS strictly) only show the permission prompt
// in response to a user gesture.
export async function enablePush(lang: Lang): Promise<PushState> {
  const key = await serverKey();
  if (!key || !supported()) return pushState();
  if ((await Notification.requestPermission()) !== "granted") return pushState();
  const bytes = base64ToBytes(key);
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made against an older server key would be rejected by the push
  // service; replace it.
  if (sub && !sameKey(sub.options.applicationServerKey, bytes)) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  await apiService.notifications.pushSubscribe({ ...(sub.toJSON() as any), lang });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await apiService.notifications.pushUnsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return pushState();
}

// On every sign-in and language change: tells the server this device belongs to
// the signed-in account, in this language. Never prompts; does nothing unless the
// device already has a subscription.
export async function syncPush(lang: Lang) {
  try {
    if (!supported() || Notification.permission !== "granted") return;
    const sub = await currentSubscription();
    if (sub) await apiService.notifications.pushSubscribe({ ...(sub.toJSON() as any), lang });
  } catch (err) {
    console.error("[push sync]", err);
  }
}

// On log out, with the token that is being dropped: the phone must stop getting
// this account's notifications, and the next person to sign in on it opts in
// for themselves.
export async function releasePush(token: string) {
  try {
    if (!supported()) return;
    const sub = await currentSubscription();
    if (!sub) return;
    await apiService.notifications.pushUnsubscribe(sub.endpoint, token).catch(() => {});
    await sub.unsubscribe();
  } catch (err) {
    console.error("[push release]", err);
  }
}
