import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [tournaments, setTournaments] = useState<any[]>([]);

  useEffect(() => { api.tournaments.getAll().then(r => setTournaments(r.data)).catch(console.error); }, []);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button onClick={logout} className="px-4 py-2 bg-red-600 rounded">Logout</button>
      </div>
      <div className="flex justify-between items-center mb-4">
        <Link to="/tournament/new" className="px-4 py-2 bg-blue-600 rounded">Create Tournament</Link>
        {user?.role === "ORGANIZER" && <Link to="/import" className="px-4 py-2 bg-green-600 rounded">Import Players</Link>}
      </div>
      <div className="grid gap-4">
        {tournaments.map(t => (
          <Link key={t.id} to={`/tournament/${t.id}`} className="bg-gray-800 p-4 rounded hover:bg-gray-700">
            <h2 className="text-lg font-semibold">{t.name}</h2>
            <p className="text-gray-400">{t.type} • {t.system} • {t.status}</p>
            <p className="text-gray-500 text-sm">Players: {t._count?.players} | Matches: {t._count?.matches}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
