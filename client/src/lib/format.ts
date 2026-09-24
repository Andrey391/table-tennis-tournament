import type { Lang } from "../i18n/dict";

const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-GB" };

// "Ср 16 сентября" / "Wed 16 September" — the event-card date line.
export function formatEventDay(date: string | Date, lang: Lang): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: "short", day: "numeric", month: "long" }).format(d);
}

export function formatShortDate(date: string | Date, lang: Lang): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE[lang], { day: "numeric", month: "short" }).format(d);
}

export function formatClock(date: string | Date, lang: Lang): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: "2-digit", minute: "2-digit" }).format(d);
}

// "14:00 - 16:30" when both ends are known, otherwise just the start.
export function formatTimeRange(start?: string | Date | null, end?: string | Date | null, lang: Lang = "ru"): string {
  if (!start) return "";
  const from = formatClock(start, lang);
  return end ? `${from} - ${formatClock(end, lang)}` : from;
}

// "5 минут назад" / "5 minutes ago" for anything within a week, the date after that.
export function formatAgo(date: string | Date, lang: Lang): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const seconds = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: "auto" });
  if (seconds > -60) return rtf.format(0, "second");
  if (seconds > -3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (seconds > -86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (seconds > -7 * 86400) return rtf.format(Math.round(seconds / 86400), "day");
  return formatShortDate(d, lang);
}

// Turns "14:30" + 1.5h into "14:30 - 16:00" for booking rows.
export function formatSlot(startTime: string, durationHours: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const endMinutes = h * 60 + m + Math.round(durationHours * 60);
  const eh = Math.floor(endMinutes / 60) % 24;
  const em = endMinutes % 60;
  return `${startTime} - ${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

// Everywhere a player is shown, the surname's initial comes with the first name:
// "Иван П.". Scoreboards and match rows used to print the bare first name, which
// made two Ivans indistinguishable.
export function playerName(
  p?: { firstName?: string | null; lastName?: string | null } | null,
  fallback = "—",
): string {
  const first = p?.firstName?.trim();
  if (!first) return fallback;
  const initial = p?.lastName?.trim()?.[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

// A match is won on sets, so the headline figure is the set tally, not points.
export function matchScoreLine(m: { status?: string; setsWon1?: number; setsWon2?: number }): string {
  if (!m || m.status === "NOT_STARTED") return "vs";
  return `${m.setsWon1 ?? 0} : ${m.setsWon2 ?? 0}`;
}

// How many sets each side has taken so far, as a plain count. The rally-by-rally
// score is not recorded, so the set tally is the whole result of a match.
export function setsPlayed(m: { setsWon1?: number; setsWon2?: number }): number {
  return (m?.setsWon1 ?? 0) + (m?.setsWon2 ?? 0);
}

// Ratings are fractional (FNTR pays (100 - gap) / 10 * KT points), so a rating shows
// one decimal only when it has one: "102" stays "102", "102.5" stays "102.5".
export function formatRating(n?: number | null): string {
  return n == null ? "" : String(Math.round(n * 10) / 10);
}

// A rating change as "+12" / "−2.5" (true minus sign), for results and standings.
// Changes carry up to two decimals (a loser gives up half of what the winner gains).
export function formatDelta(n?: number | null): string {
  const v = n ? Math.round(n * 100) / 100 : 0;
  if (!v) return "0";
  return v > 0 ? `+${v}` : `−${Math.abs(v)}`;
}

// The rating a settled match moved for one side: the winner's gain or the loser's
// loss. The FNTR exchange is not zero-sum, so the loser's figure is its own column.
export function matchDelta(m: { eloDelta?: number | null; eloDeltaLoser?: number | null }, mine: number, theirs: number): number {
  return mine > theirs ? (m.eloDelta ?? 0) : mine < theirs ? (m.eloDeltaLoser ?? 0) : 0;
}

// Green for a gain, red for a loss, muted for no change.
export function deltaTone(n?: number | null): string {
  return !n ? "text-[#4d6480]" : n > 0 ? "text-green-400" : "text-red-400";
}

// Two spellings of one city ("Москва", "москва ", "Москва") share this key.
export const cityKey = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase();
