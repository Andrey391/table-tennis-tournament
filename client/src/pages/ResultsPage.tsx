import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiService } from "../services/api";

const NAV = [
  { to: "/", label: "Dashboard", icon: "🏠" },
  { to: "/players", label: "Players", icon: "👥" },
  { to: "/results", label: "Results", icon: "📊" },
  { to: "/rating", label: "Rating", icon: "🏆" },
];

export default function ResultsPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => { apiService.tournaments.getAll().then(r => setTournaments(r.data)).catch(console.error); }, []);
  useEffect(() => { if (selected) apiService.matches.getByTournament(selected).then(r => setMatches(r.data)).catch(console.error); }, [selected]);

  const completed = matches.filter((m: any) => m.status === "COMPLETED");
  const live = matches.filter((m: any) => m.status === "IN_PROGRESS");

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold">🏓 TT</Link>
            <nav className="flex gap-1">
              {NAV.map(n => (
                <Link key={n.to} to={n.to}
                  className={`px-3 py-1.5 rounded text-sm ${location.pathname === n.to ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}>
                  {n.icon} {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user?.firstName} {user?.lastName}</span>
            <button onClick={logout} className="px-3 py-1.5 bg-red-600 rounded text-sm hover:bg-red-700">Logout</button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Results</h1>
        <select value={selected || ""} onChange={e => setSelected(e.target.value || null)}
          className="w-full max-w-md px-4 py-2 bg-gray-700 rounded border border-gray-600 mb-6">
          <option value="">Select tournament</option>
          {tournaments.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        {live.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3 text-yellow-400">🔴 Live Now</h2>
            <div className="space-y-2">
              {live.map((m: any) => (
                <Link key={m.id} to={`/tournament/${selected}/match/${m.id}`}
                  className="flex items-center justify-between bg-yellow-900/20 border border-yellow-700 p-3 rounded-lg hover:bg-yellow-900/30">
                  <span>{m.player1?.firstName || "TBD"}</span>
                  <span className="font-bold text-yellow-400">{m.gamesWon1} - {m.gamesWon2}</span>
                  <span>{m.player2?.firstName || "TBD"}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {completed.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Completed</h2>
            <div className="space-y-2">
              {completed.map((m: any) => (
                <div key={m.id} className="bg-gray-800 p-3 rounded-lg flex justify-between items-center border border-gray-700">
                  <span className="flex-1 text-right">{m.player1?.firstName || "TBD"}</span>
                  <span className="px-4 font-bold">{m.gamesWon1} - {m.gamesWon2}</span>
                  <span className="flex-1">{m.player2?.firstName || "TBD"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected && completed.length === 0 && live.length === 0 && (
          <div className="text-center py-12 bg-gray-800 rounded-lg"><p className="text-gray-400">No results yet</p></div>
        )}
      </main>
    </div>
  );
}
