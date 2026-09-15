import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

const NAV = [
  { to: "/", label: "Dashboard", icon: "🏠" },
  { to: "/players", label: "Players", icon: "👥" },
  { to: "/results", label: "Results", icon: "📊" },
];

export default function PlayersPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.players.getAll().then(r => setPlayers(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

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
        <h1 className="text-2xl font-bold mb-6">Players & Ratings</h1>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : players.length === 0 ? (
          <div className="text-center py-16 bg-gray-800 rounded-lg">
            <p className="text-gray-400 text-lg mb-2">No players yet</p>
            <p className="text-gray-500 text-sm">Players will appear here once they register</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-750 border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">#</th>
                  <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">Name</th>
                  <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">Email</th>
                  <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">Club</th>
                  <th className="px-4 py-3 text-right text-sm text-gray-400 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p: any, i: number) => (
                  <tr key={p.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{p.firstName} {p.lastName}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{p.email}</td>
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
