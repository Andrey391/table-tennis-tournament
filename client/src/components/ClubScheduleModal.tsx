import { useT } from "../i18n";
import { formatEventDay, formatSlot } from "../lib/format";
import { btnSecondary } from "../lib/ui";

// "HH:MM" -> minutes since midnight.
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

const ROW_HEIGHT = 48; // px per hour
const DAY_START = 8;   // default visible window; widened below if a booking falls outside it
const DAY_END = 24;

type Table = { id: string; number: number; busy: { startTime: string; durationHours: number }[] };

// A real calendar-style timeline: hours run down the left, one column per table,
// each booking drawn as a block positioned by its actual start/duration rather
// than snapped into a coarse grid of chips. Lives in its own modal (rather than
// inline on the booking form) because a resource-by-time grid needs horizontal
// room the phone-first booking form doesn't have — it's an opt-in detail view,
// not something that has to fit the single-column page.
export default function ClubScheduleModal({
  open, onClose, date, tables, selectedTableId, onSelectTable,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  tables: Table[];
  selectedTableId: string;
  onSelectTable: (tableId: string) => void;
}) {
  const { t, lang } = useT();
  if (!open) return null;

  const allBusy = tables.flatMap(tbl => tbl.busy.map(b => ({ ...b, tableId: tbl.id })));
  const dayStart = Math.min(DAY_START, ...allBusy.map(b => Math.floor(toMin(b.startTime) / 60)), DAY_START);
  const latestEnd = Math.max(DAY_END, ...allBusy.map(b => Math.ceil((toMin(b.startTime) + b.durationHours * 60) / 60)), DAY_END);
  const hours = Array.from({ length: latestEnd - dayStart }, (_, i) => dayStart + i);
  const gridHeight = hours.length * ROW_HEIGHT;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[#101f36] border border-[#1c3350] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#1c3350] shrink-0">
          <div>
            <h3 className="text-sm font-bold">{t("play.scheduleTitle")}</h3>
            <p className="text-xs text-[#6b84a0] capitalize">{formatEventDay(date, lang)}</p>
          </div>
          <button onClick={onClose} className="text-[#6b84a0] text-xl leading-none px-1" aria-label={t("common.cancel")}>&times;</button>
        </div>

        {tables.length === 0 ? (
          <p className="text-xs text-[#4d6480] p-4">{t("play.noTables")}</p>
        ) : (
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
                {tables.map(tbl => (
                  <button key={tbl.id} type="button" onClick={() => { onSelectTable(tbl.id); onClose(); }}
                    className={`relative shrink-0 w-20 rounded-lg border ${
                      selectedTableId === tbl.id ? "border-[#ccff00]" : "border-[#1c3350]"
                    }`}
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
        )}

        <div className="p-4 pt-0 shrink-0">
          <button onClick={onClose} className={`${btnSecondary} w-full`}>{t("common.cancel")}</button>
        </div>
      </div>
    </div>
  );
}
