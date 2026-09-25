---
paths:
  - "server/src/shared/notify.ts"
  - "server/src/shared/push.ts"
  - "server/src/routes/notifications.ts"
  - "client/src/sw.ts"
  - "client/src/lib/push.ts"
  - "client/src/lib/notifications.ts"
  - "client/src/components/PushCard.tsx"
  - "client/src/components/NotificationBell.tsx"
  - "client/src/pages/NotificationsPage.tsx"
  - "client/vite.config.ts"
  - "client/public/manifest.webmanifest"
---

# Notifications and Web Push

## Inbox
- `Notification` rows: `userId`, `type`, `params` JSON, `link`, `tournamentId` (plain column, no FK), `readAt`.
- Routes write them through `notify(items, actorId)` (`shared/notify.ts`). It **never throws** and skips the actor.
- **Text is not stored**: the client renders `notif.<type>` from i18n with `params` (`notificationText` in `lib/notifications.ts`). **A new type needs keys on both `ru` and `en`.**
- Sent for:
  - Roster: join request (to the manager), approve/decline/add/remove (to the player).
  - Matches: `/pair` (opponent and table, or the bye), `/end`/`/forfeit` (score and rating change), reopen.
  - Events: event completed (`TOURNAMENT` only), event deleted (old ones cleared first), a new public event at a followed club (`notifyClubFollowers`).
  - Other: chat (at most one unread per event per person), quick game (to the opponent).
- Endpoints:
  - `GET /notifications`: latest 50 plus the unread count. It marks everything read and deletes rows older than 60 days.
  - `GET /notifications/unread`: polled by `NotificationBell` every 20s, which toasts a new one.
  - `POST /notifications/read { ids? }`.

## Web Push
- `notify()` also calls `sendPush` (`shared/push.ts`, `web-push`) for every `PushSubscription` of the recipient. Sends are awaited, run in parallel with a 5s timeout each, and never throw. An endpoint answering 404/410 is deleted.
- **Off unless** `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (`mailto:`) are set; generate them with `npx web-push generate-vapid-keys`.
- Endpoints:
  - `GET /notifications/push/key` (null = off).
  - `POST /notifications/push/subscribe { endpoint, keys, lang }` upserts by endpoint.
  - `POST /notifications/push/unsubscribe`.
- `PushSubscribeSchema` accepts only https endpoints of known push services (FCM, Mozilla, Apple, WNS). The server POSTs to that URL, so anything else is an SSRF hole.
- The payload is `type`/`params`/`link`/`lang`, **never text**. `client/src/sw.ts` renders it with the same `notificationText`, which is why the dictionary lives in React-free `i18n/dict.ts`. `vite.config.ts` builds `sw.ts` separately into a classic `/sw.js`. The service worker caches nothing.
- Client side: `lib/push.ts` (enable from a tap, `syncPush` on sign-in or language change in `App.tsx`, `releasePush` on logout) and `PushCard` (in the inbox, and as a nudge on `TournamentPage`). The app is an installable PWA. On iPhone push works only from the home screen, so the card explains how to install.
