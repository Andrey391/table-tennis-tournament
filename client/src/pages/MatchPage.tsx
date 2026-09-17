import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { playerName } from "../lib/format";

export default function MatchPage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
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

  const fail = (e: any) => setError(e.response?.data?.error || t("common.failed"));

  const setPointsToWin = async (pointsToWin: number) => {
    try { const r = await apiService.matches.updateSettings(matchId!, { pointsToWin }); setMatch(r.data); } catch (e) { fail(e); }
  };
  const startMatch = async () => { try { const r = await apiService.matches.start(matchId!); setMatch(r.data); } catch (e) { fail(e); } };
  const score = async (side: 1 | 2) => {
    if (busy) return;
    setBusy(true);
    try { const r = await apiService.matches.score(matchId!, { side }); setMatch(r.data.match); setDeuce(r.data.deuce); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const undo = async () => { try { const r = await apiService.matches.undo(matchId!); setMatch(r.data.match); } catch (e) { fail(e); } };
  const recordLet = async () => { try { const r = await apiService.matches.recordLet(matchId!); setMatch(r.data.match); } catch (e) { fail(e); } };
  const endMatch = async () => { try { await apiService.matches.end(matchId!); navigate(`/tournament/${id}`); } catch (e) { fail(e); } };
  const forfeit = async (loserSide: 1 | 2) => {
    try { const r = await apiService.matches.forfeit(matchId!, { loserSide }); setMatch(r.data); } catch (e) { fail(e); }
  };

  if (!match) return <div className="min-h-screen bg-[#0a1628] flex items-center justify-center text-[#6b84a0] text-sm">{t("common.loading")}</div>;

  const sets: any[] = match.sets || [];
  const current = sets.find((s: any) => s.status !== "COMPLETED") || null;
  const played = sets.filter((s: any) => s.status === "COMPLETED");
  const shown = current ?? played[played.length - 1] ?? { score1: 0, score2: 0, letCount: 0, pointsToWin: match.pointsToWin, index: 1 };
  const isDeuceNow = deuce || (shown.score1 >= shown.pointsToWin - 1 && shown.score2 >= shown.pointsToWin - 1);
  const canManage = !!user && match.tournament?.organizerId === user.id;

  return (
    <div className="min-h-screen bg-[#0a1628] p-3 pb-8">
      <div className="max-w-sm mx-auto">
        <button onClick={() => navigate(`/tournament/${id}`)} className="text-[#6b84a0] mb-3 text-sm">&larr; {t("common.back")}</button>

        {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-3">{error}</div>}

        <div className="bg-[#101f36] rounded-lg p-4 mb-3 border border-[#1c3350] text-center">
          <p className="text-[11px] text-[#4d6480] uppercase tracking-wider mb-1">
            {match.tableNumber ? `${t("tournament.table")} ${match.tableNumber}` : t("match.noTable")} &middot; {t("match.raceTo", { n: match.pointsToWin })}
            {match.tournament?.kind === "GAME" && ` · ${t("games.unrated")}`}
          </p>
          {match.status === "NOT_STARTED" && canManage && (
            <div className="flex justify-center gap-2 mt-2">
              {[11, 21].map(pts => (
                <button key={pts} onClick={() => setPointsToWin(pts)}
                  className={`px-4 py-1.5 rounded text-sm font-medium border ${
                    match.pointsToWin === pts ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-transparent text-[#93a8c2] border-[#1c3350]"
                  }`}>
                  {t("match.pts", { n: pts })}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sets won decide the match; the big numbers below are the current set. */}
        <div className="bg-[#101f36] rounded-lg p-4 mb-3 border border-[#1c3350]">
          <div className="text-center text-[11px] text-[#4d6480] uppercase tracking-wider mb-2">
            {t("match.setsScore")}
          </div>
          <div className="flex justify-around items-center mb-3">
            <p className="flex-1 text-center text-3xl font-bold tabular-nums text-[#3b82f6]">{match.setsWon1}</p>
            <p className="text-lg text-[#1c3350] px-1">:</p>
            <p className="flex-1 text-center text-3xl font-bold tabular-nums text-[#ef4444]">{match.setsWon2}</p>
          </div>

          {played.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-3">
              {played.map((s: any) => (
                <span key={s.id} className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                  s.winner === 1 ? "border-[#3b82f6]/40 text-[#3b82f6]" : "border-[#ef4444]/40 text-[#ef4444]"
                }`}>{s.score1}:{s.score2}</span>
              ))}
            </div>
          )}

          <div className="text-center text-[11px] text-[#4d6480] uppercase tracking-wider mb-3 border-t border-[#1c3350] pt-3">
            {match.status === "IN_PROGRESS"
              ? <>
                  {t("match.currentSet", { n: shown.index })}
                  {" · "}
                  {isDeuceNow ? t("match.deuce") : `${t("match.server")}: ${playerName(shown.serverSide === 1 ? match.player1 : match.player2, t("common.none"))}`}
                </>
              : t(`match.${match.status === "NOT_STARTED" ? "notStarted" : match.status === "COMPLETED" ? "completed" : "inProgress"}`)}
            {shown.letCount > 0 && ` · ${t("match.lets")}: ${shown.letCount}`}
          </div>
          <div className="flex justify-around items-center">
            <div className="text-center flex-1">
              <p className="text-base font-semibold text-[#3b82f6] truncate px-1">{playerName(match.player1, t("common.none"))}</p>
              <p className="text-7xl font-bold mt-1 tabular-nums leading-none text-[#3b82f6]">{shown.score1}</p>
            </div>
            <p className="text-2xl text-[#1c3350] px-1">:</p>
            <div className="text-center flex-1">
              <p className="text-base font-semibold text-[#ef4444] truncate px-1">{playerName(match.player2, t("common.none"))}</p>
              <p className="text-7xl font-bold mt-1 tabular-nums leading-none text-[#ef4444]">{shown.score2}</p>
            </div>
          </div>
        </div>

        {match.status === "COMPLETED" ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
            <p className="text-green-400 font-medium text-sm">{t("match.matchCompleted")}</p>
            <p className="text-green-300/70 text-xs mt-1">
              {match.setsWon1 === match.setsWon2
                ? t("match.draw")
                : `${t("match.winner")}: ${playerName(match.setsWon1 > match.setsWon2 ? match.player1 : match.player2, t("common.none"))}`}
            </p>
          </div>
        ) : !canManage ? (
          <p className="text-center py-3 text-sm text-[#6b84a0] bg-[#101f36] rounded-lg border border-[#1c3350]">
            {t("match.onlyManager")}
          </p>
        ) : (
          <div className="space-y-2">
            {match.status === "NOT_STARTED" ? (
              <button onClick={startMatch} className="w-full bg-[#ccff00] text-[#0a1628] py-4 rounded-lg text-base font-bold active:scale-[0.98] transition-transform">
                {t("match.start")}
              </button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => score(1)} className="bg-[#3b82f6] text-white py-6 rounded-lg text-lg font-bold active:scale-[0.97] transition-transform">
                    {playerName(match.player1, "P1")} +1
                  </button>
                  <button onClick={() => score(2)} className="bg-[#ef4444] text-white py-6 rounded-lg text-lg font-bold active:scale-[0.97] transition-transform">
                    {playerName(match.player2, "P2")} +1
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={undo} className="bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm border border-[#1c3350]">{t("match.undo")}</button>
                  <button onClick={recordLet} className="bg-yellow-500/10 text-yellow-400 py-2.5 rounded-lg text-sm border border-yellow-500/20">{t("match.let")}</button>
                  <button onClick={endMatch} className="bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm border border-[#1c3350]">{t("match.end")}</button>
                </div>
                <p className="text-center text-[11px] text-[#4d6480]">{t("match.endHint")}</p>
              </>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => forfeit(1)} className="text-red-400 py-2 rounded-lg text-xs border border-red-500/20 bg-red-500/5">
                {playerName(match.player1, "P1")} {t("match.noShow")}
              </button>
              <button onClick={() => forfeit(2)} className="text-red-400 py-2 rounded-lg text-xs border border-red-500/20 bg-red-500/5">
                {playerName(match.player2, "P2")} {t("match.noShow")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
