import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";

export default function PublicTournament() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    apiService.public.tournament(id).then(r => setData(r.data)).catch(console.error);
    apiService.public.standings(id).then(r => setStandings(r.data)).catch(console.error);
  }, [id]);

  if (!data) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{data.tournament.name}</h1>
          <p className="text-gray-400">{data.tournament.type} · {data.tournament.system} · {data.tournament.format}</p>
          <p className={`text-sm mt-2 ${data.tournament.status === "IN_PROGRESS" ? "text-yellow-400" : data.tournament.status === "COMPLETED" ? "text-green-400" : "text-gray-400"}`}>
            {data.tournament.status}
          </p>
        </div>

        {data.live.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-yellow-400">🔴 Live Now</h2>
            <div className="grid grid-cols-2 gap-4">
              {data.live.map((m: any) => (
                <div key={m.id} className="bg-yellow-900/20 border-2 border-yellow-500 rounded-lg p-6 text-center">
                  <p className="text-xs text-gray-500 mb-2">Table {m.tableNumber || "?"}</p>
                  <p className="text-lg font-medium text-blue-400">{m.player1?.firstName || "TBD"}</p>
                  <p className="text-3xl font-bold my-2">{m.gamesWon1} - {m.gamesWon2}</p>
                  <p className="text-lg font-medium text-red-400">{m.player2?.firstName || "TBD"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.recent.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Recent Results</h2>
            <div className="space-y-2">
              {data.recent.map((m: any) => (
                <div key={m.id} className="bg-gray-800 p-3 rounded-lg flex justify-between items-center border border-gray-700">
                  <span className="flex-1 text-right">{m.player1?.firstName || "TBD"}</span>
                  <span className="px-4 font-bold">{m.gamesWon1} - {m.gamesWon2}</span>
                  <span className="flex-1">{m.player2?.firstName || "TBD"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {standings.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Standings</h2>
            {standings.map((g: any) => (
              <div key={g.id} className="bg-gray-800 rounded-lg border border-gray-700 mb-4">
                <h3 className="px-4 py-3 font-semibold border-b border-gray-700">{g.name}</h3>
                <table className="w-full">
                  <thead><tr className="text-xs text-gray-500">
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Player</th>
                    <th className="px-4 py-2 text-center">W</th>
                    <th className="px-4 py-2 text-center">L</th>
                    <th className="px-4 py-2 text-center">Pts</th>
                  </tr></thead>
                  <tbody>
                    {g.standings?.map((s: any, i: number) => (
                      <tr key={s.userId} className="border-t border-gray-700/50">
                        <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-2">{s.firstName} {s.lastName}</td>
                        <td className="px-4 py-2 text-center text-green-400">{s.wins}</td>
                        <td className="px-4 py-2 text-center text-red-400">{s.losses}</td>
                        <td className="px-4 py-2 text-center font-bold">{s.matchPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {data.live.length === 0 && data.recent.length === 0 && (
          <div className="text-center py-12 bg-gray-800 rounded-lg"><p className="text-gray-400">No matches yet</p></div>
        )}
      </div>
    </div>
  );
}
