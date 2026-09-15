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

export default function RatingPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [players, setPlayers] = useState<any[]>([]);

  useEffect(() => { apiService.rating.getAll().then(r => setPlayers(r.data)).catch(console.error); }, []);

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
        <h1 className="text-2xl font-bold mb-6">🏆 Player Ratings</h1>
        {players.length === 0 ? (
          <div className="text-center py-16 bg-gray-800 rounded-lg border border-gray-700">
            <p className="text-gray-400 text-lg">No rated players yet</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
            <table className="w-full">
              <thead><tr className="bg-gray-750 border-b border-gray-700">
                <th className="px-4 py-3 text-left text-sm text-gray-400 w-12">#</th>
                <th className="px-4 py-3 text-left text-sm text-gray-400">Player</th>
                <th className="px-4 py-3 text-left text-sm text-gray-400">Club</th>
                <th className="px-4 py-3 text-right text-sm text-gray-400">Rating</th>
              </tr></thead>
              <tbody>
                {players.map((p: any, i: number) => (
                  <tr key={p.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                    <td className="px-4 py-3">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-gray-500">{i + 1}</span>}
                    </td>
                    <td className="px-4 py-3 font-medium">{p.firstName} {p.lastName}</td>
                    <td className="px-4 py-3 text-gray-400">{p.club || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-blue-400">{p.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
