import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import { useT } from "../i18n";
import { formatEventDay, formatTimeRange } from "../lib/format";

// A game is a tournament with kind=GAME: same roster, rounds and pairing, no Elo.
// This screen is the game-shaped view of the same feed; opening one lands on the
// usual tournament page.
export default function GamesPage() {
  const { t, lang } = useT();
  const [games, setGames] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", clubId: "", startTime: "", tablesCount: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    const fetch = scope === "mine"
      ? apiService.tournaments.getMine({ kind: "GAME" })
      : apiService.tournaments.getAll({ kind: "GAME" });
    fetch.then(r => setGames(r.data)).catch(console.error);
  };
  useEffect(load, [scope]);
  useEffect(() => { apiService.clubs.getAll().then(r => setClubs(r.data)).catch(console.error); }, []);

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
      });
      setForm({ name: "", clubId: "", startTime: "", tablesCount: 1 });
      setShowCreate(false);
      load();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
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
          <input type="text" placeholder={t("games.namePlaceholder")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={field} required />
          <select value={form.clubId} onChange={e => setForm({ ...form, clubId: e.target.value })} className={field}>
            <option value="">{t("create.noClub")}</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
          </select>
          <input type="datetime-local" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} className={field} />
          <div>
            <label className="block text-xs text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("create.tables")}</label>
            <input type="number" min={1} value={form.tablesCount} onChange={e => setForm({ ...form, tablesCount: +e.target.value })} className={field} />
          </div>
          <button type="submit" disabled={busy} className="w-full bg-[#ccff00] text-[#0a1628] py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
            {busy ? t("games.creating") : t("games.create")}
          </button>
        </form>
      )}

      <div className="flex gap-2 mb-3">
        {(["all", "mine"] as const).map(sc => (
          <button key={sc} onClick={() => setScope(sc)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
              scope === sc ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#101f36] text-[#93a8c2] border-[#1c3350]"
            }`}>{t(sc === "all" ? "games.all" : "games.mine")}</button>
        ))}
      </div>

      {games.length === 0 ? (
        <div className="text-center py-14 bg-[#101f36] rounded-lg border border-[#1c3350]">
          <p className="text-[#6b84a0] text-sm">{t("games.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map(g => (
            <Link key={g.id} to={`/tournament/${g.id}`}
              className="relative block overflow-hidden bg-[#101f36] p-3.5 pl-4 rounded-lg border border-[#1c3350] active:bg-[#1c3350] transition-colors">
              <span className={`absolute left-0 top-0 bottom-0 w-1 ${
                g.status === "ACTIVE" ? "bg-yellow-400" : g.status === "COMPLETED" ? "bg-green-500" : "bg-[#24405e]"
              }`} />
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-base truncate">{g.name}</h3>
                  {g.startTime && <p className="text-xs text-[#93a8c2] mt-1">{formatEventDay(g.startTime, lang)} &middot; {formatTimeRange(g.startTime, g.endTime, lang)}</p>}
                  {g.club && <p className="text-xs text-[#6b84a0] mt-0.5 truncate">{g.club.name} &middot; {g.club.city}</p>}
                  <p className="text-xs text-[#6b84a0] mt-0.5">
                    {g._count?.players || 0} {t("common.players")} &middot; {g._count?.matches || 0} {t("stats.matches").toLowerCase()}
                  </p>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-[#1c3350] text-[#93a8c2] whitespace-nowrap">
                  {t(`status.${g.status}`)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
