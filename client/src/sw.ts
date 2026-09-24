/// <reference lib="webworker" />
// The service worker: it exists to show push notifications while the app is
// closed, and to open the right screen when one is tapped. It deliberately
// caches nothing — a stale scoreboard is worse than no scoreboard.
//
// Built on its own by vite.config.ts into /sw.js (one classic script, no chunks,
// so it registers on every browser). The payload carries the notification's type
// and params, never text; the text comes from the same dictionary and
// notificationText() the inbox uses, in the language the device subscribed with.
import { translate, type Lang } from "./i18n/dict";
import { notificationText } from "./lib/notifications";

declare let self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (e) => {
  let data: { type?: string; params?: Record<string, string | number | null>; link?: string | null; lang?: string } = {};
  try { data = e.data?.json() ?? {}; } catch { /* not ours; show the bare title */ }
  const lang: Lang = data.lang === "en" ? "en" : "ru";
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const body = data.type ? notificationText({ id: "", type: data.type, params: data.params, createdAt: "" }, t, lang) : "";
  e.waitUntil(self.registration.showNotification(t("push.title"), {
    body,
    icon: "/icon-192.png",
    data: { link: data.link || "/notifications" },
  }));
});

// Focus an open window of the app and send it to the notification's screen, or
// open one. Only same-origin paths are followed.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url = new URL(e.notification.data?.link || "/notifications", self.location.origin);
  if (url.origin !== self.location.origin) url = new URL("/", self.location.origin);
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      try {
        await w.focus();
        await w.navigate(url.href);
        return;
      } catch { /* not controlled by this worker yet; open a fresh window instead */ }
    }
    await self.clients.openWindow(url.href);
  })());
});
