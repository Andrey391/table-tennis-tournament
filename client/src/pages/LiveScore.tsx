import { useParams } from "react-router-dom";
import { useState, useCallback } from "react";
import { apiService } from "../services/api";
import Loader from "../components/Loader";
import { usePolling } from "../lib/usePolling";
import { useT } from "../i18n";
import { playerName, setsPlayed } from "../lib/format";

export default function LiveScore() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const { t } = useT();
  const [matches, setMatches] = useState<any[] | null>(null);

  const fetchData = useCallback(async () => {
    if (!tournamentId) return;
    try { const r = await apiService.live.get(tournamentId); setMatches(r.data); }
    catch (e) { console.error(e); setMatches(m => m ?? []); }
  }, [tournamentId]);

  usePolling(fetchData, 2000, tournamentId);

  return (
    <div className="min-h-screen bg-[#0a1628] p-3">
      <div className="max-w-sm mx-auto">
        <h1 className="text-2xl font-bold text-center mb-1 tracking-tight">{t("live.title").toUpperCase()} <span className="text-[#ccff00]">{t("live.score")}</span></h1>
        <p className="text-center text-[#4d6480] text-xs mb-6">{t("live.updates")}</p>

        {matches === null ? (
          <Loader className="py-16" />
        ) : matches.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#4d6480] text-sm">{t("live.noMatches")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((m: any) => (
              <div key={m.id} className="bg-[#101f36] p-5 rounded-lg text-center border border-yellow-500/30">
                <p className="text-[11px] text-[#4d6480] uppercase tracking-wider mb-1">{t("tournament.table")} {m.tableNumber || "?"}</p>
                <p className="text-sm text-[#93a8c2] mb-3">
                  {t("match.setsPlayed", { n: setsPlayed(m) })}
                </p>
                <div className="flex justify-around items-center">
                  <div className="text-center flex-1">
                    <p className="text-sm font-medium text-[#3b82f6] truncate px-1">{playerName(m.player1, t("common.none"))}</p>
                    <p className="text-5xl font-bold mt-2 text-[#3b82f6]">{m.setsWon1}</p>
                  </div>
                  <p className="text-xl text-[#4d6480] px-2">:</p>
                  <div className="text-center flex-1">
                    <p className="text-sm font-medium text-[#ef4444] truncate px-1">{playerName(m.player2, t("common.none"))}</p>
                    <p className="text-5xl font-bold mt-2 text-[#ef4444]">{m.setsWon2}</p>
                  </div>
                </div>
                <p className="text-[11px] text-[#4d6480] mt-3">{t("match.upTo", { n: m.setsToWin ?? 1 })}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
