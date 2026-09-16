import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { apiService } from "../services/api";

export default function MatchPage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>();
  const navigate = useNavigate();
  const [match, setMatch] = useState<any>(null);
  const [deuce, setDeuce] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchMatch = useCallback(async () => {
    if (!matchId) return;
    try { const r = await apiService.matches.getById(matchId); setMatch(r.data); }
    catch (e) { console.error(e); }
  }, [matchId]);

  useEffect(() => { fetchMatch(); }, [fetchMatch]);
  useEffect(() => {
    const i = setInterval(fetchMatch, 2000);
    return () => clearInterval(i);
  }, [fetchMatch]);

  const setPointsToWin = async (pointsToWin: number) => {
    try { const r = await apiService.matches.updateSettings(matchId!, { pointsToWin }); setMatch(r.data); }
    catch (e: any) { setError(e.response?.data?.error || "Failed"); }
  };

  const startMatch = async () => {
    try { const r = await apiService.matches.start(matchId!); setMatch(r.data); }
    catch (e: any) { setError(e.response?.data?.error || "Failed"); }
  };

  const score = async (side: 1 | 2) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiService.matches.score(matchId!, { side });
      setMatch(r.data.match); setDeuce(r.data.deuce);
    } catch (e: any) { setError(e.response?.data?.error || "Failed"); }
    finally { setBusy(false); }
  };

  const undo = async () => { try { const r = await apiService.matches.undo(matchId!); setMatch(r.data.match); } catch (e: any) { setError(e.response?.data?.error || "Failed"); } };
  const recordLet = async () => { try { const r = await apiService.matches.recordLet(matchId!); setMatch(r.data.match); } catch (e: any) { setError(e.response?.data?.error || "Failed"); } };
  const endMatch = async () => { try { await apiService.matches.end(matchId!); navigate(`/tournament/${id}`); } catch (e: any) { setError(e.response?.data?.error || "Failed"); } };

  if (!match) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-[#666680] text-sm">Loading...</div>;

  const isDeuceNow = deuce || (match.score1 >= match.pointsToWin - 1 && match.score2 >= match.pointsToWin - 1);

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-3 pb-8">
      <div className="max-w-sm mx-auto">
        <button onClick={() => navigate(`/tournament/${id}`)} className="text-[#666680] mb-3 text-sm">&larr; Back</button>

        {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-3">{error}</div>}

        <div className="bg-[#12121a] rounded-lg p-4 mb-3 border border-[#1e1e2e] text-center">
          <p className="text-[11px] text-[#555566] uppercase tracking-wider mb-1">
            {match.tableNumber ? `Table ${match.tableNumber}` : "No table"} &middot; Race to {match.pointsToWin}
          </p>
          {match.status === "NOT_STARTED" && (
            <div className="flex justify-center gap-2 mt-2">
              {[11, 21].map(pts => (
                <button key={pts} onClick={() => setPointsToWin(pts)}
                  className={`px-4 py-1.5 rounded text-sm font-medium border ${
                    match.pointsToWin === pts ? "bg-[#3b82f6] text-white border-[#3b82f6]" : "bg-transparent text-[#8888a0] border-[#333]"
                  }`}>
                  {pts} pts
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#12121a] rounded-lg p-4 mb-3 border border-[#1e1e2e]">
          <div className="text-center text-[11px] text-[#555566] uppercase tracking-wider mb-3">
            {match.status === "IN_PROGRESS" ? (isDeuceNow ? "DEUCE" : `Serving: ${match.serverSide === 1 ? (match.player1?.firstName || "P1") : (match.player2?.firstName || "P2")}`) : match.status.replace("_", " ")}
            {match.letCount > 0 && ` · Lets: ${match.letCount}`}
          </div>
          <div className="flex justify-around items-center">
            <div className="text-center flex-1">
              <p className="text-sm font-medium truncate px-1">{match.player1?.firstName || "TBD"}</p>
              <p className="text-6xl font-bold mt-1 text-[#3b82f6]">{match.score1}</p>
            </div>
            <p className="text-2xl text-[#333] px-1">:</p>
            <div className="text-center flex-1">
              <p className="text-sm font-medium truncate px-1">{match.player2?.firstName || "TBD"}</p>
              <p className="text-6xl font-bold mt-1 text-[#ef4444]">{match.score2}</p>
            </div>
          </div>
        </div>

        {match.status === "COMPLETED" ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
            <p className="text-green-400 font-medium text-sm">Match completed</p>
            <p className="text-green-300/70 text-xs mt-1">Winner: {match.score1 > match.score2 ? match.player1?.firstName : match.player2?.firstName}</p>
          </div>
        ) : match.status === "NOT_STARTED" ? (
          <button onClick={startMatch} className="w-full bg-[#3b82f6] text-white py-4 rounded-lg text-sm font-medium active:scale-[0.98] transition-transform">
            Start Match
          </button>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => score(1)} className="bg-[#3b82f6] text-white py-6 rounded-lg text-lg font-bold active:scale-[0.97] transition-transform">
                {match.player1?.firstName || "P1"} +1
              </button>
              <button onClick={() => score(2)} className="bg-[#ef4444] text-white py-6 rounded-lg text-lg font-bold active:scale-[0.97] transition-transform">
                {match.player2?.firstName || "P2"} +1
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={undo} className="bg-[#1e1e2e] text-[#8888a0] py-2.5 rounded-lg text-sm border border-[#333]">Undo</button>
              <button onClick={recordLet} className="bg-yellow-500/10 text-yellow-400 py-2.5 rounded-lg text-sm border border-yellow-500/20">Let</button>
              <button onClick={endMatch} className="bg-[#1e1e2e] text-[#8888a0] py-2.5 rounded-lg text-sm border border-[#333]">End</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
