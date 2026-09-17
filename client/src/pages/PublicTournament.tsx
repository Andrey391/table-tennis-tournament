import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { useT } from "../i18n";
import { playerName, matchScoreLine, setScores, liveSet } from "../lib/format";
import Logo from "../components/Logo";

export default function PublicTournament() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const [data, setData] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    apiService.public.tournament(id).then(r => setData(r.data)).catch(console.error);
    apiService.public.standings(id).then(r => setStandings(r.data)).catch(console.error);
  }, [id]);

  if (!data) return <div className="min-h-screen bg-[#0a1628] flex items-center justify-center text-[#6b84a0] text-sm">{t("common.loading")}</div>;

  return (
    <div className="min-h-screen bg-[#0a1628]">
      <div className="max-w-sm mx-auto p-3">
        <div className="text-center mb-6">
          <div className="mb-3"><Logo as="plain" /></div>
          <h1 className="text-2xl font-bold tracking-tight">{data.tournament.name}</h1>
          <p className={`text-xs mt-1 uppercase tracking-wider font-medium ${
            data.tournament.status === "ACTIVE" ? "text-yellow-400" : data.tournament.status === "COMPLETED" ? "text-green-400" : "text-[#4d6480]"
          }`}>{t(`status.${data.tournament.status}`)}</p>
        </div>

        {data.live.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-medium text-yellow-400 uppercase tracking-wider mb-3">{t("results.live")}</h2>
            <div className="space-y-3">
              {data.live.map((m: any) => (
                <div key={m.id} className="bg-[#101f36] border border-yellow-500/20 rounded-lg p-4 text-center">
                  <p className="text-[11px] text-[#4d6480] uppercase tracking-wider mb-2">{t("tournament.table")} {m.tableNumber || "?"}</p>
                  <p className="text-sm font-medium text-[#3b82f6] truncate">{playerName(m.player1, t("common.none"))}</p>
                  <p className="text-3xl font-bold my-1 font-mono">{liveSet(m)?.score1 ?? 0} - {liveSet(m)?.score2 ?? 0}</p>
                  <p className="text-[11px] text-[#4d6480]">{t("match.setsScore")} {m.setsWon1}:{m.setsWon2}</p>
                  <p className="text-sm font-medium text-[#ef4444] truncate">{playerName(m.player2, t("common.none"))}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.recent.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-3">{t("public.recent")}</h2>
            <div className="space-y-2">
              {data.recent.map((m: any) => (
                <div key={m.id} className="bg-[#101f36] p-3 rounded-lg flex justify-between items-center border border-[#1c3350]">
                  <span className="flex-1 min-w-0 text-right text-sm text-[#93a8c2] truncate pr-2">{playerName(m.player1, t("common.none"))}</span>
                  <span className="px-3 shrink-0 text-center">
                    <span className="block font-mono font-bold text-sm">{matchScoreLine(m)}</span>
                    {setScores(m) && <span className="block text-[10px] text-[#4d6480] font-mono">{setScores(m)}</span>}
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-[#93a8c2] truncate pl-2">{playerName(m.player2, t("common.none"))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {standings.length > 0 && (
          <div>
            <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-3">{t("public.standings")}</h2>
            <div className="bg-[#101f36] rounded-lg border border-[#1c3350] divide-y divide-[#1c3350]/50">
              {standings.map((s: any, i: number) => (
                <div key={s.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[#4d6480] text-xs w-4 shrink-0">{i + 1}</span>
                    <span className="truncate">{playerName(s)}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0 text-xs">
                    <span className="text-green-400">{s.wins}W</span>
                    <span className="text-red-400">{s.losses}L</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.live.length === 0 && data.recent.length === 0 && (
          <div className="text-center py-16 bg-[#101f36] rounded-lg border border-[#1c3350]">
            <p className="text-[#6b84a0] text-sm">{t("tournament.noMatches")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
