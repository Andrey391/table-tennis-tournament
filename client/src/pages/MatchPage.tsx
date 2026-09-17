import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
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
  const [lastSet, setLastSet] = useState<{ index: number; score: string } | null>(null);
  const [confirming, setConfirming] = useState<null | "end" | "forfeit1" | "forfeit2">(null);
  // The board is polled every 2s while the judge is tapping points into it. A poll
  // that overlaps a write comes back without that point and would visibly roll the
  // score back — and a judge who sees their tap undone taps again. So: no polling
  // while a write is in flight, and a response is thrown away if any write started
  // or finished while it was on the wire.
  const pendingWrites = useRef(0);
  const writeGeneration = useRef(0);

  // Wraps every mutation so the poll knows one is happening.
  const write = useCallback(async (fn: () => Promise<void>) => {
    pendingWrites.current++;
    try { await fn(); }
    finally { writeGeneration.current++; pendingWrites.current--; }
  }, []);

  const fetchMatch = useCallback(async () => {
    if (!matchId || pendingWrites.current > 0) return;
    const seen = writeGeneration.current;
    try {
      const r = await apiService.matches.getById(matchId);
      if (pendingWrites.current > 0 || writeGeneration.current !== seen) return;
      setMatch(r.data);
    } catch (e) { console.error(e); }
  }, [matchId]);

  useEffect(() => { fetchMatch(); }, [fetchMatch]);
  useEffect(() => {
    const i = setInterval(fetchMatch, 2000);
    return () => clearInterval(i);
  }, [fetchMatch]);

  const fail = (e: any) => setError(e.response?.data?.error || t("common.failed"));

  const setPointsToWin = (pointsToWin: number) => write(async () => {
    try { const r = await apiService.matches.updateSettings(matchId!, { pointsToWin }); setMatch(r.data); } catch (e) { fail(e); }
  });
  const setSetsToWin = (setsToWin: number) => write(async () => {
    try { const r = await apiService.matches.updateSettings(matchId!, { setsToWin }); setMatch(r.data); } catch (e) { fail(e); }
  });
  const startMatch = () => write(async () => {
    try { const r = await apiService.matches.start(matchId!); setMatch(r.data); } catch (e) { fail(e); }
  });
  const score = async (side: 1 | 2) => {
    if (busy) return;
    setBusy(true);
    await write(async () => {
      try {
        const r = await apiService.matches.score(matchId!, { side });
        setMatch(r.data.match);
        setDeuce(r.data.deuce);
        // A won set is credited and the next one opens immediately, so the big
        // numbers jump back to 0:0. Say which set was just taken, otherwise the
        // judge sees the score disappear and taps again.
        if (r.data.matchOver) setLastSet(null);
      else if (r.data.setWinner) {
          const done = (r.data.match.sets || []).filter((st: any) => st.status === "COMPLETED");
          const finished = done[done.length - 1];
          if (finished) setLastSet({ index: finished.index, score: `${finished.score1}:${finished.score2}` });
        }
      } catch (e) { fail(e); }
    });
    setBusy(false);
  };
  const undo = () => write(async () => {
    setLastSet(null);
    try { const r = await apiService.matches.undo(matchId!); setMatch(r.data.match); } catch (e) { fail(e); }
  });
  const recordLet = () => write(async () => {
    try { const r = await apiService.matches.recordLet(matchId!); setMatch(r.data.match); } catch (e) { fail(e); }
  });
  const endMatch = () => write(async () => {
    try { await apiService.matches.end(matchId!); navigate(`/tournament/${id}`); } catch (e) { fail(e); setConfirming(null); }
  });
  const forfeit = (loserSide: 1 | 2) => write(async () => {
    setConfirming(null);
    try { const r = await apiService.matches.forfeit(matchId!, { loserSide }); setMatch(r.data); } catch (e) { fail(e); }
  });

  if (!match) return <div className="min-h-screen bg-[#0a1628] flex items-center justify-center text-[#6b84a0] text-sm">{t("common.loading")}</div>;

  const sets: any[] = match.sets || [];
  const current = sets.find((s: any) => s.status !== "COMPLETED") || null;
  const played = sets.filter((s: any) => s.status === "COMPLETED");
  const shown = current ?? played[played.length - 1] ?? { score1: 0, score2: 0, letCount: 0, pointsToWin: match.pointsToWin, index: 1 };
  const isDeuceNow = deuce || (shown.score1 >= shown.pointsToWin - 1 && shown.score2 >= shown.pointsToWin - 1);
  const canManage = !!user && match.tournament?.organizerId === user.id;

  // Players change ends after every set. The colours stay with the player (blue is
  // always player 1) but the columns follow the table, so what the judge sees on
  // screen matches what they see in front of them instead of mirroring it.
  const leftIsP1 = shown.index % 2 === 1;
  const sides = [
    { n: 1 as const, player: match.player1, score: shown.score1, color: "#3b82f6", fallback: "P1" },
    { n: 2 as const, player: match.player2, score: shown.score2, color: "#ef4444", fallback: "P2" },
  ];
  const ordered = leftIsP1 ? sides : [sides[1], sides[0]];

  // A match normally closes itself the moment someone reaches `setsToWin`. Two
  // cases still need a prompt: a match started before that existed and left
  // hanging (its target is already met, yet it is open), and one the judge chose
  // to keep playing past a decisive lead. Neither nags during a normal best-of-3.
  const setLead = Math.abs(match.setsWon1 - match.setsWon2);
  const betweenSets = shown.score1 === 0 && shown.score2 === 0;
  const targetReached = Math.max(match.setsWon1, match.setsWon2) >= (match.setsToWin ?? 1);
  const suggestEnd = canManage && match.status === "IN_PROGRESS" && betweenSets && (targetReached || setLead >= 2);

  return (
    <div className="min-h-screen bg-[#0a1628] p-3 pb-8">
      <div className="max-w-sm mx-auto">
        <button onClick={() => navigate(`/tournament/${id}`)} className="text-[#6b84a0] mb-3 text-sm">&larr; {t("common.back")}</button>

        {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-3">{error}</div>}

        <div className="bg-[#101f36] rounded-lg p-4 mb-3 border border-[#1c3350] text-center">
          <p className="text-[11px] text-[#4d6480] uppercase tracking-wider mb-1">
            {match.tableNumber ? `${t("tournament.table")} ${match.tableNumber}` : t("match.noTable")} &middot; {t("match.raceTo", { n: match.pointsToWin })}
            {" · "}
            {match.setsToWin > 1 ? t("match.bestOf", { n: match.setsToWin }) : t("match.oneSet")}
            {match.tournament?.kind === "GAME" && ` · ${t("games.unrated")}`}
          </p>
          {match.status === "NOT_STARTED" && canManage && (
            <>
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
              <p className="text-[11px] text-[#4d6480] uppercase tracking-wider mt-3">{t("match.setsToWin")}</p>
              <div className="flex justify-center gap-2 mt-1.5">
                {[1, 2, 3].map(n => (
                  <button key={n} onClick={() => setSetsToWin(n)}
                    className={`px-4 py-1.5 rounded text-sm font-medium border ${
                      match.setsToWin === n ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-transparent text-[#93a8c2] border-[#1c3350]"
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#4d6480] mt-2 normal-case">{t("match.setsToWinHint")}</p>
            </>
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
              <p className="text-base font-semibold truncate px-1" style={{ color: ordered[0].color }}>{playerName(ordered[0].player, t("common.none"))}</p>
              <p className="text-7xl font-bold mt-1 tabular-nums leading-none" style={{ color: ordered[0].color }}>{ordered[0].score}</p>
            </div>
            <p className="text-2xl text-[#1c3350] px-1">:</p>
            <div className="text-center flex-1">
              <p className="text-base font-semibold truncate px-1" style={{ color: ordered[1].color }}>{playerName(ordered[1].player, t("common.none"))}</p>
              <p className="text-7xl font-bold mt-1 tabular-nums leading-none" style={{ color: ordered[1].color }}>{ordered[1].score}</p>
            </div>
          </div>
          {!leftIsP1 && match.status === "IN_PROGRESS" && (
            <p className="text-center text-[11px] text-[#4d6480] uppercase tracking-wider mt-2">{t("match.sidesSwapped")}</p>
          )}
        </div>

        {suggestEnd && (
          <div className="flex items-center gap-2 bg-[#101f36] border border-[#ccff00]/30 rounded-lg p-2.5 mb-3">
            <span className="text-sm text-[#93a8c2] flex-1">{t("match.canEnd", { score: `${match.setsWon1}:${match.setsWon2}` })}</span>
            <button onClick={() => setConfirming("end")} className="bg-[#ccff00] text-[#0a1628] px-3 py-1.5 rounded text-sm font-bold shrink-0">
              {t("match.endNow")}
            </button>
          </div>
        )}

        {lastSet && match.status === "IN_PROGRESS" && (
          <button onClick={() => setLastSet(null)}
            className="w-full bg-[#ccff00]/10 border border-[#ccff00]/30 rounded-lg p-2.5 mb-3 text-center text-[#ccff00] text-sm font-medium">
            {t("match.setWon", { n: lastSet.index, score: lastSet.score })}
          </button>
        )}

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
                  {ordered.map(sd => (
                    <button key={sd.n} onClick={() => score(sd.n)} style={{ backgroundColor: sd.color }}
                      className="text-white py-6 rounded-lg text-lg font-bold active:scale-[0.97] transition-transform">
                      {playerName(sd.player, sd.fallback)} +1
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={undo} className="bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm border border-[#1c3350]">{t("match.undo")}</button>
                  <button onClick={recordLet} className="bg-yellow-500/10 text-yellow-400 py-2.5 rounded-lg text-sm border border-yellow-500/20">{t("match.let")}</button>
                  <button onClick={() => setConfirming("end")} className="bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm border border-[#1c3350]">{t("match.end")}</button>
                </div>
                <p className="text-center text-[11px] text-[#4d6480]">{t("match.endHint")}</p>
              </>
            )}
            {/* Ending the match and a walkover both settle the result and move
                ratings, and neither can be undone — so they ask first instead of
                firing on a mis-tap between rallies. */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {ordered.map(sd => (
                <button key={sd.n} onClick={() => setConfirming(sd.n === 1 ? "forfeit1" : "forfeit2")}
                  className="text-red-400 py-2 rounded-lg text-xs border border-red-500/20 bg-red-500/5">
                  {playerName(sd.player, sd.fallback)} {t("match.noShow")}
                </button>
              ))}
            </div>

            {confirming && (
              <div className="bg-[#101f36] border border-red-500/30 rounded-lg p-3 space-y-2">
                <p className="text-sm text-[#93a8c2] text-center">
                  {confirming === "end"
                    ? t("match.endConfirm")
                    : t("match.forfeitConfirm", { name: playerName(confirming === "forfeit1" ? match.player1 : match.player2, "P" + confirming.slice(-1)) })}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(null)} className="flex-1 bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm font-medium">{t("common.cancel")}</button>
                  <button onClick={() => (confirming === "end" ? endMatch() : forfeit(confirming === "forfeit1" ? 1 : 2))}
                    className="flex-1 bg-red-500 text-white py-2.5 rounded-lg text-sm font-bold">{t("common.confirm")}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
