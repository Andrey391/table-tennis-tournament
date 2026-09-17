import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { playerName } from "../lib/format";

// Courtside scoring for a casual game. Same shape as MatchPage, minus everything
// tournament-specific — and nothing here moves anyone's rating.
export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
  const [game, setGame] = useState<any>(null);
  const [deuce, setDeuce] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchGame = useCallback(async () => {
    if (!gameId) return;
    try { const r = await apiService.games.getById(gameId); setGame(r.data); }
    catch (e) { console.error(e); }
  }, [gameId]);

  useEffect(() => { fetchGame(); }, [fetchGame]);
  useEffect(() => {
    const i = setInterval(fetchGame, 2000);
    return () => clearInterval(i);
  }, [fetchGame]);

  const fail = (e: any) => setError(e.response?.data?.error || t("common.failed"));

  const setPointsToWin = async (pointsToWin: 11 | 21) => {
    try { const r = await apiService.games.update(gameId!, { pointsToWin }); setGame(r.data); } catch (e) { fail(e); }
  };
  const startGame = async () => { try { const r = await apiService.games.start(gameId!); setGame(r.data); } catch (e) { fail(e); } };
  const score = async (side: 1 | 2) => {
    if (busy) return;
    setBusy(true);
    try { const r = await apiService.games.score(gameId!, { side }); setGame(r.data.game); setDeuce(r.data.deuce); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const undo = async () => { try { const r = await apiService.games.undo(gameId!); setGame(r.data.game); } catch (e) { fail(e); } };
  const recordLet = async () => { try { const r = await apiService.games.recordLet(gameId!); setGame(r.data.game); } catch (e) { fail(e); } };
  const endGame = async () => { try { await apiService.games.end(gameId!); navigate("/games"); } catch (e) { fail(e); } };
  const forfeit = async (loserSide: 1 | 2) => {
    try { const r = await apiService.games.forfeit(gameId!, { loserSide }); setGame(r.data); } catch (e) { fail(e); }
  };
  const join = async () => { try { const r = await apiService.games.join(gameId!); setGame(r.data); } catch (e) { fail(e); } };

  if (!game) return <div className="min-h-screen bg-[#0a1628] flex items-center justify-center text-[#6b84a0] text-sm">{t("common.loading")}</div>;

  const isDeuceNow = deuce || (game.score1 >= game.pointsToWin - 1 && game.score2 >= game.pointsToWin - 1);
  const canScore = !!user && (game.organizerId === user.id || game.player1Id === user.id || game.player2Id === user.id);
  const openSlot = !game.player1Id || !game.player2Id;

  return (
    <div className="min-h-screen bg-[#0a1628] p-3 pb-8">
      <div className="max-w-sm mx-auto">
        <button onClick={() => navigate("/games")} className="text-[#6b84a0] mb-3 text-sm">&larr; {t("common.back")}</button>

        {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-3">{error}</div>}

        <div className="bg-[#101f36] rounded-lg p-4 mb-3 border border-[#1c3350] text-center">
          <p className="text-base font-semibold truncate">{game.title || t("games.title")}</p>
          <p className="text-[11px] text-[#4d6480] uppercase tracking-wider mt-1">
            {t("games.unrated")} &middot; {t("match.raceTo", { n: game.pointsToWin })}
            {game.club ? ` · ${game.club.name}` : ""}
          </p>
          {game.status === "NOT_STARTED" && canScore && (
            <div className="flex justify-center gap-2 mt-2">
              {([11, 21] as const).map(pts => (
                <button key={pts} onClick={() => setPointsToWin(pts)}
                  className={`px-4 py-1.5 rounded text-sm font-medium border ${
                    game.pointsToWin === pts ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-transparent text-[#93a8c2] border-[#1c3350]"
                  }`}>{t("match.pts", { n: pts })}</button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#101f36] rounded-lg p-4 mb-3 border border-[#1c3350]">
          <div className="text-center text-[11px] text-[#4d6480] uppercase tracking-wider mb-3">
            {game.status === "IN_PROGRESS"
              ? (isDeuceNow ? t("match.deuce") : `${t("match.server")}: ${playerName(game.serverSide === 1 ? game.player1 : game.player2, t("common.none"))}`)
              : t(`match.${game.status === "NOT_STARTED" ? "notStarted" : game.status === "COMPLETED" ? "completed" : "inProgress"}`)}
            {game.letCount > 0 && ` · ${t("match.lets")}: ${game.letCount}`}
          </div>
          <div className="flex justify-around items-center">
            <div className="text-center flex-1">
              <p className="text-base font-semibold text-[#3b82f6] truncate px-1">{playerName(game.player1, t("games.waiting"))}</p>
              <p className="text-7xl font-bold mt-1 tabular-nums leading-none text-[#3b82f6]">{game.score1}</p>
            </div>
            <p className="text-2xl text-[#1c3350] px-1">:</p>
            <div className="text-center flex-1">
              <p className="text-base font-semibold text-[#ef4444] truncate px-1">{playerName(game.player2, t("games.waiting"))}</p>
              <p className="text-7xl font-bold mt-1 tabular-nums leading-none text-[#ef4444]">{game.score2}</p>
            </div>
          </div>
        </div>

        {game.status === "COMPLETED" ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
            <p className="text-green-400 font-medium text-sm">{t("games.completed")}</p>
            <p className="text-green-300/70 text-xs mt-1">
              {t("match.winner")}: {playerName(game.score1 > game.score2 ? game.player1 : game.player2, t("common.none"))}
            </p>
          </div>
        ) : !canScore ? (
          <div className="space-y-2">
            {openSlot && game.status === "NOT_STARTED" && (
              <button onClick={join} className="w-full bg-[#ccff00] text-[#0a1628] py-4 rounded-lg text-base font-bold active:scale-[0.98] transition-transform">
                {t("games.join")}
              </button>
            )}
            <p className="text-center py-3 text-sm text-[#6b84a0] bg-[#101f36] rounded-lg border border-[#1c3350]">{t("games.onlyPlayers")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {game.status === "NOT_STARTED" ? (
              <>
                <button onClick={startGame} disabled={openSlot}
                  className="w-full bg-[#ccff00] text-[#0a1628] py-4 rounded-lg text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-transform">
                  {t("match.start")}
                </button>
                {openSlot && <p className="text-center text-xs text-[#6b84a0]">{t("games.needTwo")}</p>}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => score(1)} className="bg-[#3b82f6] text-white py-6 rounded-lg text-lg font-bold active:scale-[0.97] transition-transform">
                    {playerName(game.player1, "P1")} +1
                  </button>
                  <button onClick={() => score(2)} className="bg-[#ef4444] text-white py-6 rounded-lg text-lg font-bold active:scale-[0.97] transition-transform">
                    {playerName(game.player2, "P2")} +1
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={undo} className="bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm border border-[#1c3350]">{t("match.undo")}</button>
                  <button onClick={recordLet} className="bg-yellow-500/10 text-yellow-400 py-2.5 rounded-lg text-sm border border-yellow-500/20">{t("match.let")}</button>
                  <button onClick={endGame} className="bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm border border-[#1c3350]">{t("match.end")}</button>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => forfeit(1)} className="text-red-400 py-2 rounded-lg text-xs border border-red-500/20 bg-red-500/5">
                {playerName(game.player1, "P1")} {t("match.noShow")}
              </button>
              <button onClick={() => forfeit(2)} className="text-red-400 py-2 rounded-lg text-xs border border-red-500/20 bg-red-500/5">
                {playerName(game.player2, "P2")} {t("match.noShow")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
