import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";

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
        className="w-full px-3 py-2.5 bg-[#101f36] rounded border border-[#1c3350] text-sm focus:outline-none mb-3" />
      {loading ? (
        <div className="text-center py-12 text-[#6b84a0] text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#101f36] rounded-lg border border-[#1c3350]">
          <p className="text-[#6b84a0] text-sm">No players found</p>
        </div>
      ) : (
        <div className="bg-[#101f36] rounded-lg border border-[#1c3350] divide-y divide-[#1c3350]/50">
          {filtered.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xs text-[#4d6480] w-5 shrink-0">{i + 1}</span>
                <Avatar firstName={p.firstName} lastName={p.lastName} rating={p.rating} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-xs text-[#6b84a0] truncate">{p.club || "No club"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
