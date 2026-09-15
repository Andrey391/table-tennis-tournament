import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";

export default function BracketPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    apiService.tournaments.getById(id).then(r => setTournament(r.data)).catch(console.error);
  }, [id]);

  if (!tournament) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;

  const rounds = tournament.matches?.reduce((acc: any, m: any) => {
    const r = m.round || 0;
    if (!acc[r]) acc[r] = [];
    acc[r].push(m);
    return acc;
  }, {}) || {};

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Bracket: {tournament.name}</h1>
          <Link to={`/tournament/${id}`} className="text-blue-400 hover:text-blue-300">← Back</Link>
        </div>
        <div className="flex gap-6 overflow-x-auto pb-4">
          {Object.keys(rounds).sort((a, b) => Number(a) - Number(b)).map(round => (
            <div key={round} className="min-w-[250px]">
              <h3 className="text-sm text-gray-400 mb-3 text-center">Round {round}</h3>
              <div className="space-y-3">
                {rounds[round].map((m: any) => (
                  <div key={m.id} className={`p-3 rounded-lg border ${m.status === "COMPLETED" ? "bg-gray-800 border-gray-700" : m.status === "IN_PROGRESS" ? "bg-yellow-900/20 border-yellow-600" : "bg-gray-800 border-gray-700"}`}>
                    <div className="flex justify-between text-sm">
                      <span className={m.gamesWon1 > m.gamesWon2 ? "text-green-400 font-bold" : ""}>{m.player1?.firstName || "TBD"}</span>
                      <span>{m.gamesWon1}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className={m.gamesWon2 > m.gamesWon1 ? "text-green-400 font-bold" : ""}>{m.player2?.firstName || "TBD"}</span>
                      <span>{m.gamesWon2}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
