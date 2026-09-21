import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import ScopeToggle from "../components/ScopeToggle";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import EventCard from "../components/EventCard";
import SetsToWinPicker from "../components/SetsToWinPicker";
import { useT } from "../i18n";
import { useAuth } from "../context/AuthContext";
import { playerName } from "../lib/format";
import { btnGhost, btnPrimary, card, errorBox, field, fieldLabel, pageTitle } from "../lib/ui";

// A game is a tournament with kind=GAME: same roster, rounds and pairing, no Elo.
// This screen is the game-shaped view of the same feed; opening one lands on the
// usual tournament page.
export default function GamesPage() {
  const { t } = useT();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const isGuest = !token;
  const [games, setGames] = useState<any[] | null>(null);
  const [clubs, setClubs] = useState<any[]>([]);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", clubId: "", startTime: "", tablesCount: 1, setsToWin: 3 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One-step result for a game already played: opponent + set tally.
  const [showQuick, setShowQuick] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);
  const [oppSearch, setOppSearch] = useState("");
  const [quick, setQuick] = useState({ opponentId: "", setsWon1: 3, setsWon2: 0 });

  const fetchGames = () => (
    // "Mine" needs an account; a guest only ever sees the open feed.
    scope === "mine" && !isGuest
      ? apiService.tournaments.getMine({ kind: "GAME" })
      : apiService.tournaments.getAll({ kind: "GAME" })
  );
  // A refresh after creating a game keeps the list on screen; only a change of scope
  // goes back to the loader, so the old scope's rows are never shown as the new one's.
  const load = () => { fetchGames().then(r => setGames(r.data)).catch(console.error); };
  useEffect(() => {
    let stale = false;
    setGames(null);
    fetchGames().then(r => { if (!stale) setGames(r.data); }).catch(e => { console.error(e); if (!stale) setGames([]); });
    return () => { stale = true; };
  }, [scope, isGuest]);
  useEffect(() => { apiService.clubs.getAll().then(r => setClubs(r.data)).catch(console.error); }, []);
  // GET /players is behind auth, and only the quick-result picker needs it.
  useEffect(() => {
    if (!showQuick || isGuest || players.length) return;
    apiService.players.getAll().then(r => setPlayers(r.data)).catch(console.error);
  }, [showQuick, isGuest]);

  const opponent = players.find(p => p.id === quick.opponentId);
  const oppCandidates = players.filter(p => p.id !== user?.id && `${p.firstName} ${p.lastName}`.toLowerCase().includes(oppSearch.toLowerCase())).slice(0, 8);
  const quickLevel = quick.setsWon1 === quick.setsWon2;

  const saveQuick = async () => {
    if (!quick.opponentId || quickLevel) return;
    setBusy(true); setError("");
    try {
      const r = await apiService.tournaments.quickGame(quick);
      navigate(`/tournament/${r.data.id}`);
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
  };
  const stepper = (key: "setsWon1" | "setsWon2", color: string) => (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={() => setQuick({ ...quick, [key]: Math.min(20, quick[key] + 1) })} className="w-12 h-9 rounded bg-[#1c3350] text-[#93a8c2]">+</button>
      <span className="text-4xl font-bold tabular-nums" style={{ color }}>{quick[key]}</span>
      <button type="button" onClick={() => setQuick({ ...quick, [key]: Math.max(0, quick[key] - 1) })} className="w-12 h-9 rounded bg-[#1c3350] text-[#93a8c2]">&minus;</button>
    </div>
  );

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setBusy(true); setError("");
    try {
      await apiService.tournaments.create({
        kind: "GAME",
        name: form.name,
        clubId: form.clubId || undefined,
        startTime: form.startTime ? new Date(form.startTime).toISOString() : undefined,
        tablesCount: form.tablesCount,
        setsToWin: form.setsToWin,
      });
      setForm({ name: "", clubId: "", startTime: "", tablesCount: 1, setsToWin: 3 });
      setShowCreate(false);
      load();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
  };


  return (
    <Layout>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h1 className={pageTitle}>{t("games.title")}</h1>
        {isGuest ? (
          <Link to="/login" className="text-sm text-[#ccff00] font-bold shrink-0 mt-1">{t("auth.signIn")}</Link>
        ) : (
          <button onClick={() => { setShowCreate(v => !v); setShowQuick(false); }} className="text-sm text-[#ccff00] font-bold shrink-0 mt-1">
            {showCreate ? t("common.cancel") : `+ ${t("games.new")}`}
          </button>
        )}
      </div>
      <p className="text-xs text-[#6b84a0] mb-4">{t("games.subtitle")}</p>

      {error && <div className={`${errorBox} mb-4`}>{error}</div>}

      {/* Two people who just played do not want an event with rounds; they want to
          write down "3:1". This is that, in one screen. */}
      {!isGuest && !showCreate && (
        <button onClick={() => setShowQuick(v => !v)}
          className={`${showQuick ? btnGhost : btnPrimary} w-full mb-4`}>
          {showQuick ? t("common.cancel") : t("games.quick")}
        </button>
      )}
      {showQuick && !isGuest && !showCreate && (
        <div className={`${card} p-4 space-y-3 mb-4`}>
          <p className="text-xs text-[#6b84a0]">{t("games.quickHint")}</p>
          {opponent ? (
            <div className="flex justify-between items-center bg-[#0a1628] rounded-lg border border-[#1c3350] px-3 py-2.5">
              <span className="text-sm truncate">{opponent.firstName} {opponent.lastName}</span>
              <button type="button" onClick={() => setQuick({ ...quick, opponentId: "" })} className="text-xs text-[#ccff00] shrink-0">{t("common.remove")}</button>
            </div>
          ) : (
            <>
              <input type="text" placeholder={t("games.searchOpponent")} value={oppSearch} onChange={e => setOppSearch(e.target.value)} className={field} />
              <div className="divide-y divide-[#1c3350] max-h-56 overflow-y-auto">
                {oppCandidates.map(p => (
                  <button key={p.id} type="button" onClick={() => { setQuick({ ...quick, opponentId: p.id }); setOppSearch(""); }}
                    className="w-full flex justify-between items-center py-2.5 text-left">
                    <span className="text-sm truncate">{p.firstName} {p.lastName}</span>
                    <span className="text-xs font-mono text-[#3b82f6] shrink-0">{p.rating}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center justify-around pt-1">
            <div className="text-center">
              <p className="text-xs text-[#6b84a0] mb-1 truncate max-w-[7rem]">{t("games.me")}</p>
              {stepper("setsWon1", "#3b82f6")}
            </div>
            <span className="text-2xl text-[#1c3350]">:</span>
            <div className="text-center">
              <p className="text-xs text-[#6b84a0] mb-1 truncate max-w-[7rem]">{opponent ? playerName(opponent) : t("games.opponent")}</p>
              {stepper("setsWon2", "#ef4444")}
            </div>
          </div>
          {quickLevel && <p className="text-center text-xs text-yellow-400">{t("match.drawBlocked")}</p>}
          <button type="button" onClick={saveQuick} disabled={busy || !quick.opponentId || quickLevel}
            className={`${btnPrimary} w-full`}>
            {t("games.save")}
          </button>
        </div>
      )}

      {showCreate && !isGuest && (
        <form onSubmit={create} className={`${card} p-4 space-y-3 mb-4`}>
          <input type="text" placeholder={t("games.namePlaceholder")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={field} required />
          <select value={form.clubId} onChange={e => setForm({ ...form, clubId: e.target.value })} className={field}>
            <option value="">{t("create.noClub")}</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
          </select>
          <input type="datetime-local" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} className={field} />
          <div>
            <label className={fieldLabel}>{t("create.tables")}</label>
            <input type="number" min={1} value={form.tablesCount} onChange={e => setForm({ ...form, tablesCount: +e.target.value })} className={field} />
          </div>
          <div>
            <label className={fieldLabel}>{t("create.setsToWin")}</label>
            <SetsToWinPicker value={form.setsToWin} onChange={n => setForm({ ...form, setsToWin: n })} />
          </div>
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? t("games.creating") : t("games.create")}
          </button>
        </form>
      )}

      <ScopeToggle scope={scope} onChange={setScope} labels={[t("games.all"), t("games.mine")]} hidden={isGuest} />

      {games === null ? (
        <Loader />
      ) : games.length === 0 ? (
        <EmptyState text={t("games.empty")} />
      ) : (
        <div className="space-y-2">
          {games.map(g => <EventCard key={g.id} tr={g} />)}
        </div>
      )}
    </Layout>
  );
}
