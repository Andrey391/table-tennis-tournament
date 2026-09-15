import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";

export default function PublicTournament() {
  const { id } = useParams();
  const [tournament, setTournament] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);

  useEffect(() => {
    api.tournaments.getById(id!).then(r => { setTournament(r.data); api.matches.getByTournament(id!).then(m => setMatches(m.data)).catch(console.error); api.tournaments.standings(id!).then(s => setStandings(s.data)).catch(console.error); }).catch(console.error);
  }, [id]);

  if (!tournament) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="bg-gray-800 p-6 rounded mb-6">
        <h1 className="text-3xl font-bold mb-2">{tournament.name}</h1>
        <p className="text-gray-400">{tournament.type} • {tournament.system} • {tournament.format}</p>
        <p className="text-gray-500">Status: {tournament.status} • Tables: {tournament.tablesCount}</p>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-800 p-4 rounded text-center"><h3 className="text-blue-400 font-semibold">Now Playing</h3><p className="mt-2">Check live</p></div>
        <div className="bg-gray-800 p-4 rounded text-center"><h3 className="text-green-400 font-semibold">Latest Results</h3><p className="mt-2">Recent</p></div>
        <div className="bg-gray-800 p-4 rounded text-center"><h3 className="text-yellow-400 font-semibold">Next Matches</h3><p className="mt-2">Upcoming</p></div>
      </div>
      {standings.length > 0 && (
        <div className="bg-gray-800 p-6 rounded mb-6">
          <h2 className="text-xl font-semibold mb-4">Standings</h2>
          <table className="w-full">
            <thead><tr className="text-gray-400"><th>Rank</th><th>Player</th><th>Won</th><th>Lost</th><th>Points</th></tr></thead>
            <tbody>
              {standings.map((s, i) => <tr key={s.playerId} className="border-t border-gray-700"><td>{i + 1}</td><td>{s.player?.firstName}</td><td>{s.won}</td><td>{s.lost}</td><td>{s.points}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      <div className="bg-gray-800 p-6 rounded">
        <h2 className="text-xl font-semibold mb-4">Live Matches</h2>
        <div className="space-y-2">
          {matches.filter((m: any) => m.status === "IN_PROGRESS").map((m: any) => (
            <div key={m.id} className="flex justify-between bg-gray-700 p-3 rounded"><span>{m.player1?.firstName} vs {m.player2?.firstName}</span><span className="text-blue-400 font-bold">{m.score1}:{m.score2}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
