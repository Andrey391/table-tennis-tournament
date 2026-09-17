import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import { useT } from "../i18n";
import { formatEventDay, formatClock, playerName } from "../lib/format";

export default function GamesPage() {
  const { t, lang } = useT();
  const { user } = useAuth();
  const [games, setGames] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", clubId: "", startTime: "", pointsToWin: 11 as 11 | 21 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    const fetch = scope === "mine" ? apiService.games.getMine() : apiService.games.getAll();
    fetch.then(r => setGames(r.data)).catch(console.error);
  };
  useEffect(load, [scope]);
  useEffect(() => { apiService.clubs.getAll().then(r => setClubs(r.data)).catch(console.error); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await apiService.games.create({
        title: form.title || undefined,
        clubId: form.clubId || undefined,
        startTime: form.startTime ? new Date(form.startTime).toISOString() : undefined,
        pointsToWin: form.pointsToWin,
      });
      setForm({ title: "", clubId: "", startTime: "", pointsToWin: 11 });
      setShowCreate(false);
      load();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
  };

  const join = async (id: string) => {
    setError("");
    try { await apiService.games.join(id); load(); }
    catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const field = "w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none";

  return (
    <Layout>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("games.title")}</h1>
        <button onClick={() => setShowCreate(v => !v)} className="text-sm text-[#ccff00] font-bold shrink-0 mt-1">
          {showCreate ? t("common.cancel") : `+ ${t("games.new")}`}
        </button>
      </div>
      <p className="text-xs text-[#6b84a0] mb-4">{t("games.subtitle")}</p>

      {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-4">{error}</div>}

      {showCreate && (
        <form onSubmit={create} className="bg-[#101f36] p-4 rounded-lg border border-[#1c3350] space-y-3 mb-4">
          <input type="text" placeholder={t("games.namePlaceholder")} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={field} />
          <select value={form.clubId} onChange={e => setForm({ ...form, clubId: e.target.value })} className={field}>
            <option value="">{t("create.noClub")}</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
          </select>
          <input type="datetime-local" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} className={field} />
          <div>
            <label className="block text-xs text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("match.pointsToWin")}</label>
            <div className="flex gap-2">
              {([11, 21] as const).map(pts => (
                <button key={pts} type="button" onClick={() => setForm({ ...form, pointsToWin: pts })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    form.pointsToWin === pts ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
                  }`}>{t("match.pts", { n: pts })}</button>
              ))}
            </div>
          </div>
          <button type="submit" disabled={busy} className="w-full bg-[#ccff00] text-[#0a1628] py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
            {busy ? t("games.creating") : t("games.create")}
          </button>
        </form>
      )}

      <div className="flex gap-2 mb-3">
        {(["all", "mine"] as const).map(s => (
          <button key={s} onClick={() => setScope(s)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
              scope === s ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#101f36] text-[#93a8c2] border-[#1c3350]"
            }`}>{t(s === "all" ? "games.all" : "games.mine")}</button>
        ))}
      </div>

      {games.length === 0 ? (
        <div className="text-center py-14 bg-[#101f36] rounded-lg border border-[#1c3350]">
          <p className="text-[#6b84a0] text-sm">{t("games.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map(g => {
            const mine = g.player1Id === user?.id || g.player2Id === user?.id;
            const openSlot = !g.player1Id || !g.player2Id;
            return (
              <div key={g.id} className="bg-[#101f36] p-3.5 rounded-lg border border-[#1c3350]">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base truncate">{g.title || t("games.title")}</h3>
                    {g.startTime && <p className="text-xs text-[#93a8c2] mt-1">{formatEventDay(g.startTime, lang)} &middot; {formatClock(g.startTime, lang)}</p>}
                    {g.club && <p className="text-xs text-[#6b84a0] mt-0.5 truncate">{g.club.name} &middot; {g.club.city}</p>}
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-[#1c3350] text-[#93a8c2] whitespace-nowrap">
                    {t("match.pts", { n: g.pointsToWin })}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 mt-2.5 text-sm">
                  <span className="text-[#3b82f6] truncate">{playerName(g.player1, t("games.waiting"))}</span>
                  <span className="font-mono text-xs text-[#4d6480] shrink-0">
                    {g.status === "NOT_STARTED" ? "vs" : `${g.score1} : ${g.score2}`}
                  </span>
                  <span className="text-[#ef4444] truncate text-right">{playerName(g.player2, t("games.waiting"))}</span>
                </div>

                <div className="flex gap-2 mt-3">
                  {!mine && openSlot && g.status === "NOT_STARTED" && (
                    <button onClick={() => join(g.id)} className="flex-1 bg-[#ccff00] text-[#0a1628] py-2 rounded-lg text-sm font-bold">{t("games.join")}</button>
                  )}
                  <Link to={`/game/${g.id}`} className="flex-1 text-center bg-[#1c3350] text-[#93a8c2] py-2 rounded-lg text-sm border border-[#1c3350]">
                    {t("games.open")}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
