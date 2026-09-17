import React from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import { useT } from "../i18n";

export default function CreateTournament() {
  const navigate = useNavigate();
  const { t } = useT();
  const [clubs, setClubs] = React.useState<any[]>([]);
  const [form, setForm] = React.useState({ name: "", description: "", clubId: "", startTime: "", endTime: "", tablesCount: 4, maxPlayers: "", minRating: "", maxRating: "", pointsToWin: 11 as 11 | 21 });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => { apiService.clubs.getAll().then(r => setClubs(r.data)).catch(console.error); }, []);

  const set = (key: string, val: any) => setForm({ ...form, [key]: val });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      name: form.name,
      description: form.description || undefined,
      clubId: form.clubId || undefined,
      startTime: form.startTime ? new Date(form.startTime).toISOString() : undefined,
      endTime: form.endTime ? new Date(form.endTime).toISOString() : undefined,
      tablesCount: form.tablesCount,
      pointsToWin: form.pointsToWin,
      maxPlayers: form.maxPlayers ? +form.maxPlayers : undefined,
      minRating: form.minRating ? +form.minRating : undefined,
      maxRating: form.maxRating ? +form.maxRating : undefined,
    };
    try { const r = await apiService.tournaments.create(payload); navigate(`/tournament/${r.data.id}`); }
    catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
    finally { setLoading(false); }
  };

  const field = "w-full px-3 py-3 bg-[#0a1628] rounded border border-[#1c3350] focus:border-[#ccff00] focus:outline-none";
  const label = "block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider";

  return (
    <Layout>
      <h1 className="text-2xl font-bold tracking-tight mb-4">{t("create.title")}</h1>
      <form onSubmit={handleSubmit} className="space-y-4 bg-[#101f36] p-4 rounded-lg border border-[#1c3350]">
        {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20">{error}</div>}
        <div>
          <label className={label}>{t("create.name")}</label>
          <input type="text" placeholder={t("create.namePlaceholder")} value={form.name} onChange={e => set("name", e.target.value)} className={field} required />
        </div>
        <div>
          <label className={label}>{t("create.description")} <span className="normal-case text-[#4d6480]">({t("common.optional")})</span></label>
          <textarea rows={3} placeholder={t("create.descriptionPlaceholder")} value={form.description} onChange={e => set("description", e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>{t("create.club")}</label>
          <select value={form.clubId} onChange={e => set("clubId", e.target.value)} className={field}>
            <option value="">{t("create.noClub")}</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>{t("create.start")}</label>
            <input type="datetime-local" value={form.startTime} onChange={e => set("startTime", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>{t("create.end")}</label>
            <input type="datetime-local" value={form.endTime} onChange={e => set("endTime", e.target.value)} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>{t("create.tables")}</label>
            <input type="number" min={1} value={form.tablesCount} onChange={e => set("tablesCount", +e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>{t("create.maxPlayers")}</label>
            <input type="number" min={2} placeholder="—" value={form.maxPlayers} onChange={e => set("maxPlayers", e.target.value)} className={field} />
          </div>
        </div>
        <p className="text-xs text-[#4d6480] -mt-2">{t("create.maxPlayersHint")}</p>
        <div>
          <label className={label}>{t("create.pointsToWin")}</label>
          <div className="flex gap-2">
            {([11, 21] as const).map(pts => (
              <button key={pts} type="button" onClick={() => set("pointsToWin", pts)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${
                  form.pointsToWin === pts ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
                }`}>{t("match.pts", { n: pts })}</button>
            ))}
          </div>
          <p className="text-xs text-[#4d6480] mt-1.5">{t("create.pointsToWinHint")}</p>
        </div>
        <div>
          <label className={label}>{t("create.ratingRange")} <span className="normal-case text-[#4d6480]">({t("common.optional")})</span></label>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder={t("create.min")} value={form.minRating} onChange={e => set("minRating", e.target.value)} className={field} />
            <input type="number" placeholder={t("create.max")} value={form.maxRating} onChange={e => set("maxRating", e.target.value)} className={field} />
          </div>
          <p className="text-xs text-[#4d6480] mt-1.5">{t("create.ratingHint")}</p>
        </div>
        <p className="text-xs text-[#4d6480]">{t("create.hint")}</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => navigate("/")} className="flex-1 bg-[#1c3350] text-[#93a8c2] py-3 rounded text-sm font-medium">{t("common.cancel")}</button>
          <button type="submit" disabled={loading} className="flex-1 bg-[#ccff00] text-[#0a1628] py-3 rounded-lg text-sm font-bold disabled:opacity-50">
            {loading ? t("common.creating") : t("common.create")}
          </button>
        </div>
      </form>
    </Layout>
  );
}
