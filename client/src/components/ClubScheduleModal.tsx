import { apiService } from "../services/api";
import { useT } from "../i18n";
import { formatSlot } from "../lib/format";
import ScheduleModal, { DAY_END, DAY_START, ROW_HEIGHT, toMin } from "./ScheduleModal";

type Table = { id: string; number: number; busy: { startTime: string; durationHours: number }[] };

const weekdayShort = (d: string, lang: string) =>
  new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { weekday: "short" }).format(new Date(d));
const dayNum = (d: string) => new Date(d).getDate();
// 2024-01-01 was a Monday — a fixed, known Mon..Sun week used purely to
// label the month grid's weekday header regardless of which month is open.
const MONDAY_FIRST_WEEK = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(2024, 0, 1 + i);
  return d.toISOString().slice(0, 10);
});

// A real calendar-style timeline: hours run down the left, one column per
// table, each booking drawn as a block positioned by its actual
// start/duration rather than snapped into a coarse grid of chips. Built on
// the shared ScheduleModal (day/week/month tabs), so it can be opened either
// from the booking form (to pick a table for a slot already chosen there) or
// from the clubs list (just to look at a day).
export default function ClubScheduleModal({
  open, onClose, clubId, initialDate, selectedTableId, onSelectTable,
}: {
  open: boolean;
  onClose: () => void;
  clubId: string;
  initialDate?: string;
  selectedTableId?: string;
  onSelectTable?: (tableId: string) => void;
}) {
  const { t, lang } = useT();

  const fetchDay = (date: string) =>
    apiService.clubs.availability(clubId, new Date(date).toISOString()).then(r => r.data as Table[]);

  const renderDay = (list: Table[]) => {
    const allBusy = list.flatMap(tbl => tbl.busy);
    const dayStart = Math.min(DAY_START, ...allBusy.map(b => Math.floor(toMin(b.startTime) / 60)), DAY_START);
    const latestEnd = Math.max(DAY_END, ...allBusy.map(b => Math.ceil((toMin(b.startTime) + b.durationHours * 60) / 60)), DAY_END);
    const hours = Array.from({ length: latestEnd - dayStart }, (_, i) => dayStart + i);
    const gridHeight = hours.length * ROW_HEIGHT;

    return (
      <div className="overflow-auto p-4">
        <div className="flex">
          {/* Time labels, fixed while the table columns scroll horizontally. */}
          <div className="shrink-0 w-12 text-right pr-2" style={{ height: gridHeight }}>
            {hours.map(h => (
              <div key={h} className="text-[10px] text-[#4d6480]" style={{ height: ROW_HEIGHT, marginTop: h === hours[0] ? 0 : -1 }}>
                {String(h % 24).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          <div className="flex-1 flex gap-2 min-w-0 overflow-x-auto">
            {list.map(tbl => (
              <button key={tbl.id} type="button" onClick={() => { if (onSelectTable) { onSelectTable(tbl.id); onClose(); } }}
                className={`relative shrink-0 w-20 rounded-lg border ${
                  selectedTableId === tbl.id ? "border-[#ccff00]" : "border-[#1c3350]"
                } ${onSelectTable ? "" : "cursor-default"}`}
                style={{ height: gridHeight, background: "repeating-linear-gradient(to bottom, #0a1628 0, #0a1628 " + (ROW_HEIGHT - 1) + "px, #142033 " + (ROW_HEIGHT - 1) + "px, #142033 " + ROW_HEIGHT + "px)" }}>
                <span className={`absolute -top-6 left-0 right-0 text-center text-xs font-medium ${selectedTableId === tbl.id ? "text-[#ccff00]" : "text-[#93a8c2]"}`}>
                  №{tbl.number}
                </span>
                {tbl.busy.map((b, i) => {
                  const top = (toMin(b.startTime) - dayStart * 60) / 60 * ROW_HEIGHT;
                  const height = Math.max(6, b.durationHours * ROW_HEIGHT);
                  return (
                    <div key={i} className="absolute left-0.5 right-0.5 rounded bg-[#ef4444]/70 text-[9px] text-white px-1 py-0.5 overflow-hidden"
                      style={{ top, height }} title={formatSlot(b.startTime, b.durationHours)}>
                      {formatSlot(b.startTime, b.durationHours)}
                    </div>
                  );
                })}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // One row per date (first column), that day's bookings across every table
  // listed next to it — a day can hold several, stacked rather than laid out
  // on a clock.
  const renderWeek = (weekData: Record<string, Table[] | undefined>, dates: string[], _date: string, onPickDay: (d: string) => void) => (
    <div className="overflow-auto divide-y divide-[#1c3350]">
      {dates.map(d => {
        const tables = weekData[d] ?? [];
        const slots = tables.flatMap(tbl => tbl.busy.map(b => ({ ...b, tableNumber: tbl.number })))
          .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
        return (
          <div key={d} className="flex gap-3 p-3">
            <button type="button" onClick={() => onPickDay(d)} className="shrink-0 w-12 text-left">
              <span className="block text-[10px] text-[#93a8c2] capitalize">{weekdayShort(d, lang)}</span>
              <span className="block text-sm font-bold">{dayNum(d)}</span>
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              {slots.length === 0 ? (
                <span className="text-xs text-[#4d6480] py-1">—</span>
              ) : slots.map((b, i) => (
                <span key={i} className="text-left rounded-lg px-2 py-1.5 text-xs bg-[#1c3350]/60">
                  <span className="text-[#93a8c2] font-medium">№{b.tableNumber}</span>{" "}
                  <span className="text-[#6b84a0]">{formatSlot(b.startTime, b.durationHours)}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // A plain month grid; each date with any booking carries a badge showing
  // its total booked hours across all tables.
  const renderMonth = (monthData: Record<string, Table[] | undefined>, dates: string[], date: string, onPickDay: (d: string) => void) => {
    const leadingBlanks = (new Date(dates[0]).getDay() + 6) % 7; // Monday-start offset
    return (
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {MONDAY_FIRST_WEEK.map(d => (
            <span key={d} className="text-center text-[10px] text-[#4d6480] capitalize">{weekdayShort(d, lang)}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
          {dates.map(d => {
            const tables = monthData[d] ?? [];
            const busyHours = tables.flatMap(t => t.busy).reduce((s, b) => s + b.durationHours, 0);
            return (
              <button key={d} type="button" onClick={() => onPickDay(d)}
                className={`relative rounded-lg h-11 border ${d === date ? "border-[#ccff00]" : "border-[#1c3350]"} ${busyHours > 0 ? "bg-[#142033]" : "bg-[#0a1628]"}`}>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">{dayNum(d)}</span>
                {busyHours > 0 && (
                  <span className="absolute bottom-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#ccff00] text-[8px] leading-[14px] text-center text-[#0a1628] font-bold">
                    {t("play.hoursShort", { n: busyHours })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <ScheduleModal<Table[]>
      open={open}
      onClose={onClose}
      title={t("play.scheduleTitle")}
      initialDate={initialDate}
      fetchDay={fetchDay}
      renderDay={renderDay}
      renderWeek={renderWeek}
      renderMonth={renderMonth}
      isEmptyDay={list => list.length === 0}
      emptyText={t("play.noTables")}
    />
  );
}
