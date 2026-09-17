import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { useT } from "../i18n";
import { formatEventDay, formatTimeRange, playerName, matchScoreLine, setScores } from "../lib/format";

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useT();
  const [tournament, setTournament] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [clubs, setClubs] = useState<any[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    if (!id) return;
    apiService.tournaments.getById(id).then(r => setTournament(r.data)).catch(console.error);
    apiService.tournaments.standings(id).then(r => setStandings(r.data)).catch(console.error);
  };

  useEffect(load, [id]);
  // Participants keep this page open during the event and expect it to move on its
  // own when the manager pairs a new round; without a poll it froze at whatever
  // was on screen when they opened it.
  useEffect(() => {
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [id]);
  useEffect(() => { apiService.players.getAll().then(r => setAllPlayers(r.data)).catch(console.error); }, []);
  useEffect(() => { apiService.clubs.getAll().then(r => setClubs(r.data)).catch(console.error); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!tournament) return <Layout><div className="text-center py-20 text-[#6b84a0] text-sm">{t("common.loading")}</div></Layout>;

  const isDraft = tournament.status === "DRAFT";
  const isManager = !!user && tournament.organizerId === user.id;
  const myEntry = tournament.players.find((p: any) => p.userId === user?.id);
  const approved = tournament.players.filter((p: any) => p.status === "REGISTERED");
  const pending = tournament.players.filter((p: any) => p.status === "PENDING");
  const withdrawn = tournament.players.filter((p: any) => p.status === "WITHDRAWN");
  const rosterIds = new Set(approved.map((p: any) => p.userId).concat(pending.map((p: any) => p.userId)));
  const candidates = allPlayers.filter(p => !rosterIds.has(p.id) && `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));

  const isFull = tournament.maxPlayers != null && approved.length >= tournament.maxPlayers;
  const hasRatingGate = tournament.minRating != null || tournament.maxRating != null;
  const ratingBlocked = hasRatingGate && !!user &&
    ((tournament.minRating != null && user.rating < tournament.minRating) || (tournament.maxRating != null && user.rating > tournament.maxRating));

  const addSelected = async () => {
    if (!id || selected.size === 0) return;
    setBusy(true); setError("");
    try {
      await apiService.tournaments.addPlayers(id, { userIds: Array.from(selected) });
      setSelected(new Set()); setSearch(""); setShowAdd(false);
      load();
    } catch (e: any) { setError(e.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
  };

  // Putting a withdrawn player back on the roster is the same "add" call.
  const addSelectedOne = async (userId: string) => {
    if (!id) return;
    setError("");
    try { await apiService.tournaments.addPlayers(id, { userIds: [userId] }); load(); }
    catch (e: any) { setError(e.response?.data?.error || t("common.failed")); }
  };

  const join = async () => {
    if (!id) return;
    setBusy(true); setError("");
    try { await apiService.tournaments.join(id); load(); }
    catch (e: any) { setError(e.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
  };

  const approvePlayer = async (userId: string) => {
    if (!id) return;
    try { await apiService.tournaments.approvePlayer(id, userId); load(); }
    catch (e: any) { setError(e.response?.data?.error || t("common.failed")); }
  };

  const removePlayer = async (userId: string) => {
    if (!id) return;
    try { await apiService.tournaments.removePlayer(id, userId); load(); }
    catch (e: any) { setError(e.response?.data?.error || t("common.failed")); }
  };

  const pair = async () => {
    if (!id) return;
    setBusy(true); setError("");
    try { await apiService.tournaments.pair(id); load(); }
    catch (e: any) { setError(e.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
  };

  // A datetime-local input wants "YYYY-MM-DDTHH:MM" in local time, not an ISO
  // string in UTC — feeding it the latter silently shifts the shown time.
  const toLocalInput = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEdit = () => setEdit({
    name: tournament.name,
    description: tournament.description || "",
    clubId: tournament.clubId || "",
    startTime: toLocalInput(tournament.startTime),
    endTime: toLocalInput(tournament.endTime),
    tablesCount: tournament.tablesCount,
    maxPlayers: tournament.maxPlayers ?? "",
    minRating: tournament.minRating ?? "",
    maxRating: tournament.maxRating ?? "",
    pointsToWin: tournament.pointsToWin ?? 11,
    setsToWin: tournament.setsToWin ?? 1,
    isPublic: tournament.isPublic !== false,
  });

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !edit) return;
    setBusy(true); setError("");
    try {
      await apiService.tournaments.update(id, {
        name: edit.name,
        description: edit.description || null,
        clubId: edit.clubId || null,
        startTime: edit.startTime ? new Date(edit.startTime).toISOString() : null,
        endTime: edit.endTime ? new Date(edit.endTime).toISOString() : null,
        tablesCount: +edit.tablesCount,
        maxPlayers: edit.maxPlayers === "" ? null : +edit.maxPlayers,
        minRating: edit.minRating === "" ? null : +edit.minRating,
        maxRating: edit.maxRating === "" ? null : +edit.maxRating,
        pointsToWin: edit.pointsToWin,
        setsToWin: edit.setsToWin,
        isPublic: edit.isPublic,
      });
      setEdit(null);
      setNotice(t("tournament.saved"));
      load();
    } catch (e: any) { setError(e.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
  };

  // The public page is the thing people actually pass around, so hand over that
  // link rather than the in-app one they would otherwise copy from the address bar.
  const share = async () => {
    const url = `${window.location.origin}/public/tournament/${id}`;
    try {
      if (navigator.share) { await navigator.share({ title: tournament.name, url }); return; }
      await navigator.clipboard.writeText(url);
      setNotice(t("tournament.linkCopied"));
    } catch { /* dismissed share sheet or blocked clipboard — nothing to report */ }
  };

  const removeTournament = async () => {
    if (!id) return;
    setBusy(true); setError("");
    try { await apiService.tournaments.remove(id); navigate("/"); }
    catch (e: any) { setError(e.response?.data?.error || t("common.failed")); setBusy(false); }
  };

  const toggleSelect = (userId: string) => {
    const next = new Set(selected);
    next.has(userId) ? next.delete(userId) : next.add(userId);
    setSelected(next);
  };

  const matches: any[] = tournament.matches || [];
  const currentRound = matches.reduce((max: number, m: any) => Math.max(max, m.round), 0);
  const roundUnresolved = matches.filter((m: any) => m.round === currentRound && m.status !== "COMPLETED").length;
  const canStartNextRound = !isDraft && roundUnresolved === 0;
  const rounds = Array.from(new Set(matches.map((m: any) => m.round))).sort((a, b) => b - a);
  // With an odd headcount one player sits each round out. `/pair` records who, so
  // this is read rather than guessed from "has no match in this round" — that guess
  // also flagged everyone who joined after the round had already been played.
  const byes: any[] = tournament.byes || [];
  const byeOf = (round: number) => byes.find((b: any) => b.round === round) || null;

  return (
    <Layout>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight truncate">{tournament.name}</h1>
        {tournament.kind === "GAME" && <p className="text-xs text-[#6b84a0] mt-0.5">{t("games.unrated")}</p>}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
            tournament.status === "ACTIVE" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
            tournament.status === "COMPLETED" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
            "bg-[#1c3350] text-[#93a8c2] border border-[#1c3350]"
          }`}>
            {isDraft ? t("status.DRAFT") :
              tournament.status === "ACTIVE" ? t("tournament.roundInProgress", { n: currentRound }) :
              t("tournament.roundFinished", { n: currentRound })}
          </span>
          <span className="text-xs text-[#4d6480]">{t("tournament.tables", { n: tournament.tablesCount })}</span>
          {tournament.isPublic === false && (
            <span className="text-xs text-[#6b84a0] border border-[#1c3350] rounded px-1.5 py-0.5">{t("tournament.privateBadge")}</span>
          )}
          {hasRatingGate && (
            <span className="text-xs text-[#ccff00]">{t("profile.rating")} {tournament.minRating ?? 0}&ndash;{tournament.maxRating ?? "∞"}</span>
          )}
        </div>
      </div>

      {notice && <div className="bg-[#ccff00]/10 text-[#ccff00] p-2.5 rounded text-sm border border-[#ccff00]/20 mb-3 text-center">{notice}</div>}

      <div className="bg-[#101f36] rounded-lg border border-[#1c3350] p-4 mb-4 space-y-2">
        {isManager && (
          <div className="flex justify-end -mt-1 -mr-1">
            <button onClick={() => (edit ? setEdit(null) : openEdit())} className="text-xs text-[#ccff00] font-medium px-1">
              {edit ? t("tournament.close") : t("tournament.edit")}
            </button>
          </div>
        )}
        {tournament.startTime && (
          <p className="text-sm text-[#93a8c2]">{formatEventDay(tournament.startTime, lang)} &middot; {formatTimeRange(tournament.startTime, tournament.endTime, lang)}</p>
        )}
        {tournament.club && (
          <div>
            <p className="text-sm">{tournament.club.name} &middot; {tournament.club.city}</p>
            {tournament.club.address && <p className="text-xs text-[#6b84a0]">{tournament.club.address}</p>}
            {tournament.club.phone && <p className="text-xs text-[#6b84a0]">{tournament.club.phone}</p>}
          </div>
        )}
        {tournament.description && <p className="text-sm text-[#93a8c2] whitespace-pre-line">{tournament.description}</p>}
        <p className="text-xs text-[#6b84a0]">
          {approved.length}{tournament.maxPlayers ? `/${tournament.maxPlayers}` : ""} {t("common.players")}
          {tournament.maxPlayers != null && !isFull && ` · ${t("tournament.placesLeft", { n: tournament.maxPlayers - approved.length })}`}
          {isFull && ` · ${t("tournament.full")}`}
        </p>
        <p className="text-xs text-[#4d6480]">{t("tournament.manager")}: {tournament.organizer?.firstName} {tournament.organizer?.lastName}</p>
      </div>

      {isManager && edit && (
        <form onSubmit={saveEdit} className="bg-[#101f36] rounded-lg border border-[#1c3350] p-4 mb-4 space-y-3">
          <input type="text" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder={t("create.name")} className={editField} required />
          <textarea rows={2} value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} placeholder={t("create.description")} className={editField} />
          <select value={edit.clubId} onChange={e => setEdit({ ...edit, clubId: e.target.value })} className={editField}>
            <option value="">{t("create.noClub")}</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="datetime-local" value={edit.startTime} onChange={e => setEdit({ ...edit, startTime: e.target.value })} className={editField} />
            <input type="datetime-local" value={edit.endTime} onChange={e => setEdit({ ...edit, endTime: e.target.value })} className={editField} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min={1} value={edit.tablesCount} onChange={e => setEdit({ ...edit, tablesCount: e.target.value })} placeholder={t("create.tables")} className={editField} />
            <input type="number" min={2} value={edit.maxPlayers} onChange={e => setEdit({ ...edit, maxPlayers: e.target.value })} placeholder={t("create.maxPlayers")} className={editField} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={edit.minRating} onChange={e => setEdit({ ...edit, minRating: e.target.value })} placeholder={t("create.min")} className={editField} />
            <input type="number" value={edit.maxRating} onChange={e => setEdit({ ...edit, maxRating: e.target.value })} placeholder={t("create.max")} className={editField} />
          </div>
          <div>
            <label className="block text-xs text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("create.pointsToWin")}</label>
            <div className="flex gap-2">
              {([11, 21] as const).map(pts => (
                <button key={pts} type="button" onClick={() => setEdit({ ...edit, pointsToWin: pts })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    edit.pointsToWin === pts ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
                  }`}>{t("match.pts", { n: pts })}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("create.setsToWin")}</label>
            <div className="flex gap-2">
              {[1, 2, 3].map(n => (
                <button key={n} type="button" onClick={() => setEdit({ ...edit, setsToWin: n })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    edit.setsToWin === n ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
                  }`}>{n}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#93a8c2]">
            <input type="checkbox" checked={!edit.isPublic} onChange={e => setEdit({ ...edit, isPublic: !e.target.checked })} className="w-4 h-4" />
            {t("tournament.private")}
          </label>
          <button type="submit" disabled={busy} className="w-full bg-[#ccff00] text-[#0a1628] py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
            {busy ? t("common.creating") : t("common.save")}
          </button>
        </form>
      )}

      {/* The chat is how people agree when to meet, so it is there from the start;
          the scoreboards only mean something once a round exists. */}
      <div className="flex gap-2 mb-4">
        {!isDraft && <Link to={`/live/${id}`} className="flex-1 text-center px-3 py-2 bg-[#1c3350] text-[#93a8c2] rounded text-sm border border-[#1c3350]">{t("tournament.live")}</Link>}
        {!isDraft && <Link to={`/public/tournament/${id}`} className="flex-1 text-center px-3 py-2 bg-[#1c3350] text-[#93a8c2] rounded text-sm border border-[#1c3350]">{t("tournament.public")}</Link>}
        <Link to={`/tournament/${id}/chat`} className={`${isDraft ? "flex-1 text-center" : ""} px-3 py-2 bg-[#1c3350] text-[#93a8c2] rounded text-sm border border-[#1c3350]`}>
          {isDraft ? t("tournament.chat") : "\u{1F4AC}"}
        </Link>
        {!isDraft && (
          <button onClick={share} className="px-3 py-2 bg-[#1c3350] text-[#93a8c2] rounded text-sm border border-[#1c3350]">{t("tournament.share")}</button>
        )}
      </div>

      {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-4">{error}</div>}

      <section className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider">{t("tournament.participants")} ({approved.length})</h2>
          {isManager && (
            <button onClick={() => setShowAdd(s => !s)} className="text-xs text-[#ccff00] font-medium">{showAdd ? t("tournament.close") : `+ ${t("tournament.add")}`}</button>
          )}
        </div>

        {isManager && pending.length > 0 && (
          <div className="mb-3">
            <h3 className="text-[11px] font-medium text-yellow-400 uppercase tracking-wider mb-2">{t("tournament.pending")} ({pending.length})</h3>
            <div className="space-y-1">
              {pending.map((p: any) => (
                <div key={p.id} className="flex justify-between items-center bg-[#101f36] p-2.5 rounded border border-yellow-500/20">
                  <span className="flex items-center gap-2 min-w-0 text-sm truncate">
                    <Avatar firstName={p.user?.firstName} lastName={p.user?.lastName} rating={p.user?.rating} size="sm" />
                    {p.user?.firstName} {p.user?.lastName}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => approvePlayer(p.userId)} className="text-xs text-green-400 font-medium px-2 py-1 bg-green-500/10 rounded border border-green-500/20">{t("tournament.approve")}</button>
                    <button onClick={() => removePlayer(p.userId)} className="text-xs text-red-400 font-medium px-2 py-1 bg-red-500/10 rounded border border-red-500/20">{t("tournament.reject")}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isManager && showAdd && (
          <div className="bg-[#101f36] rounded-lg border border-[#1c3350] p-3 mb-3 space-y-2">
            {!isDraft && <p className="text-xs text-[#4d6480]">{t("tournament.addLate")}</p>}
            <input type="text" placeholder={t("tournament.searchPlayers")} value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:outline-none" />
            <div className="max-h-64 overflow-y-auto divide-y divide-[#1c3350]">
              {candidates.length === 0 ? (
                <p className="text-xs text-[#4d6480] py-3 text-center">{t("tournament.noMatching")}</p>
              ) : candidates.map(p => (
                <label key={p.id} className="flex items-center justify-between py-2.5 gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 shrink-0" />
                    <span className="text-sm truncate">{p.firstName} {p.lastName}</span>
                  </span>
                  <span className="text-xs font-mono text-[#3b82f6] shrink-0">{p.rating}</span>
                </label>
              ))}
            </div>
            <button onClick={addSelected} disabled={selected.size === 0 || busy}
              className="w-full bg-[#ccff00] text-[#0a1628] py-2.5 rounded text-sm font-bold disabled:opacity-40">
              {t("tournament.add")} {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        )}

        <div className="space-y-1">
          {approved.length === 0 ? (
            <p className="text-center py-8 text-sm text-[#6b84a0] bg-[#101f36] rounded-lg border border-[#1c3350]">{t("tournament.noPlayers")}</p>
          ) : approved.map((p: any) => (
            <div key={p.id} className="flex justify-between items-center bg-[#101f36] p-2.5 rounded border border-[#1c3350]">
              <Link to={`/player/${p.userId}`} className="min-w-0 flex items-center gap-2">
                <Avatar firstName={p.user?.firstName} lastName={p.user?.lastName} rating={p.user?.rating} size="sm" />
                {p.seed && <span className="text-[10px] bg-[#1c3350] text-[#93a8c2] px-1.5 py-0.5 rounded shrink-0">#{p.seed}</span>}
                <span className="text-sm truncate">{p.user?.firstName} {p.user?.lastName}</span>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                {isManager && (
                  <button onClick={() => removePlayer(p.userId)} aria-label={isDraft ? t("common.remove") : t("tournament.withdraw")}
                    className="text-[#4d6480] text-sm px-1">&times;</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {withdrawn.length > 0 && (
          <div className="mt-3">
            <h3 className="text-[11px] font-medium text-[#4d6480] uppercase tracking-wider mb-2">{t("tournament.withdrawn")} ({withdrawn.length})</h3>
            <div className="space-y-1">
              {withdrawn.map((p: any) => (
                <div key={p.id} className="flex justify-between items-center bg-[#101f36]/60 p-2.5 rounded border border-[#1c3350] text-[#6b84a0]">
                  <span className="text-sm truncate line-through">{p.user?.firstName} {p.user?.lastName}</span>
                  {isManager && <button onClick={() => addSelectedOne(p.userId)} className="text-xs text-[#ccff00] font-medium shrink-0">{t("tournament.add")}</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {!isManager && tournament.status !== "CANCELLED" && (
          myEntry && myEntry.status !== "WITHDRAWN" ? (
            <p className="text-center py-3 mt-3 text-sm text-yellow-400 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              {myEntry.status === "PENDING" ? t("tournament.pendingApproval") : t("tournament.youreIn")}
            </p>
          ) : ratingBlocked ? (
            <div className="text-center py-3 mt-3 text-sm bg-red-500/10 rounded-lg border border-red-500/20 px-3">
              <p className="text-[#93a8c2]">{t("tournament.ratingGate", { min: tournament.minRating ?? 0, max: tournament.maxRating ?? "∞" })}</p>
              <p className="text-red-400 font-medium mt-1">{t("tournament.yourRating", { rating: user?.rating ?? 0 })}</p>
            </div>
          ) : isFull ? (
            <p className="text-center py-3 mt-3 text-sm text-[#93a8c2] bg-[#101f36] rounded-lg border border-[#1c3350]">{t("tournament.full")}</p>
          ) : (
            <>
              {!isDraft && <p className="text-xs text-[#4d6480] mt-3 text-center">{t("tournament.joinLate")}</p>}
              <button onClick={join} disabled={busy}
                className="w-full mt-2 bg-[#ccff00] text-[#0a1628] py-3.5 rounded-lg text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-transform">
                {busy ? t("tournament.requesting") : t("tournament.join")}
              </button>
            </>
          )
        )}

        {isManager && isDraft && (
          <button onClick={pair} disabled={approved.length < 2 || busy}
            className="w-full mt-3 bg-[#ccff00] text-[#0a1628] py-3.5 rounded-lg text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-transform">
            {busy ? t("tournament.pairing") : tournament.kind === "GAME" ? t("tournament.startGame") : t("tournament.lockAndPair")}
          </button>
        )}
      </section>

      {!isDraft && (
        <section className="space-y-4">
          {isManager && (
            <button onClick={pair} disabled={!canStartNextRound || busy}
              className="w-full bg-[#ccff00] text-[#0a1628] py-3.5 rounded-lg text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-transform">
              {busy ? t("tournament.pairing") : canStartNextRound ? t("tournament.startRound", { n: currentRound + 1 }) : t("tournament.finishRoundFirst")}
            </button>
          )}
          {rounds.map((round) => (
            <div key={round}>
              <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-2">{t("tournament.round", { n: round })}</h2>
              {matches.filter((m: any) => m.round === round).map((m: any) => <MatchRow key={m.id} m={m} tournamentId={id!} tableLabel={t("tournament.table")} />)}
              {byeOf(round) && (
                <div className="flex items-center justify-between bg-[#101f36]/60 border border-dashed border-[#1c3350] p-3 rounded-lg mb-2 text-sm">
                  <Link to={`/player/${byeOf(round).userId}`} className="truncate text-[#93a8c2]">{playerName(byeOf(round).user)}</Link>
                  <span className="text-xs text-[#4d6480] shrink-0">{t("tournament.bye")}</span>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {standings.length > 0 && matches.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-2">{t("tournament.standings")}</h2>
          <div className="bg-[#101f36] rounded-lg border border-[#1c3350] divide-y divide-[#1c3350]/50">
            {standings.map((s: any, i: number) => (
              <div key={s.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link to={`/player/${s.userId}`} className="flex items-center gap-2 min-w-0">
                  <span className="text-[#4d6480] text-xs w-4 shrink-0">{i + 1}</span>
                  <Avatar firstName={s.firstName} lastName={s.lastName} size="sm" />
                  <span className="truncate">{playerName(s)}</span>
                </Link>
                <span className="flex items-center gap-3 shrink-0 text-xs">
                  <span className="text-green-400">{s.wins}{t("tournament.winShort")}</span>
                  <span className="text-red-400">{s.losses}{t("tournament.lossShort")}</span>
                  <span className="font-mono text-[#93a8c2]">{s.setsWon}:{s.setsLost}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {isManager && (
        <section className="mt-8">
          {confirmDelete ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center space-y-2">
              <p className="text-sm text-[#93a8c2]">{t("tournament.deleteConfirm")}</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 bg-[#1c3350] text-[#93a8c2] py-2.5 rounded-lg text-sm font-medium">{t("common.cancel")}</button>
                <button onClick={removeTournament} disabled={busy} className="flex-1 bg-red-500 text-white py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
                  {busy ? t("tournament.deleting") : t("common.delete")}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="w-full text-red-400 py-2.5 rounded-lg text-sm border border-red-500/20 bg-red-500/5">
              {t("tournament.delete")}
            </button>
          )}
        </section>
      )}
    </Layout>
  );
}

const editField = "w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none";

function MatchRow({ m, tournamentId, tableLabel }: { m: any; tournamentId: string; tableLabel: string }) {
  const borderClass = m.status === "IN_PROGRESS" ? "border-yellow-500/20" : "border-[#1c3350]";
  return (
    <Link to={`/tournament/${tournamentId}/match/${m.id}`}
      className={`flex items-center justify-between bg-[#101f36] border ${borderClass} p-3 rounded-lg mb-2`}>
      <span className="flex-1 min-w-0 text-right text-sm truncate pr-2">{playerName(m.player1)}</span>
      <span className={`px-3 shrink-0 text-center ${m.status === "IN_PROGRESS" ? "text-yellow-400" : "text-[#93a8c2]"}`}>
        <span className="block font-mono font-bold text-sm">{matchScoreLine(m)}</span>
        {setScores(m) && <span className="block text-[10px] text-[#4d6480] font-mono">{setScores(m)}</span>}
      </span>
      <span className="flex-1 min-w-0 text-sm truncate pl-2">{playerName(m.player2)}</span>
      {m.tableNumber && <span className="ml-2 text-[10px] text-[#4d6480] shrink-0">{tableLabel} {m.tableNumber}</span>}
    </Link>
  );
}
