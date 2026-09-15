import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { Link, useNavigate } from "react-router-dom";

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [tab, setTab] = useState<"matches" | "groups" | "players" | "settings">("matches");

  useEffect(() => {
    if (!id) return;
    apiService.tournaments.getById(id).then(r => setTournament(r.data)).catch(console.error);
    apiService.tournaments.standings(id).then(r => setStandings(r.data)).catch(console.error);
  }, [id]);

  if (!tournament) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;

  const live = tournament.matches?.filter((m: any) => m.status === "IN_PROGRESS") || [];
  const completed = tournament.matches?.filter((m: any) => m.status === "COMPLETED") || [];
  const scheduled = tournament.matches?.filter((m: any) => m.status === "NOT_STARTED") || [];

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">{tournament.name}</h1>
            <p className="text-gray-400 text-sm">{tournament.type} · {tournament.system} · {tournament.format} · {tournament.tablesCount} tables</p>
          </div>
          <div className="flex gap-2">
            <Link to={`/live/${id}`} className="px-4 py-2 bg-green-600 rounded text-sm hover:bg-green-700">Live</Link>
            <Link to={`/public/tournament/${id}`} className="px-4 py-2 bg-purple-600 rounded text-sm hover:bg-purple-700">Public</Link>
          </div>
        </div>

        <div className="flex gap-1 mb-6 border-b border-gray-700 pb-2">
          {(["matches", "groups", "players", "settings"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded text-sm capitalize ${tab === t ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-700"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "matches" && (
          <div className="space-y-4">
            {live.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 text-yellow-400">🔴 Live</h2>
                {live.map((m: any) => (
                  <Link key={m.id} to={`/tournament/${id}/match/${m.id}`}
                    className="flex justify-between items-center bg-yellow-900/20 border border-yellow-700 p-3 rounded-lg mb-2 hover:bg-yellow-900/30">
                    <span className="flex-1 text-right">{m.player1?.firstName || m.team1?.name || "TBD"}</span>
                    <span className="px-4 font-bold text-yellow-400">{m.gamesWon1} - {m.gamesWon2}</span>
                    <span className="flex-1">{m.player2?.firstName || m.team2?.name || "TBD"}</span>
                    {m.tableNumber && <span className="ml-4 text-xs text-gray-500">T{m.tableNumber}</span>}
                  </Link>
                ))}
              </div>
            )}
            {scheduled.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2">Scheduled</h2>
                {scheduled.map((m: any) => (
                  <Link key={m.id} to={`/tournament/${id}/match/${m.id}`}
                    className="flex justify-between items-center bg-gray-800 p-3 rounded-lg mb-2 border border-gray-700 hover:bg-gray-750">
                    <span className="flex-1 text-right">{m.player1?.firstName || m.team1?.name || "TBD"}</span>
                    <span className="px-4 text-gray-500">vs</span>
                    <span className="flex-1">{m.player2?.firstName || m.team2?.name || "TBD"}</span>
                    {m.tableNumber && <span className="ml-4 text-xs text-gray-500">T{m.tableNumber}</span>}
                  </Link>
                ))}
              </div>
            )}
            {completed.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2">Completed</h2>
                {completed.map((m: any) => (
                  <div key={m.id} className="flex justify-between items-center bg-gray-800/50 p-3 rounded-lg mb-2 border border-gray-700/50">
                    <span className="flex-1 text-right text-gray-300">{m.player1?.firstName || m.team1?.name || "TBD"}</span>
                    <span className="px-4 font-bold">{m.gamesWon1} - {m.gamesWon2}</span>
                    <span className="flex-1 text-gray-300">{m.player2?.firstName || m.team2?.name || "TBD"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "groups" && (
          <div className="space-y-6">
            {standings.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Draw not performed yet</p>
            ) : standings.map((g: any) => (
              <div key={g.id} className="bg-gray-800 rounded-lg border border-gray-700">
                <h3 className="px-4 py-3 font-semibold border-b border-gray-700">{g.name}</h3>
                <table className="w-full">
                  <thead><tr className="text-xs text-gray-500">
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Player</th>
                    <th className="px-4 py-2 text-center">W</th>
                    <th className="px-4 py-2 text-center">L</th>
                    <th className="px-4 py-2 text-center">GW-GL</th>
                    <th className="px-4 py-2 text-center">Pts</th>
                  </tr></thead>
                  <tbody>
                    {g.standings?.map((s: any, i: number) => (
                      <tr key={s.userId} className="border-t border-gray-700/50">
                        <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-2">{s.firstName} {s.lastName}</td>
                        <td className="px-4 py-2 text-center text-green-400">{s.wins}</td>
                        <td className="px-4 py-2 text-center text-red-400">{s.losses}</td>
                        <td className="px-4 py-2 text-center">{s.gamesWon}-{s.gamesLost}</td>
                        <td className="px-4 py-2 text-center font-bold">{s.matchPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {tab === "players" && (
          <div className="space-y-2">
            <div className="flex gap-2 mb-4">
              <button onClick={() => id && apiService.tournaments.seed(id).then(() => apiService.tournaments.standings(id).then(r => setStandings(r.data)))}
                className="px-4 py-2 bg-blue-600 rounded text-sm hover:bg-blue-700">Auto-seed by rating</button>
              <button onClick={() => id && apiService.tournaments.draw(id).then(() => { apiService.tournaments.getById(id).then(r => setTournament(r.data)); apiService.tournaments.standings(id).then(r => setStandings(r.data)); })}
                className="px-4 py-2 bg-green-600 rounded text-sm hover:bg-green-700">Perform Draw</button>
            </div>
            {tournament.players?.map((p: any) => (
              <div key={p.id} className="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700">
                <span>{p.user?.firstName} {p.user?.lastName}</span>
                <span className="text-sm text-gray-400">{p.user?.club || "No club"}</span>
                <span className="font-mono text-blue-400">{p.user?.rating || 1000}</span>
                {p.seed && <span className="text-xs bg-gray-700 px-2 py-1 rounded">Seed {p.seed}</span>}
              </div>
            ))}
          </div>
        )}

        {tab === "settings" && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
            <div><span className="text-gray-400">Status:</span> <span className="font-medium">{tournament.status}</span></div>
            <div><span className="text-gray-400">Organizer:</span> <span className="font-medium">{tournament.organizer?.firstName} {tournament.organizer?.lastName}</span></div>
            <div><span className="text-gray-400">Tables:</span> <span className="font-medium">{tournament.tablesCount}</span></div>
            {tournament.system === "ROUND_ROBIN" && (
              <>
                <div><span className="text-gray-400">Max Groups:</span> <span className="font-medium">{tournament.maxGroups || "—"}</span></div>
                <div><span className="text-gray-400">Players per Group:</span> <span className="font-medium">{tournament.playersPerGroup || "—"}</span></div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
