import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import Layout from "../components/Layout";

export default function PlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { apiService.players.getAll().then(r => setPlayers(r.data)).catch(console.error).finally(() => setLoading(false)); }, []);

  const filtered = players.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout>
      <h1 className="text-2xl font-bold tracking-tight mb-3">Players</h1>
      <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full px-3 py-2.5 bg-[#12121a] rounded border border-[#1e1e2e] text-sm focus:outline-none mb-3" />
      {loading ? (
        <div className="text-center py-12 text-[#666680] text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#12121a] rounded-lg border border-[#1e1e2e]">
          <p className="text-[#666680] text-sm">No players found</p>
        </div>
      ) : (
        <div className="bg-[#12121a] rounded-lg border border-[#1e1e2e] divide-y divide-[#1e1e2e]/50">
          {filtered.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xs text-[#555566] w-5 shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-xs text-[#666680] truncate">{p.club || "No club"}</p>
                </div>
              </div>
              <span className="text-sm font-mono text-[#3b82f6] shrink-0">{p.rating}</span>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
