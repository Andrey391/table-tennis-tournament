import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";

export default function MatchPage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>();
  const navigate = useNavigate();
  const [match, setMatch] = useState<any>(null);
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [gamesWon1, setGamesWon1] = useState(0);
  const [gamesWon2, setGamesWon2] = useState(0);

  const fetchMatch = useCallback(async () => {
    if (!matchId) return;
    try {
      const r = await api.matches.getById(matchId);
      setMatch(r.data);
      setScore1(r.data.score1);
      setScore2(r.data.score2);
      setGamesWon1(r.data.gamesWon1);
      setGamesWon2(r.data.gamesWon2);
    } catch (e) { console.error(e); }
  }, [matchId]);

  useEffect(() => { fetchMatch(); }, [fetchMatch]);

  useEffect(() => {
    const id = setInterval(fetchMatch, 2000);
    return () => clearInterval(id);
  }, [fetchMatch]);

  const updateScore = async (field: string, delta: number) => {
    const newScore1 = field === "score1" ? Math.max(0, score1 + delta) : score1;
    const newScore2 = field === "score2" ? Math.max(0, score2 + delta) : score2;
    let newGW1 = gamesWon1;
    let newGW2 = gamesWon2;
    if (field === "score1" && newScore1 >= 11 && newScore1 - newScore2 >= 2) { newGW1 = gamesWon1 + 1; setGamesWon1(newGW1); }
    if (field === "score2" && newScore2 >= 11 && newScore2 - newScore1 >= 2) { newGW2 = gamesWon2 + 1; setGamesWon2(newGW2); }
    setScore1(newScore1); setScore2(newScore2);
    try { await api.matches.updateScore(matchId!, { score1: newScore1, score2: newScore2, gamesWon1: newGW1, gamesWon2: newGW2, state: "IN_PROGRESS" }); } catch (e) { console.error(e); }
  };

  const endMatch = async () => {
    try { await api.matches.end(matchId!); navigate(`/tournament/${id}`); } catch (e) { console.error(e); }
  };

  if (!match) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{match.player1?.firstName || match.team1?.name || "TBD"} vs {match.player2?.firstName || match.team2?.name || "TBD"}</h1>
      <div className="bg-gray-800 p-6 rounded-lg mb-6">
        <div className="flex justify-around items-center mb-4">
          <div className="text-center"><p className="text-6xl font-bold text-blue-400">{score1}</p><p className="text-gray-400">{match.player1?.firstName || match.team1?.name}</p></div>
          <div className="text-center"><p className="text-4xl font-bold text-gray-500">:</p></div>
          <div className="text-center"><p className="text-6xl font-bold text-red-400">{score2}</p><p className="text-gray-400">{match.player2?.firstName || match.team2?.name}</p></div>
        </div>
        <div className="flex justify-around text-lg">
          <span>Games: {gamesWon1}</span>
          <span className="text-gray-500">vs</span>
          <span>Games: {gamesWon2}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        {(["score1", "score2"] as const).map((side) => (
          <div key={side} className="flex gap-2">
            <button onClick={() => updateScore(side, 1)} className="flex-1 bg-blue-600 py-3 rounded text-xl font-bold">+1</button>
            <button onClick={() => updateScore(side, -1)} className="flex-1 bg-gray-600 py-3 rounded text-xl font-bold">-1</button>
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <button onClick={endMatch} className="flex-1 bg-green-600 py-3 rounded text-lg font-bold">End Match</button>
      </div>
    </div>
  );
}
