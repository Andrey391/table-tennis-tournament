import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import Layout from "../components/Layout";

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    if (!id) return;
    apiService.tournaments.getById(id).then(r => setTournament(r.data)).catch(console.error);
    apiService.tournaments.standings(id).then(r => setStandings(r.data)).catch(console.error);
  };

  useEffect(load, [id]);
  useEffect(() => { apiService.players.getAll().then(r => setAllPlayers(r.data)).catch(console.error); }, []);

  if (!tournament) return <Layout><div className="text-center py-20 text-[#666680] text-sm">Loading...</div></Layout>;

  const isDraft = tournament.status === "DRAFT";
  const rosterIds = new Set(tournament.players.map((p: any) => p.userId));
  const candidates = allPlayers.filter(p => !rosterIds.has(p.id) && `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));

  const addSelected = async () => {
    if (!id || selected.size === 0) return;
    setBusy(true); setError("");
    try {
      await apiService.tournaments.addPlayers(id, { userIds: Array.from(selected) });
      setSelected(new Set()); setSearch(""); setShowAdd(false);
      load();
    } catch (e: any) { setError(e.response?.data?.error || "Failed to add players"); }
    finally { setBusy(false); }
  };

  const removePlayer = async (userId: string) => {
    if (!id) return;
    try { await apiService.tournaments.removePlayer(id, userId); load(); }
    catch (e: any) { setError(e.response?.data?.error || "Failed to remove player"); }
  };

  const pair = async () => {
    if (!id) return;
    setBusy(true); setError("");
    try { await apiService.tournaments.pair(id); load(); }
    catch (e: any) { setError(e.response?.data?.error || "Failed to pair players"); }
    finally { setBusy(false); }
  };

  const toggleSelect = (userId: string) => {
    const next = new Set(selected);
    next.has(userId) ? next.delete(userId) : next.add(userId);
    setSelected(next);
  };

  const live = tournament.matches?.filter((m: any) => m.status === "IN_PROGRESS") || [];
  const scheduled = tournament.matches?.filter((m: any) => m.status === "NOT_STARTED") || [];
  const completed = tournament.matches?.filter((m: any) => m.status === "COMPLETED") || [];

  return (
    <Layout>
      <div className="mb-4">
        <h1 className="text-lg font-bold truncate">{tournament.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
            tournament.status === "ACTIVE" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
            tournament.status === "COMPLETED" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
            "bg-[#1e1e2e] text-[#8888a0] border border-[#333]"
          }`}>{isDraft ? "Adding players" : tournament.status === "ACTIVE" ? "In progress" : "Completed"}</span>
          <span className="text-xs text-[#555566]">{tournament.tablesCount} tables</span>
        </div>
      </div>

      {!isDraft && (
        <div className="flex gap-2 mb-4">
          <Link to={`/live/${id}`} className="flex-1 text-center px-3 py-2 bg-[#1e1e2e] text-[#8888a0] rounded text-sm border border-[#333]">Live board</Link>
          <Link to={`/public/tournament/${id}`} className="flex-1 text-center px-3 py-2 bg-[#1e1e2e] text-[#8888a0] rounded text-sm border border-[#333]">Public page</Link>
        </div>
      )}

      {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-4">{error}</div>}

      <section className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xs font-medium text-[#666680] uppercase tracking-wider">Participants ({tournament.players.length})</h2>
          {isDraft && (
            <button onClick={() => setShowAdd(s => !s)} className="text-xs text-[#3b82f6] font-medium">{showAdd ? "Close" : "+ Add"}</button>
          )}
        </div>

        {isDraft && showAdd && (
          <div className="bg-[#12121a] rounded-lg border border-[#1e1e2e] p-3 mb-3 space-y-2">
            <input type="text" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a0a0f] rounded border border-[#1e1e2e] text-sm focus:outline-none" />
            <div className="max-h-64 overflow-y-auto divide-y divide-[#1e1e2e]">
              {candidates.length === 0 ? (
                <p className="text-xs text-[#555566] py-3 text-center">No matching players</p>
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
              className="w-full bg-[#3b82f6] text-white py-2.5 rounded text-sm font-medium disabled:opacity-40">
              Add {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        )}

        <div className="space-y-1">
          {tournament.players.length === 0 ? (
            <p className="text-center py-8 text-sm text-[#666680] bg-[#12121a] rounded-lg border border-[#1e1e2e]">No participants yet</p>
          ) : tournament.players.map((p: any) => (
            <div key={p.id} className="flex justify-between items-center bg-[#12121a] p-2.5 rounded border border-[#1e1e2e]">
              <div className="min-w-0 flex items-center gap-2">
                {p.seed && <span className="text-[10px] bg-[#1e1e2e] text-[#8888a0] px-1.5 py-0.5 rounded shrink-0">#{p.seed}</span>}
                <span className="text-sm truncate">{p.user?.firstName} {p.user?.lastName}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono text-[#3b82f6]">{p.user?.rating || 1000}</span>
                {isDraft && (
                  <button onClick={() => removePlayer(p.userId)} aria-label="Remove" className="text-[#555566] text-sm px-1">&times;</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {isDraft && (
          <button onClick={pair} disabled={tournament.players.length < 2 || busy}
            className="w-full mt-3 bg-[#3b82f6] text-white py-3 rounded-lg text-sm font-medium disabled:opacity-40">
            {busy ? "Pairing..." : "Lock roster & split into pairs"}
          </button>
        )}
      </section>

      {!isDraft && (
        <section className="space-y-4">
          {live.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-yellow-400 uppercase tracking-wider mb-2">Live</h2>
              {live.map((m: any) => <MatchRow key={m.id} m={m} tournamentId={id!} />)}
            </div>
          )}
          {scheduled.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-[#666680] uppercase tracking-wider mb-2">Scheduled</h2>
              {scheduled.map((m: any) => <MatchRow key={m.id} m={m} tournamentId={id!} />)}
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-[#666680] uppercase tracking-wider mb-2">Completed</h2>
              {completed.map((m: any) => <MatchRow key={m.id} m={m} tournamentId={id!} />)}
            </div>
          )}
        </section>
      )}

      {standings.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-medium text-[#666680] uppercase tracking-wider mb-2">Standings</h2>
          <div className="bg-[#12121a] rounded-lg border border-[#1e1e2e] divide-y divide-[#1e1e2e]/50">
            {standings.map((s: any, i: number) => (
              <div key={s.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[#555566] text-xs w-4 shrink-0">{i + 1}</span>
                  <span className="truncate">{s.firstName} {s.lastName}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0 text-xs">
                  <span className="text-green-400">{s.wins}W</span>
                  <span className="text-red-400">{s.losses}L</span>
                  <span className="font-mono text-[#8888a0]">{s.pointsFor}-{s.pointsAgainst}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}

function MatchRow({ m, tournamentId }: { m: any; tournamentId: string }) {
  const borderClass = m.status === "IN_PROGRESS" ? "border-yellow-500/20" : "border-[#1e1e2e]";
  return (
    <Link to={`/tournament/${tournamentId}/match/${m.id}`}
      className={`flex items-center justify-between bg-[#12121a] border ${borderClass} p-3 rounded-lg mb-2`}>
      <span className="flex-1 min-w-0 text-right text-sm truncate pr-2">{m.player1?.firstName || "TBD"}</span>
      <span className={`px-3 font-mono font-bold text-sm shrink-0 ${m.status === "IN_PROGRESS" ? "text-yellow-400" : "text-[#8888a0]"}`}>
        {m.status === "NOT_STARTED" ? "vs" : `${m.score1} - ${m.score2}`}
      </span>
      <span className="flex-1 min-w-0 text-sm truncate pl-2">{m.player2?.firstName || "TBD"}</span>
      {m.tableNumber && <span className="ml-2 text-[10px] text-[#555566] shrink-0">T{m.tableNumber}</span>}
    </Link>
  );
}
