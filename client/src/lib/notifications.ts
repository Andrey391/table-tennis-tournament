import type { Lang } from "../i18n";
import { formatDelta, formatEventDay, formatClock } from "./format";

// A notification as the server stores it: a type and its parameters, never the
// text. The text is built here, in the reader's language.
export interface AppNotification {
  id: string;
  type: string;
  params?: Record<string, string | number | null> | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

type T = (key: string, vars?: Record<string, string | number>) => string;

// The line a notification reads as: `notif.<type>` filled with its params, plus
// the rating change after a settled match when there was one.
export function notificationText(n: AppNotification, t: T, lang: Lang): string {
  const p = n.params ?? {};
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p)) if (v != null) vars[k] = v;
  if (typeof p.startTime === "string") vars.when = `${formatEventDay(p.startTime, lang)}, ${formatClock(p.startTime, lang)}`;
  if (p.kind) vars.what = t(p.kind === "GAME" ? "notif.kindGame" : "notif.kindTournament");
  let key = `notif.${n.type}`;
  // Pairing without a table number (a single-table event) reads without "table".
  if (n.type === "ROUND_PAIRED" && p.table == null) key = "notif.ROUND_PAIRED_noTable";
  if (n.type === "CLUB_NEW_EVENT" && !p.startTime) key = "notif.CLUB_NEW_EVENT_noDate";
  const text = t(key, vars);
  return typeof p.delta === "number" ? `${text} ${t("notif.ratingDelta", { delta: formatDelta(p.delta) })}` : text;
}

// The bell and the inbox screen live on different components; marking something
// read on one has to show on the other straight away rather than at the next poll.
const CHANGED = "notifications-changed";
export const notificationsChanged = () => window.dispatchEvent(new Event(CHANGED));
export function onNotificationsChanged(fn: () => void) {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}
