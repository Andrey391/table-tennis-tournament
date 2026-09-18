import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import { useT } from "../i18n";
import { playerName } from "../lib/format";

const card = "bg-[#101f36] rounded-2xl border border-[#1c3350]";
const label = "text-xs font-medium text-[#6b84a0] uppercase tracking-wider";
const pct = (won: number, played: number) => (played ? Math.round((won / played) * 100) : 0);

// A player's statistics block: rating chart, form, rates, streaks, best win,
// rivals and achievements. Shared by the own profile and anyone else's.
export default function PlayerStats({ playerId }: { playerId: string }) {
  const { t } = useT();
  const [s, setS] = useState<any>(null);

  useEffect(() => { apiService.stats.player(playerId).then(r => setS(r.data)).catch(console.error); }, [playerId]);
  if (!s) return null;

  const history: any[] = s.ratingHistory || [];
  const values = history.map(h => h.rating);
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(max - min, 10);
  const points = values.map((v, i) => `${values.length === 1 ? 150 : (i / (values.length - 1)) * 300},${90 - ((v - min) / span) * 80}`).join(" ");
  const streak = s.streak.current;

  return (
    <div className="space-y-3 mb-5">
      <div className={`${card} p-4`}>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className={label}>{t("stats.ratingChart")}</h2>
          {values.length > 1 && <span className="text-[11px] text-[#4d6480] font-mono">{min} &ndash; {max}</span>}
        </div>
        {values.length > 1 ? (
          <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="w-full h-24">
            <polyline points={points} fill="none" stroke="#ccff00" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        ) : (
          <p className="text-xs text-[#6b84a0]">{t("stats.chartEmpty")}</p>
        )}
      </div>

      <div className={`${card} p-4`}>
        <h2 className={`${label} mb-2`}>{t("stats.form")}</h2>
        {s.form.length === 0 ? <p className="text-xs text-[#6b84a0]">{t("profile.noneYet")}</p> : (
          <div className="flex gap-1.5">
            {s.form.map((r: string, i: number) => (
              <span key={i} className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${r === "W" ? "bg-green-500/20 text-green-400" : r === "L" ? "bg-red-500/20 text-red-400" : "bg-[#1c3350] text-[#93a8c2]"}`}>
                {r === "W" ? t("tournament.winShort") : r === "L" ? t("tournament.lossShort") : "="}
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] text-[#4d6480] mt-2">{t("stats.formHint")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([
          ["stats.winRate", s.matches.wins, s.matches.played],
          ["stats.setRate", s.sets.wins, s.sets.played],
          ["stats.deciders", s.deciders.wins, s.deciders.played],
        ] as const).map(([key, won, played]) => (
          <div key={key} className={`${card} p-3 text-center`}>
            <p className="text-xl font-bold">{pct(won, played)}%</p>
            <p className="text-[10px] text-[#6b84a0] leading-tight mt-0.5">{t(key)}</p>
            <p className="text-[10px] text-[#4d6480] font-mono">{won}/{played}</p>
          </div>
        ))}
      </div>

      <div className={`${card} divide-y divide-[#1c3350]/50 text-sm`}>
        <div className="px-4 py-2.5 flex justify-between gap-2">
          <span className="text-[#6b84a0]">{t("stats.streak")}</span>
          <span className="text-right">
            <span className={streak > 0 ? "text-green-400" : streak < 0 ? "text-red-400" : "text-[#93a8c2]"}>
              {streak > 0 ? t("stats.streakWins", { n: streak }) : streak < 0 ? t("stats.streakLosses", { n: -streak }) : t("stats.streakNone")}
            </span>
            <span className="block text-[11px] text-[#4d6480]">{t("stats.bestStreak", { n: s.streak.best })}</span>
          </span>
        </div>
        {s.bestWin && (
          <Link to={`/tournament/${s.bestWin.tournamentId}/match/${s.bestWin.matchId}`} className="px-4 py-2.5 flex justify-between gap-2">
            <span className="text-[#6b84a0] shrink-0">{t("stats.bestWin")}</span>
            <span className="truncate text-right">{t("stats.bestWinLine", { name: playerName(s.bestWin.opponent), rating: s.bestWin.rating })} <span className="font-mono text-green-400">{s.bestWin.score}</span></span>
          </Link>
        )}
        {([["stats.nemesis", s.nemesis], ["stats.favourite", s.favourite]] as const).filter(([, r]) => r).map(([key, r]) => (
          <Link key={key} to={`/player/${r.opponent.id}`} className="px-4 py-2.5 flex justify-between gap-2">
            <span className="text-[#6b84a0] shrink-0">{t(key)}</span>
            <span className="truncate text-right">{t("stats.rivalLine", { name: playerName(r.opponent), wins: r.wins, losses: r.losses })}</span>
          </Link>
        ))}
        {s.events.finished > 0 && (
          <p className="px-4 py-2.5 text-[11px] text-[#93a8c2]">{t("stats.eventsLine", { n: s.events.finished, wins: s.events.wins, podiums: s.events.podiums })}</p>
        )}
      </div>

      <div className={`${card} p-4`}>
        <h2 className={`${label} mb-3`}>{t("stats.achievements")}</h2>
        <div className="grid grid-cols-3 gap-2">
          {s.achievements.map((a: any) => (
            <div key={a.key} className={`rounded-lg border p-2 text-center ${a.earned ? "border-[#ccff00]/40 bg-[#ccff00]/5" : "border-[#1c3350] opacity-40"}`}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto mb-1" fill="none" stroke={a.earned ? "#ccff00" : "#6b84a0"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="9" r="6" /><path d="M8.5 14 7 22l5-3 5 3-1.5-8" />
              </svg>
              <p className="text-[10px] leading-tight text-[#93a8c2]">{t(`ach.${a.key}`)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Head-to-head between two players, from `playerId`'s side. `compact` is the
// one-line version the match screen shows before a match starts.
export function HeadToHead({ playerId, otherId, compact = false }: { playerId: string; otherId: string; compact?: boolean }) {
  const { t } = useT();
  const [h, setH] = useState<any>(null);

  useEffect(() => { apiService.stats.headToHead(playerId, otherId).then(r => setH(r.data)).catch(console.error); }, [playerId, otherId]);
  if (!h) return null;
  if (compact) return h.played ? <p className="text-[11px] text-[#93a8c2] mt-2">{t("h2h.line", { wins: h.wins, losses: h.losses })}</p> : null;

  return (
    <div className={`${card} p-4 mb-5`}>
      <h2 className={`${label} mb-2`}>{t("h2h.withYou")}</h2>
      {h.played === 0 ? <p className="text-xs text-[#6b84a0]">{t("h2h.none")}</p> : (
        <>
          <p className="text-3xl font-bold font-mono">
            <span className="text-green-400">{h.wins}</span><span className="text-[#4d6480] mx-1">:</span><span className="text-red-400">{h.losses}</span>
          </p>
          <p className="text-[11px] text-[#6b84a0] mb-3">{t("h2h.score", { wins: h.wins, losses: h.losses, setsWon: h.setsWon, setsLost: h.setsLost })}</p>
          <div className="space-y-1.5">
            {h.recent.map((m: any) => (
              <Link key={m.id} to={`/tournament/${m.tournament.id}/match/${m.id}`} className="flex justify-between gap-2 text-xs">
                <span className="truncate text-[#93a8c2]">{m.tournament.name}</span>
                <span className={`font-mono shrink-0 ${m.mine > m.theirs ? "text-green-400" : "text-red-400"}`}>{m.mine}:{m.theirs}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
