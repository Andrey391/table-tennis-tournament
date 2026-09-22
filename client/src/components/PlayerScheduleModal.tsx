import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import { useT } from "../i18n";
import { formatEventDay } from "../lib/format";
import { btnSecondary, field } from "../lib/ui";
import Loader from "./Loader";

// "HH:MM" -> minutes since midnight.
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const clockOf = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const ROW_HEIGHT = 48; // px per hour
const DAY_START = 8;
const DAY_END = 24;
// A not-yet-played match has no real duration — the event's startTime is the
// only "when" there is, so it gets a placeholder block just long enough to be
// visible and tappable, drawn dashed to mark it as scheduled rather than real.
const PLANNED_HOURS = 1;

// The personal counterpart to ClubScheduleModal: one player's matches on one
// day, played ones positioned by their real start/end (exactly like a table
// booking) and upcoming ones pinned to their event's start time. Single column
// (there's only one person), tapping a match opens it.
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
  const today = () => new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate ? initialDate.slice(0, 10) : today());
  const [matches, setMatches] = useState<any[] | null>(null);

  useEffect(() => { if (open) setDate(initialDate ? initialDate.slice(0, 10) : today()); }, [open, initialDate]);

  useEffect(() => {
    if (!open || !playerId || !date) return;
    setMatches(null);
    apiService.players.schedule(playerId, new Date(date).toISOString())
      .then(r => setMatches(r.data)).catch(console.error);
  }, [open, playerId, date]);

  if (!open) return null;

  const blocks = (matches ?? []).map(m => {
    const opponent = m.player1Id === playerId ? m.player2 : m.player1;
    const mine = m.player1Id === playerId ? m.setsWon1 : m.setsWon2;
    const theirs = m.player1Id === playerId ? m.setsWon2 : m.setsWon1;
    const played = m.status === "COMPLETED" && m.startedAt;
    const start = played ? new Date(m.startedAt) : new Date(m.tournament.startTime);
    const startTime = clockOf(start);
    const durationHours = played
      ? Math.max(0.25, (new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 3_600_000)
      : PLANNED_HOURS;
    return { match: m, opponent, mine, theirs, played, startTime, durationHours };
  });

  const dayStart = Math.min(DAY_START, ...blocks.map(b => Math.floor(toMin(b.startTime) / 60)), DAY_START);
  const latestEnd = Math.max(DAY_END, ...blocks.map(b => Math.ceil((toMin(b.startTime) + b.durationHours * 60) / 60)), DAY_END);
  const hours = Array.from({ length: latestEnd - dayStart }, (_, i) => dayStart + i);
  const gridHeight = hours.length * ROW_HEIGHT;

  const openMatch = (m: any) => { navigate(`/tournament/${m.tournamentId}/match/${m.id}`); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[#101f36] border border-[#1c3350] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[#1c3350] shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold">{t("player.scheduleTitle")}</h3>
            <p className="text-xs text-[#6b84a0] capitalize truncate">{formatEventDay(date, lang)}</p>
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${field} w-auto shrink-0`} />
          <button onClick={onClose} className="text-[#6b84a0] text-xl leading-none px-1 shrink-0" aria-label={t("common.cancel")}>&times;</button>
        </div>

        {matches === null ? (
          <Loader className="py-8" />
        ) : blocks.length === 0 ? (
          <p className="text-xs text-[#4d6480] p-4">{t("player.noMatchesThisDay")}</p>
        ) : (
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
                  const oppName = b.opponent ? `${b.opponent.firstName} ${b.opponent.lastName}` : t("player.noOpponent");
                  return (
                    <button key={b.match.id} type="button" onClick={() => openMatch(b.match)}
                      className={`absolute left-1 right-1 rounded px-2 py-1 text-left overflow-hidden ${
                        b.played ? "bg-[#ccff00]/20 border border-[#ccff00]/50" : "bg-[#1c3350]/60 border border-dashed border-[#4d6480]"
                      }`}
                      style={{ top, height }}>
                      <span className="block text-[10px] text-[#6b84a0]">{b.startTime} · {b.match.tournament.name}</span>
                      <span className="block text-xs font-medium truncate">
                        {oppName}{b.played ? ` — ${b.mine}:${b.theirs}` : ` (${t("player.scheduled")})`}
                      </span>
                    </button>
                  );
                })}
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
