import type { Lang } from "../i18n";

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

// Turns "14:30" + 1.5h into "14:30 - 16:00" for booking rows.
export function formatSlot(startTime: string, durationHours: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const endMinutes = h * 60 + m + Math.round(durationHours * 60);
  const eh = Math.floor(endMinutes / 60) % 24;
  const em = endMinutes % 60;
  return `${startTime} - ${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}
