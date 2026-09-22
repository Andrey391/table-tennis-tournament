import { useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import { useT } from "../i18n";
import ScheduleModal, { ROW_HEIGHT, toMin } from "./ScheduleModal";

const clockOf = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
// A not-yet-played match has no real duration — the event's startTime is the
// only "when" there is, so it gets a placeholder block just long enough to be
// visible and tappable, drawn dashed to mark it as scheduled rather than real.
const PLANNED_HOURS = 1;

const weekdayShort = (d: string, lang: string) =>
  new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { weekday: "short" }).format(new Date(d));
const dayNum = (d: string) => new Date(d).getDate();
// 2024-01-01 was a Monday — a fixed, known Mon..Sun week used purely to
// label the month grid's weekday header regardless of which month is open.
const MONDAY_FIRST_WEEK = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(2024, 0, 1 + i);
  return d.toISOString().slice(0, 10);
});

type Block = { match: any; opponent: any; mine: number; theirs: number; played: boolean; startTime: string; durationHours: number; sets: any[]; mySide: 1 | 2 };

function toBlocks(matches: any[], playerId: string): Block[] {
  return matches.map(m => {
    const mySide: 1 | 2 = m.player1Id === playerId ? 1 : 2;
    const opponent = m.player1Id === playerId ? m.player2 : m.player1;
    const mine = m.player1Id === playerId ? m.setsWon1 : m.setsWon2;
    const theirs = m.player1Id === playerId ? m.setsWon2 : m.setsWon1;
    const played = m.status === "COMPLETED" && m.startedAt;
    const start = played ? new Date(m.startedAt) : new Date(m.tournament.startTime);
    const startTime = clockOf(start);
    const durationHours = played
      ? Math.max(0.25, (new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 3_600_000)
      : PLANNED_HOURS;
    return { match: m, opponent, mine, theirs, played, startTime, durationHours, sets: m.sets ?? [], mySide };
  });
}

const oppName = (b: Block, noOpponent: string) => b.opponent ? `${b.opponent.firstName} ${b.opponent.lastName}` : noOpponent;

// The personal counterpart to ClubScheduleModal, built on the same shared
// ScheduleModal shell: one player's matches, played ones positioned by their
// real start/end (exactly like a table booking) and upcoming ones pinned to
// their event's start time. Single column (there's only one person), tapping
// a match opens it.
export default function PlayerScheduleModal({
  open, onClose, playerId, initialDate,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string;
  initialDate?: string;
}) {
  const { t, lang } = useT();
  const navigate = useNavigate();

  const fetchDay = (date: string) =>
    apiService.players.schedule(playerId, new Date(date).toISOString()).then(r => toBlocks(r.data, playerId));

  const openMatch = (m: any) => { navigate(`/tournament/${m.tournamentId}/match/${m.id}`); onClose(); };

  // Only the hours matches actually fall in — no fixed 08:00-24:00 padding,
  // so a single evening match doesn't force a scroll through an empty day.
  const renderDay = (blocks: Block[]) => {
    const dayStart = Math.floor(Math.min(...blocks.map(b => toMin(b.startTime))) / 60);
    const latestEnd = Math.ceil(Math.max(...blocks.map(b => toMin(b.startTime) + b.durationHours * 60)) / 60);
    const hours = Array.from({ length: Math.max(1, latestEnd - dayStart) }, (_, i) => dayStart + i);
    const gridHeight = hours.length * ROW_HEIGHT;

    return (
      <div className="overflow-auto p-4">
        <div className="flex">
          <div className="shrink-0 w-12 text-right pr-2" style={{ height: gridHeight }}>
            {hours.map(h => (
              <div key={h} className="text-[10px] text-[#4d6480]" style={{ height: ROW_HEIGHT, marginTop: h === hours[0] ? 0 : -1 }}>
                {String(h % 24).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          <div className="relative flex-1 rounded-lg border border-[#1c3350]"
            style={{ height: gridHeight, background: "repeating-linear-gradient(to bottom, #0a1628 0, #0a1628 " + (ROW_HEIGHT - 1) + "px, #142033 " + (ROW_HEIGHT - 1) + "px, #142033 " + ROW_HEIGHT + "px)" }}>
            {blocks.map(b => {
              const top = (toMin(b.startTime) - dayStart * 60) / 60 * ROW_HEIGHT;
              const height = Math.max(20, b.durationHours * ROW_HEIGHT);
              return (
                <button key={b.match.id} type="button" onClick={() => openMatch(b.match)}
                  className={`absolute left-1 right-1 rounded px-2 py-1 text-left overflow-hidden ${
                    b.played ? "bg-[#ccff00]/20 border border-[#ccff00]/50" : "bg-[#1c3350]/60 border border-dashed border-[#4d6480]"
                  }`}
                  style={{ top, height }}>
                  <span className="block text-[10px] text-[#6b84a0]">{b.startTime} · {b.match.tournament.name}</span>
                  <span className="block text-xs font-medium truncate">
                    {oppName(b, t("player.noOpponent"))}{b.played ? ` — ${b.mine}:${b.theirs}` : ` (${t("player.scheduled")})`}
                  </span>
                  {b.played && b.sets.length > 0 && (
                    <span className="flex flex-wrap gap-1 mt-1">
                      {b.sets.map((s: any) => (
                        <span key={s.id} className={`px-1 rounded text-[9px] font-bold leading-[14px] ${
                          s.winner === b.mySide ? "bg-[#ccff00]/20 text-[#ccff00]" : "bg-[#ef4444]/15 text-[#ef4444]"
                        }`}>
                          {s.index}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // One row per date (first column), matches for that date listed next to
  // it — a day can hold several, stacked rather than laid out on a clock.
  const renderWeek = (weekData: Record<string, Block[] | undefined>, dates: string[], _date: string, onPickDay: (d: string) => void) => (
    <div className="overflow-auto divide-y divide-[#1c3350]">
      {dates.map(d => {
        const blocks = weekData[d] ?? [];
        return (
          <div key={d} className="flex gap-3 p-3">
            <button type="button" onClick={() => onPickDay(d)} className="shrink-0 w-12 text-left">
              <span className="block text-[10px] text-[#93a8c2] capitalize">{weekdayShort(d, lang)}</span>
              <span className="block text-sm font-bold">{dayNum(d)}</span>
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              {blocks.length === 0 ? (
                <span className="text-xs text-[#4d6480] py-1">—</span>
              ) : blocks.map(b => (
                <button key={b.match.id} type="button" onClick={() => openMatch(b.match)}
                  className={`text-left rounded-lg px-2 py-1.5 text-xs ${
                    b.played ? "bg-[#ccff00]/10 border border-[#ccff00]/30" : "bg-[#1c3350]/60 border border-dashed border-[#4d6480]"
                  }`}>
                  <span className="text-[#6b84a0]">{b.startTime}</span>{" "}
                  {b.played ? (
                    <span className="font-medium">{b.mine}:{b.theirs}</span>
                  ) : (
                    <span className="text-[#4d6480]">({t("player.scheduled")})</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // A plain month grid; each date carries a green badge (sets played that
  // day) at its right and a grey one (still scheduled) at its left.
  const renderMonth = (monthData: Record<string, Block[] | undefined>, dates: string[], date: string, onPickDay: (d: string) => void) => {
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
            const blocks = monthData[d] ?? [];
            const played = blocks.filter(b => b.played).length;
            const scheduled = blocks.length - played;
            return (
              <button key={d} type="button" onClick={() => onPickDay(d)}
                className={`relative rounded-lg h-11 border ${d === date ? "border-[#ccff00]" : "border-[#1c3350]"} ${blocks.length > 0 ? "bg-[#142033]" : "bg-[#0a1628]"}`}>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">{dayNum(d)}</span>
                {scheduled > 0 && (
                  <span className="absolute bottom-0.5 left-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#4d6480] text-[8px] leading-[14px] text-center text-[#0a1628] font-bold">
                    {scheduled}
                  </span>
                )}
                {played > 0 && (
                  <span className="absolute bottom-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#ccff00] text-[8px] leading-[14px] text-center text-[#0a1628] font-bold">
                    {played}
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
    <ScheduleModal<Block[]>
      open={open}
      onClose={onClose}
      title={t("player.scheduleTitle")}
      initialDate={initialDate}
      fetchDay={fetchDay}
      renderDay={renderDay}
      renderWeek={renderWeek}
      renderMonth={renderMonth}
      isEmptyDay={blocks => blocks.length === 0}
      emptyText={t("player.noMatchesThisDay")}
    />
  );
}
