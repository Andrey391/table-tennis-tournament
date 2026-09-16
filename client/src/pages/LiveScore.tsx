import { useParams } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { apiService } from "../services/api";

export default function LiveScore() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const [matches, setMatches] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!tournamentId) return;
    try { const r = await apiService.live.get(tournamentId); setMatches(r.data); } catch (e) { console.error(e); }
  }, [tournamentId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const i = setInterval(fetchData, 2000); return () => clearInterval(i); }, [fetchData]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-3">
      <div className="max-w-sm mx-auto">
        <h1 className="text-2xl font-bold text-center mb-1 tracking-tight">LIVE <span className="text-[#ccff00]">SCORE</span></h1>
        <p className="text-center text-[#555566] text-xs mb-6">Updates every 2 seconds</p>

        {matches.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#555566] text-sm">No live matches</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((m: any) => (
              <div key={m.id} className="bg-[#12121a] p-5 rounded-lg text-center border border-yellow-500/30">
                <p className="text-[11px] text-[#555566] uppercase tracking-wider mb-3">Table {m.tableNumber || "?"}</p>
                <div className="flex justify-around items-center">
                  <div className="text-center flex-1">
                    <p className="text-sm font-medium text-[#3b82f6] truncate px-1">{m.player1?.firstName || "TBD"}</p>
                    <p className="text-5xl font-bold mt-2 text-[#3b82f6]">{m.score1}</p>
                  </div>
                  <p className="text-xl text-[#333] px-2">:</p>
                  <div className="text-center flex-1">
                    <p className="text-sm font-medium text-[#ef4444] truncate px-1">{m.player2?.firstName || "TBD"}</p>
                    <p className="text-5xl font-bold mt-2 text-[#ef4444]">{m.score2}</p>
                  </div>
                </div>
                <p className="text-[11px] text-[#555566] mt-3">Race to {m.pointsToWin}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
