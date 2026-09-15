import { useParams } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";

export default function LiveScore() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const [matches, setMatches] = useState<any[]>([]);

  const fetchMatches = useCallback(async () => {
    if (!tournamentId) return;
    try { const r = await api.matches.getByTournament(tournamentId); setMatches(r.data); } catch (e) { console.error(e); }
  }, [tournamentId]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);
  useEffect(() => { const id = setInterval(fetchMatches, 2000); return () => clearInterval(id); }, [fetchMatches]);

  const live = matches.filter((m: any) => m.status === "IN_PROGRESS");

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2 text-center">Live Scoreboard</h1>
      <p className="text-center text-gray-400 mb-8">Tournament: {tournamentId}</p>
      <div className="grid grid-cols-2 gap-4 max-w-4xl mx-auto">
        {live.map((m: any) => (
          <div key={m.id} className="bg-gray-800 p-8 rounded-lg text-center border-2 border-blue-500">
            <p className="text-xl text-gray-400 mb-2">Table {m.tableNumber}</p>
            <p className="text-5xl font-bold text-blue-400 mb-2">{m.player1?.firstName || m.team1?.name || "TBD"}</p>
            <p className="text-4xl text-gray-500 mb-4">vs</p>
            <p className="text-5xl font-bold text-red-400 mb-2">{m.player2?.firstName || m.team2?.name || "TBD"}</p>
            <p className="text-3xl font-bold mt-4">{m.score1} : {m.score2}</p>
            <p className="text-gray-400 mt-2">Games: {m.gamesWon1} - {m.gamesWon2}</p>
          </div>
        ))}
      </div>
      {live.length === 0 && <p className="text-center text-gray-500 mt-8">No live matches</p>}
    </div>
  );
}
