import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { api } from "../services/api";

export default function LiveScore() {
  const { tournamentId } = useParams();
  const socket = useSocket();
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => { api.matches.getByTournament(tournamentId!).then(r => setMatches(r.data)).catch(console.error); }, [tournamentId]);

  useEffect(() => {
    if (!socket) return;
    socket.on("match-updated", (updated: any) => {
      setMatches(prev => prev.map(m => m.id === updated.id ? updated : m));
    });
    return () => { socket.off("match-updated"); };
  }, [socket]);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2 text-center">Live Scoreboard</h1>
      <p className="text-center text-gray-400 mb-8">Tournament: {tournamentId}</p>
      <div className="grid grid-cols-2 gap-4 max-w-4xl mx-auto">
        {matches.filter((m: any) => m.status === "IN_PROGRESS").map((m: any) => (
          <div key={m.id} className="bg-gray-800 p-8 rounded-lg text-center border-2 border-blue-500">
            <p className="text-xl text-gray-400 mb-2">Table {m.tableNumber}</p>
            <p className="text-5xl font-bold text-blue-400 mb-2">{m.player1?.firstName || m.team1?.name}</p>
            <p className="text-4xl text-gray-500 mb-4">vs</p>
            <p className="text-5xl font-bold text-red-400 mb-2">{m.player2?.firstName || m.team2?.name}</p>
            <p className="text-3xl font-bold mt-4">{m.score1} : {m.score2}</p>
            <p className="text-gray-400 mt-2">Games: {m.gamesWon1} - {m.gamesWon2}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
