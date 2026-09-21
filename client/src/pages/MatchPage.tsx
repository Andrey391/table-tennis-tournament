import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { HeadToHead } from "../components/PlayerStats";
import { useT } from "../i18n";
import { playerName } from "../lib/format";
import SetsToWinPicker from "../components/SetsToWinPicker";
import { tourDone } from "../lib/tour";

// The unit of scoring is the set ("партия"), not the point. The judge marks who
// took each set; nothing tracks the rally-by-rally score, so there is no deuce,
// no service rotation and no target score to reach. A match runs for as many sets
// as the pair choose to play, and the judge settles it with "Завершить".
export default function MatchPage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
  const [match, setMatch] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<null | "end" | "forfeit1" | "forfeit2" | "reopen">(null);
  const [showMore, setShowMore] = useState(false);
  const [setScore, setSetScore] = useState({ a: "", b: "" });
  // The board is polled every 2s while the judge is tapping sets into it. A poll
  // that overlaps a write comes back without that set and would visibly roll the
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

  const setSetsToWin = (setsToWin: number) => write(async () => {
    try { const r = await apiService.matches.updateSettings(matchId!, { setsToWin }); setMatch(r.data); } catch (e) { fail(e); }
  });
  const startMatch = () => write(async () => {
    try { const r = await apiService.matches.start(matchId!); setMatch(r.data); tourDone("start"); } catch (e) { fail(e); }
  });
  // The rally score is optional: a set is credited whether or not it was typed in.
  const addSet = async (side: 1 | 2) => {
    if (busy) return;
    const typed = setScore.a !== "" && setScore.b !== "";
    setBusy(true); setError("");
    await write(async () => {
      try {
        const r = await apiService.matches.score(matchId!, typed ? { side, score1: +setScore.a, score2: +setScore.b } : { side });
        setMatch(r.data.match);
        setSetScore({ a: "", b: "" });
        tourDone("score");
      } catch (e) { fail(e); }
    });
    setBusy(false);
  };
  const undo = () => write(async () => {
    setConfirming(null);
    try { const r = await apiService.matches.undo(matchId!); setMatch(r.data.match); } catch (e) { fail(e); }
  });
  const endMatch = () => write(async () => {
    try { await apiService.matches.end(matchId!); tourDone("end"); navigate(`/tournament/${id}`); } catch (e) { fail(e); setConfirming(null); }
  });
  // Same exit as ending a match: the result is settled, back to the round.
  const forfeit = (loserSide: 1 | 2) => write(async () => {
    setConfirming(null);
    try { await apiService.matches.forfeit(matchId!, { loserSide }); navigate(`/tournament/${id}`); } catch (e) { fail(e); }
  });

  if (!match) return <div className="min-h-screen bg-[#0a1628] flex items-center justify-center text-[#6b84a0] text-sm">{t("common.loading")}</div>;

  const played: any[] = (match.sets || []).filter((s: any) => s.status === "COMPLETED").sort((a: any, b: any) => a.index - b.index);
  const isManager = !!user && match.tournament?.organizerId === user.id;
  // The two players at the table record their own sets, the way a paper score
  // sheet works at a club night; the manager can do everything they can and more.
  const canScore = !!user && (isManager || match.player1Id === user.id || match.player2Id === user.id);
  const target = match.setsToWin ?? 3;
  const targetReached = Math.max(match.setsWon1, match.setsWon2) >= target;
  const level = match.setsWon1 === match.setsWon2;
  const suggestEnd = canScore && match.status === "IN_PROGRESS" && targetReached && !level;
  const endBlockedReason = played.length === 0 ? t("match.noSetsYet") : level ? t("match.drawBlocked") : "";

  const sides = [
    { n: 1 as const, player: match.player1, won: match.setsWon1, color: "#3b82f6", fallback: "P1" },
    { n: 2 as const, player: match.player2, won: match.setsWon2, color: "#ef4444", fallback: "P2" },
  ];
  const scoreField = "w-16 px-2 py-2 bg-[#0a1628] rounded border border-[#1c3350] text-center text-base focus:border-[#ccff00] focus:outline-none";

  return (
    <div className="min-h-screen bg-[#0a1628] p-3 pb-8">
      <div className="max-w-sm mx-auto">
        <button onClick={() => navigate(`/tournament/${id}`)} className="text-[#6b84a0] mb-3 text-sm">&larr; {t("common.back")}</button>

        {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-3">{error}</div>}

        <div className="bg-[#101f36] rounded-lg p-4 mb-3 border border-[#1c3350] text-center">
          <p className="text-[11px] text-[#4d6480] uppercase tracking-wider mb-1">
            {match.tableNumber ? `${t("tournament.table")} ${match.tableNumber}` : t("match.noTable")}
            {" · "}
            {t("match.upTo", { n: target })}
            {match.tournament?.kind === "GAME" && ` · ${t("games.unrated")}`}
          </p>
          {match.status === "NOT_STARTED" && match.player1Id && match.player2Id && <HeadToHead playerId={match.player1Id} otherId={match.player2Id} compact />}
          {match.status === "NOT_STARTED" && canScore && (
            <>
              <p className="text-[11px] text-[#4d6480] uppercase tracking-wider mt-3 mb-1.5">{t("match.setsToWin")}</p>
              <SetsToWinPicker value={target} onChange={setSetsToWin} />
              <p className="text-[11px] text-[#4d6480] mt-2 normal-case">{t("match.setsToWinHint")}</p>
            </>
          )}
        </div>

        {/* The match is its set tally; the chips below say who took each one. */}
        <div className="bg-[#101f36] rounded-lg p-4 mb-3 border border-[#1c3350]">
          <div className="text-center text-[11px] text-[#4d6480] uppercase tracking-wider mb-3">
            {match.status === "IN_PROGRESS"
              ? t("match.setsScore")
              : t(`match.${match.status === "NOT_STARTED" ? "notStarted" : match.status === "COMPLETED" ? "completed" : "inProgress"}`)}
          </div>
          <div className="flex justify-around items-center">
            {sides.map((sd, i) => (
              <div key={sd.n} className="contents">
                <div className="text-center flex-1">
                  <p className="text-base font-semibold truncate px-1" style={{ color: sd.color }}>{playerName(sd.player, t("common.none"))}</p>
                  <p className="text-7xl font-bold mt-1 tabular-nums leading-none" style={{ color: sd.color }}>{sd.won}</p>
                </div>
                {i === 0 && <p className="text-2xl text-[#1c3350] px-1">:</p>}
              </div>
            ))}
          </div>

          {played.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-4 pt-3 border-t border-[#1c3350]">
              {played.map((s: any) => (
                <span key={s.id} className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                  s.winner === 1 ? "border-[#3b82f6]/40 text-[#3b82f6]" : "border-[#ef4444]/40 text-[#ef4444]"
                }`}>
                  {t("match.setN", { n: s.index })} &middot; {s.score1 || s.score2 ? `${s.score1}:${s.score2}` : playerName(s.winner === 1 ? match.player1 : match.player2, "—")}
                </span>
              ))}
            </div>
          )}
        </div>

        {match.status === "COMPLETED" ? (
          <div className="space-y-2">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
              <p className="text-green-400 font-medium text-sm">{t("match.matchCompleted")}</p>
              <p className="text-green-300/70 text-xs mt-1">
                {level
                  ? t("match.draw")
                  : `${t("match.winner")}: ${playerName(match.setsWon1 > match.setsWon2 ? match.player1 : match.player2, t("common.none"))}`}
              </p>
            </div>
            {/* A result entered by mistake has to be fixable; reopening is the
                manager's call and hands the rating change back. */}
            {isManager && played.length > 0 && (confirming === "reopen" ? (
              <div className="bg-[#101f36] border border-red-500/30 rounded-lg p-3 space-y-2">
                <p className="text-sm text-[#93a8c2] text-center">{t("match.reopenHint")}</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(null)} className="flex-1 bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm font-medium">{t("common.cancel")}</button>
                  <button onClick={undo} className="flex-1 bg-red-500 text-white py-2.5 rounded-lg text-sm font-bold">{t("common.confirm")}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirming("reopen")} className="w-full bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm border border-[#1c3350]">{t("match.reopen")}</button>
            ))}
          </div>
        ) : !canScore ? (
          <p className="text-center py-3 text-sm text-[#6b84a0] bg-[#101f36] rounded-lg border border-[#1c3350]">
            {t("match.onlyManager")}
          </p>
        ) : (
          <div className="space-y-2">
            {match.status === "NOT_STARTED" ? (
              <button onClick={startMatch} data-tour="start" className="w-full bg-[#ccff00] text-[#0a1628] py-4 rounded-lg text-base font-bold active:scale-[0.98] transition-transform">
                {t("match.start")}
              </button>
            ) : (
              <>
                <div className="bg-[#101f36] rounded-lg border border-[#1c3350] p-3 text-center">
                  <p className="text-[11px] text-[#4d6480] uppercase tracking-wider mb-2">{t("match.setScore")}</p>
                  <div className="flex items-center justify-center gap-2">
                    <input type="number" inputMode="numeric" min={0} max={99} value={setScore.a} onChange={e => setSetScore({ ...setScore, a: e.target.value })}
                      className={scoreField} style={{ color: "#3b82f6" }} aria-label={playerName(match.player1, "P1")} />
                    <span className="text-[#4d6480]">:</span>
                    <input type="number" inputMode="numeric" min={0} max={99} value={setScore.b} onChange={e => setSetScore({ ...setScore, b: e.target.value })}
                      className={scoreField} style={{ color: "#ef4444" }} aria-label={playerName(match.player2, "P2")} />
                  </div>
                  <p className="text-[11px] text-[#4d6480] mt-2">{t("match.setScoreHint")}</p>
                </div>

                <div className="grid grid-cols-2 gap-2" data-tour="score">
                  {sides.map(sd => (
                    <button key={sd.n} onClick={() => addSet(sd.n)} disabled={busy} style={{ backgroundColor: sd.color }}
                      className="text-white py-6 rounded-lg text-base font-bold active:scale-[0.97] transition-transform disabled:opacity-60">
                      {playerName(sd.player, sd.fallback)}
                      <span className="block text-xs font-medium opacity-90 mt-0.5">{t("match.tookSet")}</span>
                    </button>
                  ))}
                </div>

                {/* Nothing finishes the match on its own, and only COMPLETED matches
                    reach the standings, the stats and the rating — so ending it is
                    the primary action here. Table tennis has no draws, so a level
                    tally cannot be ended: the pair plays a deciding set. */}
                <button onClick={() => setConfirming("end")} disabled={!!endBlockedReason} data-tour="finish"
                  className={`w-full py-3.5 rounded-lg text-base font-bold active:scale-[0.98] transition-transform disabled:opacity-40 ${
                    suggestEnd ? "bg-[#ccff00] text-[#0a1628]" : "bg-[#1c3350] text-[#93a8c2] border border-[#1c3350]"
                  }`}>
                  {t("match.end")}
                  {suggestEnd && <span className="block text-[11px] font-medium opacity-80">{t("match.canEnd", { score: `${match.setsWon1}:${match.setsWon2}` })}</span>}
                </button>
                {endBlockedReason && <p className="text-center text-[11px] text-yellow-400">{endBlockedReason}</p>}

                <button onClick={undo} disabled={played.length === 0}
                  className="w-full bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm border border-[#1c3350] disabled:opacity-40">
                  {t("match.undoSet")}
                </button>
                <p className="text-center text-[11px] text-[#4d6480]">{t("match.endHint")}</p>
              </>
            )}

            {/* Walkovers are the manager's, and kept out of thumb's reach of the
                scoring buttons behind "More". */}
            {isManager && (
              <div className="pt-1">
                <button onClick={() => setShowMore(v => !v)} className="w-full text-[#6b84a0] py-2 text-xs">
                  {t("match.more")} {showMore ? "▴" : "▾"}
                </button>
                {showMore && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {sides.map(sd => (
                        <button key={sd.n} onClick={() => setConfirming(sd.n === 1 ? "forfeit1" : "forfeit2")}
                          className="text-red-400 py-2 rounded-lg text-xs border border-red-500/20 bg-red-500/5">
                          {playerName(sd.player, sd.fallback)} {t("match.noShow")}
                        </button>
                      ))}
                    </div>
                    <p className="text-center text-[11px] text-[#4d6480] mt-1.5">{t("match.walkoverUnrated")}</p>
                  </>
                )}
              </div>
            )}

            {confirming && confirming !== "reopen" && (
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
