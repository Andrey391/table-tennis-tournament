import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import Layout from "../components/Layout";

export default function RatingPage() {
  const [players, setPlayers] = useState<any[]>([]);

  useEffect(() => { apiService.rating.getAll().then(r => setPlayers(r.data)).catch(console.error); }, []);

  return (
    <Layout>
      <h1 className="text-2xl font-bold tracking-tight mb-3">Rating</h1>
      {players.length === 0 ? (
        <div className="text-center py-16 bg-[#12121a] rounded-lg border border-[#1e1e2e]">
          <p className="text-[#666680] text-sm">No rated players yet</p>
        </div>
      ) : (
        <div className="bg-[#12121a] rounded-lg border border-[#1e1e2e] divide-y divide-[#1e1e2e]/50">
          {players.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                {i < 3 ? (
                  <span className={`shrink-0 inline-flex w-6 h-6 rounded-full text-xs font-bold items-center justify-center ${
                    i === 0 ? "bg-yellow-500/20 text-yellow-400" : i === 1 ? "bg-gray-400/20 text-gray-300" : "bg-orange-500/20 text-orange-400"
                  }`}>{i + 1}</span>
                ) : <span className="text-xs text-[#555566] w-6 shrink-0 text-center">{i + 1}</span>}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-xs text-[#666680] truncate">{p.club || "No club"}</p>
                </div>
              </div>
              <span className="text-sm font-mono font-bold text-[#3b82f6] shrink-0">{p.rating}</span>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
