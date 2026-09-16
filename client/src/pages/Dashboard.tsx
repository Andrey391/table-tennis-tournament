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
      <div className="relative overflow-hidden rounded-2xl border border-[#1e1e2e] bg-gradient-to-br from-[#191930] via-[#12121a] to-[#0a0a0f] p-5 mb-5">
        <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-[#ccff00]/10 blur-2xl" />
        <p className="relative text-[11px] font-medium uppercase tracking-wider text-[#ccff00] mb-2">Club night</p>
        <h1 className="relative text-3xl font-bold leading-[1.1] tracking-tight">Table tennis<br />starts here</h1>
        <p className="relative text-sm text-[#8888a0] mt-2.5 max-w-[34ch]">Build a roster, split it into rating-seeded pairs, score every match live.</p>
        <Link to="/tournament/new"
          className="relative inline-flex mt-4 px-5 py-3 rounded-lg bg-[#ccff00] text-[#0a0a0f] text-sm font-bold active:scale-[0.97] transition-transform">
          New tournament
        </Link>
      </div>

      <div className="flex justify-between items-baseline mb-2.5">
        <h2 className="text-xs font-medium text-[#666680] uppercase tracking-wider">Tournaments</h2>
        {tournaments.length > 0 && <span className="text-xs text-[#555566]">{tournaments.length}</span>}
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-14 bg-[#12121a] rounded-lg border border-[#1e1e2e] px-4">
          <p className="text-[#666680] mb-4 text-sm">No tournaments yet</p>
          <Link to="/tournament/new" className="inline-block px-5 py-2.5 bg-[#ccff00] text-[#0a0a0f] rounded-lg text-sm font-bold">Create first tournament</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {tournaments.map(t => (
            <Link key={t.id} to={`/tournament/${t.id}`}
              className="relative block overflow-hidden bg-[#12121a] p-3.5 pl-4 rounded-lg border border-[#1e1e2e] active:bg-[#1e1e2e] transition-colors">
              <span className={`absolute left-0 top-0 bottom-0 w-1 ${
                t.status === "ACTIVE" ? "bg-yellow-400" : t.status === "COMPLETED" ? "bg-green-500" : "bg-[#2a2a3e]"
              }`} />
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-base truncate">{t.name}</h3>
                  <p className="text-xs text-[#666680] mt-1">{t._count?.players || 0} players &middot; {t._count?.matches || 0} matches</p>
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
