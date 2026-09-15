import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { apiService } from "../services/api";

export default function MatchPage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>();
  const navigate = useNavigate();
  const [match, setMatch] = useState<any>(null);
  const [game, setGame] = useState<any>(null);
  const [deuce, setDeuce] = useState(false);
  const [error, setError] = useState("");

  const fetchMatch = useCallback(async () => {
    if (!matchId) return;
    try {
      const r = await apiService.matches.getById(matchId);
      setMatch(r.data);
      const active = r.data.games?.find((g: any) => g.state === "IN_PROGRESS");
      setGame(active || null);
    } catch (e) { console.error(e); }
  }, [matchId]);

  useEffect(() => { fetchMatch(); }, [fetchMatch]);
  useEffect(() => { const i = setInterval(fetchMatch, 2000); return () => clearInterval(i); }, [fetchMatch]);

  const startGame = async () => {
    try {
      const r = await apiService.matches.startGame(matchId!);
      setGame(r.data.game);
    } catch (e: any) { setError(e.response?.data?.error || "Failed"); }
  };

  const score = async (side: number) => {
    try {
      const r = await apiService.matches.score(matchId!, { side });
      setGame(r.data.game);
      setDeuce(r.data.deuce);
      if (r.data.match) setMatch((prev: any) => ({ ...prev, ...r.data.match }));
    } catch (e: any) { setError(e.response?.data?.error || "Failed"); }
  };

  const undo = async () => {
    try { await apiService.matches.undo(matchId!); fetchMatch(); } catch (e: any) { setError(e.response?.data?.error || "Failed"); }
  };

  const recordLet = async () => {
    try { await apiService.matches.recordLet(matchId!); } catch (e: any) { setError(e.response?.data?.error || "Failed"); }
  };

  const endMatch = async () => {
    try { await apiService.matches.end(matchId!); navigate(`/tournament/${id}`); } catch (e: any) { setError(e.response?.data?.error || "Failed"); }
  };

  if (!match) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;

  const required = match.format === "BEST_OF_7" ? 4 : match.format === "BEST_OF_5" ? 3 : 2;

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-lg mx-auto">
        <button onClick={() => navigate(`/tournament/${id}`)} className="text-gray-400 hover:text-white mb-4 text-sm">← Back to tournament</button>

        {error && <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4 text-sm border border-red-700">{error}</div>}

        <div className="bg-gray-800 rounded-lg p-6 mb-4 border border-gray-700">
          <div className="text-center text-sm text-gray-400 mb-2">{match.group?.name || "Match"} · {match.tableNumber ? `Table ${match.tableNumber}` : ""} · {match.format}</div>
          <div className="flex justify-around items-center mb-4">
            <div className="text-center flex-1">
              <p className="text-3xl font-bold text-blue-400">{match.gamesWon1}</p>
              <p className="text-lg font-medium mt-1">{match.player1?.firstName || "TBD"}</p>
              <p className="text-xs text-gray-500">{match.player1?.lastName || ""}</p>
            </div>
            <div className="text-center px-4">
              <p className="text-gray-500 text-sm">Games to {required}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-3xl font-bold text-red-400">{match.gamesWon2}</p>
              <p className="text-lg font-medium mt-1">{match.player2?.firstName || "TBD"}</p>
              <p className="text-xs text-gray-500">{match.player2?.lastName || ""}</p>
            </div>
          </div>
          <div className="text-center text-xs text-gray-500">
            Total points: {match.score1} - {match.score2}
          </div>
        </div>

        {game && (
          <div className="bg-gray-800 rounded-lg p-6 mb-4 border border-gray-700">
            <div className="text-center text-sm text-gray-400 mb-3">
              Game {game.gameNumber} · {deuce ? "DEUCE!" : `Server: ${game.serverSide === 1 ? match.player1?.firstName : match.player2?.firstName}`}
              {game.letCount > 0 && ` · Lets: ${game.letCount}`}
            </div>
            <div className="flex justify-around items-center mb-4">
              <div className="text-center">
                <p className="text-5xl font-bold text-blue-400">{game.player1Score}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl text-gray-500">:</p>
              </div>
              <div className="text-center">
                <p className="text-5xl font-bold text-red-400">{game.player2Score}</p>
              </div>
            </div>
            <div className="text-center mb-4">
              <span className="text-xs text-gray-500">Game score: </span>
              {match.games?.filter((g: any) => g.state === "COMPLETED").map((g: any, i: number) => (
                <span key={i} className="text-xs mx-1">{g.player1Score}-{g.player2Score}</span>
              ))}
            </div>
          </div>
        )}

        {match.status === "COMPLETED" ? (
          <div className="bg-green-900/50 border border-green-700 rounded-lg p-4 text-center">
            <p className="text-green-200 font-bold">Match completed</p>
            <p className="text-green-300">Winner: {match.gamesWon1 > match.gamesWon2 ? match.player1?.firstName : match.player2?.firstName}</p>
          </div>
        ) : !game ? (
          <button onClick={startGame} className="w-full bg-green-600 text-white py-3 rounded-lg text-lg font-bold hover:bg-green-700">
            Start Match
          </button>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => score(1)} className="bg-blue-600 text-white py-4 rounded-lg text-2xl font-bold hover:bg-blue-700 active:scale-95 transition">
                {match.player1?.firstName} +1
              </button>
              <button onClick={() => score(2)} className="bg-red-600 text-white py-4 rounded-lg text-2xl font-bold hover:bg-red-700 active:scale-95 transition">
                {match.player2?.firstName} +1
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={undo} className="bg-gray-600 text-white py-2 rounded-lg text-sm hover:bg-gray-500">Undo</button>
              <button onClick={recordLet} className="bg-yellow-600 text-white py-2 rounded-lg text-sm hover:bg-yellow-500">Let</button>
              <button onClick={endMatch} className="bg-gray-600 text-white py-2 rounded-lg text-sm hover:bg-gray-500">End</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
