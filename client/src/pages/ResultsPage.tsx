import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

const NAV = [
  { to: "/", label: "Dashboard", icon: "🏠" },
  { to: "/players", label: "Players", icon: "👥" },
  { to: "/results", label: "Results", icon: "📊" },
];

export default function ResultsPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    api.tournaments.getAll().then(r => setTournaments(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (selected) {
      api.matches.getByTournament(selected).then(r => setMatches(r.data)).catch(console.error);
    }
  }, [selected]);

  const completed = matches.filter((m: any) => m.status === "COMPLETED");

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold">🏓 TT Tournament</Link>
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
        <h1 className="text-2xl font-bold mb-6">Match Results</h1>

        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">Select Tournament</label>
          <select value={selected || ""} onChange={e => setSelected(e.target.value || null)}
            className="w-full max-w-md px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:outline-none">
            <option value="">-- Select tournament --</option>
            {tournaments.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {selected && completed.length === 0 && (
          <div className="text-center py-12 bg-gray-800 rounded-lg">
            <p className="text-gray-400">No completed matches yet</p>
          </div>
        )}

        {completed.length > 0 && (
          <div className="space-y-2">
            {completed.map((m: any) => (
              <div key={m.id} className="bg-gray-800 p-4 rounded-lg flex justify-between items-center border border-gray-700">
                <div className="flex-1 text-right">
                  <span className="text-white font-medium">{m.player1?.firstName || m.team1?.name || "TBD"}</span>
                </div>
                <div className="px-6 text-center">
                  <span className="text-xl font-bold text-blue-400">{m.gamesWon1}</span>
                  <span className="text-gray-500 mx-2">:</span>
                  <span className="text-xl font-bold text-red-400">{m.gamesWon2}</span>
                </div>
                <div className="flex-1 text-left">
                  <span className="text-white font-medium">{m.player2?.firstName || m.team2?.name || "TBD"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div className="mt-6">
            <Link to={`/tournament/${selected}`} className="text-blue-400 hover:text-blue-300 text-sm">View tournament details →</Link>
          </div>
        )}
      </main>
    </div>
  );
}
