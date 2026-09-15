import { useParams } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { apiService } from "../services/api";

export default function LiveScore() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const [matches, setMatches] = useState<any[]>([]);
  const [tournament, setTournament] = useState<any>(null);

  const fetch = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const r = await apiService.live.get(tournamentId);
      setMatches(r.data);
    } catch (e) { console.error(e); }
  }, [tournamentId]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { const i = setInterval(fetch, 2000); return () => clearInterval(i); }, [fetch]);

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2">🔴 Live Scoreboard</h1>
        <p className="text-center text-gray-400 mb-8">Tournament: {tournamentId}</p>

        {matches.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-xl">No live matches</p>
            <p className="text-gray-600 text-sm mt-2">This page updates automatically</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {matches.map((m: any) => {
              const activeGame = m.games?.find((g: any) => g.state === "IN_PROGRESS");
              return (
                <div key={m.id} className="bg-gray-800 p-8 rounded-lg text-center border-2 border-yellow-500">
                  <p className="text-sm text-gray-400 mb-2">Table {m.tableNumber || "?"} · {m.group?.name || ""}</p>
                  <div className="flex justify-around items-center">
                    <div className="text-center flex-1">
                      <p className="text-3xl font-bold text-blue-400">{m.player1?.firstName || "TBD"}</p>
                      <p className="text-5xl font-bold mt-2 text-blue-400">{m.gamesWon1}</p>
                    </div>
                    <div className="text-center px-4">
                      <p className="text-4xl text-gray-500">vs</p>
                      {activeGame && (
                        <p className="text-2xl font-bold text-yellow-400 mt-2">{activeGame.player1Score} - {activeGame.player2Score}</p>
                      )}
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-3xl font-bold text-red-400">{m.player2?.firstName || "TBD"}</p>
                      <p className="text-5xl font-bold mt-2 text-red-400">{m.gamesWon2}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
