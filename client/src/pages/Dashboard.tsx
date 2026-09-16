import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Adding players", ACTIVE: "In progress", COMPLETED: "Completed" };

export default function Dashboard() {
  const [tournaments, setTournaments] = useState<any[]>([]);

  useEffect(() => { apiService.tournaments.getAll().then(r => setTournaments(r.data)).catch(console.error); }, []);

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-bold">Tournaments</h1>
        <Link to="/tournament/new" className="px-3 py-2 bg-[#3b82f6] text-white rounded text-sm font-medium active:scale-[0.97] transition-transform">+ New</Link>
      </div>
      {tournaments.length === 0 ? (
        <div className="text-center py-16 bg-[#12121a] rounded-lg border border-[#1e1e2e] px-4">
          <p className="text-[#666680] mb-4 text-sm">No tournaments yet</p>
          <Link to="/tournament/new" className="inline-block px-5 py-2.5 bg-[#3b82f6] text-white rounded text-sm font-medium">Create first tournament</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {tournaments.map(t => (
            <Link key={t.id} to={`/tournament/${t.id}`}
              className="block bg-[#12121a] p-3 rounded-lg border border-[#1e1e2e] active:bg-[#1e1e2e] transition-colors">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">{t.name}</h2>
                  <p className="text-xs text-[#666680] mt-0.5">{t._count?.players || 0} players &middot; {t._count?.matches || 0} matches</p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                  t.status === "ACTIVE" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
                  t.status === "COMPLETED" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                  "bg-[#1e1e2e] text-[#8888a0] border border-[#333]"
                }`}>{STATUS_LABEL[t.status] || t.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
