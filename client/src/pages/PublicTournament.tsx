import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";

export default function PublicTournament() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    apiService.public.tournament(id).then(r => setData(r.data)).catch(console.error);
    apiService.public.standings(id).then(r => setStandings(r.data)).catch(console.error);
  }, [id]);

  if (!data) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-[#666680] text-sm">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-sm mx-auto p-3">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold tracking-tight">{data.tournament.name}</h1>
          <p className={`text-xs mt-1 uppercase tracking-wider font-medium ${
            data.tournament.status === "ACTIVE" ? "text-yellow-400" : data.tournament.status === "COMPLETED" ? "text-green-400" : "text-[#555566]"
          }`}>{data.tournament.status === "ACTIVE" ? "In progress" : data.tournament.status}</p>
        </div>

        {data.live.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-medium text-yellow-400 uppercase tracking-wider mb-3">Live Now</h2>
            <div className="space-y-3">
              {data.live.map((m: any) => (
                <div key={m.id} className="bg-[#12121a] border border-yellow-500/20 rounded-lg p-4 text-center">
                  <p className="text-[11px] text-[#555566] uppercase tracking-wider mb-2">Table {m.tableNumber || "?"}</p>
                  <p className="text-sm font-medium text-[#3b82f6] truncate">{m.player1?.firstName || "TBD"}</p>
                  <p className="text-3xl font-bold my-1 font-mono">{m.score1} - {m.score2}</p>
                  <p className="text-sm font-medium text-[#ef4444] truncate">{m.player2?.firstName || "TBD"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.recent.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-medium text-[#666680] uppercase tracking-wider mb-3">Recent Results</h2>
            <div className="space-y-2">
              {data.recent.map((m: any) => (
                <div key={m.id} className="bg-[#12121a] p-3 rounded-lg flex justify-between items-center border border-[#1e1e2e]">
                  <span className="flex-1 min-w-0 text-right text-sm text-[#8888a0] truncate pr-2">{m.player1?.firstName || "TBD"}</span>
                  <span className="px-3 font-mono font-bold text-sm shrink-0">{m.score1} - {m.score2}</span>
                  <span className="flex-1 min-w-0 text-sm text-[#8888a0] truncate pl-2">{m.player2?.firstName || "TBD"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {standings.length > 0 && (
          <div>
            <h2 className="text-xs font-medium text-[#666680] uppercase tracking-wider mb-3">Standings</h2>
            <div className="bg-[#12121a] rounded-lg border border-[#1e1e2e] divide-y divide-[#1e1e2e]/50">
              {standings.map((s: any, i: number) => (
                <div key={s.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[#555566] text-xs w-4 shrink-0">{i + 1}</span>
                    <span className="truncate">{s.firstName} {s.lastName}</span>
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
          <div className="text-center py-16 bg-[#12121a] rounded-lg border border-[#1e1e2e]">
            <p className="text-[#666680] text-sm">No matches yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
