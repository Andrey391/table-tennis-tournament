import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Link } from "react-router-dom";

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    api.tournaments.getById(id).then((r) => setTournament(r.data)).catch(console.error);
    api.matches.getByTournament(id).then((r) => setMatches(r.data)).catch(console.error);
  }, [id]);

  if (!tournament) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <div className="flex gap-2">
          <Link to={`/tournament/${id}/bracket`} className="px-4 py-2 bg-purple-600 rounded">Bracket</Link>
          <Link to={`/live/${id}`} className="px-4 py-2 bg-green-600 rounded">Live</Link>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 p-4 rounded"><h3 className="text-gray-400 text-sm">Type</h3><p>{tournament.type}</p></div>
        <div className="bg-gray-800 p-4 rounded"><h3 className="text-gray-400 text-sm">System</h3><p>{tournament.system}</p></div>
        <div className="bg-gray-800 p-4 rounded"><h3 className="text-gray-400 text-sm">Format</h3><p>{tournament.format}</p></div>
        <div className="bg-gray-800 p-4 rounded"><h3 className="text-gray-400 text-sm">Tables</h3><p>{tournament.tablesCount}</p></div>
      </div>
      <h2 className="text-xl font-semibold mb-4">Matches</h2>
      <div className="space-y-2">
        {matches.map((m: any) => (
          <Link key={m.id} to={`/tournament/${id}/match/${m.id}`} className="flex justify-between bg-gray-800 p-3 rounded hover:bg-gray-700">
            <span>{m.player1?.firstName || m.team1?.name || "TBD"} vs {m.player2?.firstName || m.team2?.name || "TBD"}</span>
            <span className={`px-2 py-1 rounded text-xs ${m.status === "COMPLETED" ? "bg-green-900 text-green-200" : m.status === "IN_PROGRESS" ? "bg-yellow-900 text-yellow-200" : "bg-gray-700 text-gray-400"}`}>{m.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
