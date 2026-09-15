import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

const NAV = [
  { to: "/", label: "Dashboard", icon: "🏠" },
  { to: "/players", label: "Players", icon: "👥" },
  { to: "/results", label: "Results", icon: "📊" },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tournaments, setTournaments] = useState<any[]>([]);

  useEffect(() => { api.tournaments.getAll().then(r => setTournaments(r.data)).catch(console.error); }, []);

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
            <span className="text-sm text-gray-400">{user?.firstName} {user?.lastName} ({user?.role})</span>
            <button onClick={() => { logout(); navigate("/login"); }} className="px-3 py-1.5 bg-red-600 rounded text-sm hover:bg-red-700">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Tournaments</h1>
            <p className="text-gray-400 text-sm mt-1">Manage your table tennis tournaments</p>
          </div>
          <Link to="/tournament/new" className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">+ Create Tournament</Link>
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center py-16 bg-gray-800 rounded-lg">
            <p className="text-gray-400 text-lg mb-4">No tournaments yet</p>
            <Link to="/tournament/new" className="px-6 py-2 bg-blue-600 rounded hover:bg-blue-700">Create your first tournament</Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {tournaments.map(t => (
              <Link key={t.id} to={`/tournament/${t.id}`}
                className="bg-gray-800 p-4 rounded-lg hover:bg-gray-750 border border-gray-700 hover:border-gray-600 transition">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold">{t.name}</h2>
                    <p className="text-gray-400 text-sm">{t.type} · {t.system} · {t.format}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded text-xs ${
                      t.status === "IN_PROGRESS" ? "bg-yellow-900 text-yellow-200" :
                      t.status === "COMPLETED" ? "bg-green-900 text-green-200" :
                      "bg-gray-700 text-gray-400"
                    }`}>{t.status || "DRAFT"}</span>
                    <p className="text-gray-500 text-xs mt-1">{t._count?.players || 0} players · {t._count?.matches || 0} matches</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
