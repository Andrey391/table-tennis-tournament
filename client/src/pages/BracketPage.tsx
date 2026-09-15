import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";

export default function BracketPage() {
  const { id } = useParams();
  const [tournament, setTournament] = useState<any>(null);
  const [brackets, setBrackets] = useState<any[]>([]);

  useEffect(() => {
    api.tournaments.getById(id!).then(r => { setTournament(r.data); setBrackets(r.data.brackets || []); }).catch(console.error);
  }, [id]);

  if (!tournament) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Bracket: {tournament.name}</h1>
      <div className="grid grid-cols-4 gap-4">
        {brackets.map((b, i) => (
          <div key={i} className="bg-gray-800 p-4 rounded">
            <h3 className="font-semibold mb-2">{b.type} - Round {b.round}</h3>
            <div className="space-y-2">
              {b.matchups?.map((m: any, idx: number) => (
                <div key={idx} className="bg-gray-700 p-2 rounded text-sm">
                  <p>{m.player1?.firstName || "TBD"}</p>
                  <p className="text-gray-500">vs</p>
                  <p>{m.player2?.firstName || "TBD"}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
