import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { formatEventDay } from "../lib/format";
import { btnSecondary } from "../lib/ui";
import Loader from "./Loader";

export const ROW_HEIGHT = 48; // px per hour
export const DAY_START = 8;   // default visible window; widened by callers if content falls outside it
export const DAY_END = 24;

// "HH:MM" -> minutes since midnight.
export const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

// Monday-start week containing `date`.
export function weekDates(dateStr: string) {
  const d = new Date(dateStr);
  const monday = new Date(d);
  monday.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd.toISOString().slice(0, 10);
  });
}

// Every calendar day of the month containing `date`.
export function monthDates(dateStr: string) {
  const d = new Date(dateStr);
  const year = d.getFullYear(), month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const dd = new Date(year, month, i + 1);
    return dd.toISOString().slice(0, 10);
  });
}

type View = "day" | "week" | "month";
const VIEWS: View[] = ["day", "week", "month"];

// One modal shell for "look at a day, week or month of X on a timeline" — a
// club's table availability and a player's match calendar both fit it, so
// this is the only place either one is built. Day/week/month are plain tabs;
// switching tabs re-fetches for whatever date range that tab needs (one day,
// the Monday-start week around it, or the whole calendar month), and each
// range's actual content (the hour grid, the per-day list, the calendar
// cells) is fully owned by the caller via the render props below — the two
// callers' data shapes (tables vs matches) are too different to share more
// than the chrome and the date/view bookkeeping.
export default function ScheduleModal<T>({
  open, onClose, title, initialDate,
  fetchDay, renderDay, renderWeek, renderMonth, isEmptyDay, emptyText,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initialDate?: string;
  fetchDay: (date: string) => Promise<T>;
  renderDay: (data: T) => ReactNode;
  renderWeek: (weekData: Record<string, T | undefined>, dates: string[], date: string, onPickDay: (date: string) => void) => ReactNode;
  renderMonth: (monthData: Record<string, T | undefined>, dates: string[], date: string, onPickDay: (date: string) => void) => ReactNode;
  isEmptyDay: (data: T) => boolean;
  emptyText: string;
}) {
  const { t, lang } = useT();
  const today = () => new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate ? initialDate.slice(0, 10) : today());
  const [view, setView] = useState<View>("week");
  const [dayData, setDayData] = useState<T | null>(null);
  const [rangeData, setRangeData] = useState<Record<string, T | undefined>>({});
  const [rangeLoading, setRangeLoading] = useState(false);

  useEffect(() => { if (open) { setDate(initialDate ? initialDate.slice(0, 10) : today()); setView("week"); } }, [open, initialDate]);

  useEffect(() => {
    if (!open || !date || view !== "day") return;
    setDayData(null);
    fetchDay(date).then(setDayData).catch(console.error);
  }, [open, date, view]);

  useEffect(() => {
    if (!open || (view !== "week" && view !== "month")) return;
    setRangeLoading(true);
    const dates = view === "week" ? weekDates(date) : monthDates(date);
    Promise.all(dates.map(d => fetchDay(d).then(data => [d, data] as const)))
      .then(entries => setRangeData(Object.fromEntries(entries)))
      .catch(console.error)
      .finally(() => setRangeLoading(false));
  }, [open, view, date]);

  if (!open) return null;

  const pickDay = (d: string) => { setDate(d); setView("day"); };

  const subtitle = view === "day" ? formatEventDay(date, lang)
    : view === "week" ? t("play.viewWeek")
    : new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { month: "long", year: "numeric" }).format(new Date(date));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[#101f36] border border-[#1c3350] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-[#1c3350] shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold truncate">{title}</h3>
            <p className="text-xs text-[#6b84a0] capitalize truncate">{subtitle}</p>
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="shrink-0 px-2 py-2 bg-[#0a1628] rounded-lg border border-[#1c3350] text-xs focus:border-[#ccff00] focus:outline-none" />
          <button onClick={onClose} className="text-[#6b84a0] text-xl leading-none px-1 shrink-0" aria-label={t("common.cancel")}>&times;</button>
        </div>

        <div className="flex gap-2 px-4 pt-3 shrink-0">
          {VIEWS.map(v => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                view === v ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
              }`}>
              {t(v === "day" ? "play.viewDay" : v === "week" ? "play.viewWeek" : "play.viewMonth")}
            </button>
          ))}
        </div>

        {view === "day" ? (
          dayData === null ? (
            <Loader className="py-8" />
          ) : isEmptyDay(dayData) ? (
            <p className="text-xs text-[#4d6480] p-4">{emptyText}</p>
          ) : (
            renderDay(dayData)
          )
        ) : rangeLoading ? (
          <Loader className="py-8" />
        ) : view === "week" ? (
          renderWeek(rangeData, weekDates(date), date, pickDay)
        ) : (
          renderMonth(rangeData, monthDates(date), date, pickDay)
        )}

        <div className="p-4 pt-0 shrink-0">
          <button onClick={onClose} className={`${btnSecondary} w-full`}>{t("common.cancel")}</button>
        </div>
      </div>
    </div>
  );
}
