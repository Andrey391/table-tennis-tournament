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
      <div className="relative overflow-hidden rounded-2xl border border-[#1c3350] bg-gradient-to-br from-[#142a44] via-[#101f36] to-[#0a1628] p-5 mb-5">
        <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-[#ccff00]/10 blur-2xl" />
        <p className="relative text-[11px] font-medium uppercase tracking-wider text-[#ccff00] mb-2">Club night</p>
        <h1 className="relative text-3xl font-bold leading-[1.1] tracking-tight">Table tennis<br />starts here</h1>
        <p className="relative text-sm text-[#93a8c2] mt-2.5 max-w-[34ch]">Build a roster, split it into rating-seeded pairs, score every match live.</p>
        <Link to="/tournament/new"
          className="relative inline-flex mt-4 px-5 py-3 rounded-lg bg-[#ccff00] text-[#0a1628] text-sm font-bold active:scale-[0.97] transition-transform">
          New tournament
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {[
          { to: "/players", label: "Players", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
          { to: "/results", label: "Results", d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
          { to: "/bookings", label: "Bookings", d: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" },
          { to: "/tournament/new", label: "New tournament", d: "M12 5v14M5 12h14" },
        ].map(tile => (
          <Link key={tile.to} to={tile.to} className="bg-[#101f36] border border-[#1c3350] rounded-lg p-3.5 flex flex-col items-start gap-2 active:bg-[#1c3350] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ccff00" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d={tile.d} />
            </svg>
            <span className="text-sm font-medium">{tile.label}</span>
          </Link>
        ))}
      </div>

      <div className="flex justify-between items-baseline mb-2.5">
        <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider">Tournaments</h2>
        {tournaments.length > 0 && <span className="text-xs text-[#4d6480]">{tournaments.length}</span>}
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-14 bg-[#101f36] rounded-lg border border-[#1c3350] px-4">
          <p className="text-[#6b84a0] mb-4 text-sm">No tournaments yet</p>
          <Link to="/tournament/new" className="inline-block px-5 py-2.5 bg-[#ccff00] text-[#0a1628] rounded-lg text-sm font-bold">Create first tournament</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {tournaments.map(t => (
            <Link key={t.id} to={`/tournament/${t.id}`}
              className="relative block overflow-hidden bg-[#101f36] p-3.5 pl-4 rounded-lg border border-[#1c3350] active:bg-[#1c3350] transition-colors">
              <span className={`absolute left-0 top-0 bottom-0 w-1 ${
                t.status === "ACTIVE" ? "bg-yellow-400" : t.status === "COMPLETED" ? "bg-green-500" : "bg-[#24405e]"
              }`} />
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-base truncate">{t.name}</h3>
                  <p className="text-xs text-[#6b84a0] mt-1">{t._count?.players || 0} players &middot; {t._count?.matches || 0} matches</p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                  t.status === "ACTIVE" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
                  t.status === "COMPLETED" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                  "bg-[#1c3350] text-[#93a8c2] border border-[#333]"
                }`}>{STATUS_LABEL[t.status] || t.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
