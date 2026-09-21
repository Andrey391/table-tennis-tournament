import React from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import SetsToWinPicker from "../components/SetsToWinPicker";
import { useT } from "../i18n";
import { btnPrimary, btnSecondary, card, errorBox, field, fieldLabel, pageTitle } from "../lib/ui";

export default function CreateTournament() {
  const navigate = useNavigate();
  const { t } = useT();
  const [clubs, setClubs] = React.useState<any[]>([]);
  const [form, setForm] = React.useState({ name: "", description: "", clubId: "", startTime: "", endTime: "", tablesCount: 4, maxPlayers: "", minRating: "", maxRating: "", setsToWin: 3 });
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
      setsToWin: form.setsToWin,
      maxPlayers: form.maxPlayers ? +form.maxPlayers : undefined,
      minRating: form.minRating ? +form.minRating : undefined,
      maxRating: form.maxRating ? +form.maxRating : undefined,
    };
    try { const r = await apiService.tournaments.create(payload); navigate(`/tournament/${r.data.id}`); }
    catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
    finally { setLoading(false); }
  };

  return (
    <Layout>
      <h1 className={`${pageTitle} mb-4`}>{t("create.title")}</h1>
      <form onSubmit={handleSubmit} className={`${card} space-y-4 p-4`}>
        {error && <div className={errorBox}>{error}</div>}
        <div>
          <label className={fieldLabel}>{t("create.name")}</label>
          <input type="text" placeholder={t("create.namePlaceholder")} value={form.name} onChange={e => set("name", e.target.value)} className={field} required />
        </div>
        <div>
          <label className={fieldLabel}>{t("create.description")} <span className="normal-case text-[#4d6480]">({t("common.optional")})</span></label>
          <textarea rows={3} placeholder={t("create.descriptionPlaceholder")} value={form.description} onChange={e => set("description", e.target.value)} className={field} />
        </div>
        <div>
          <label className={fieldLabel}>{t("create.club")}</label>
          <select value={form.clubId} onChange={e => set("clubId", e.target.value)} className={field}>
            <option value="">{t("create.noClub")}</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLabel}>{t("create.start")}</label>
            <input type="datetime-local" value={form.startTime} onChange={e => set("startTime", e.target.value)} className={field} />
          </div>
          <div>
            <label className={fieldLabel}>{t("create.end")}</label>
            <input type="datetime-local" value={form.endTime} onChange={e => set("endTime", e.target.value)} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLabel}>{t("create.tables")}</label>
            <input type="number" min={1} value={form.tablesCount} onChange={e => set("tablesCount", +e.target.value)} className={field} />
          </div>
          <div>
            <label className={fieldLabel}>{t("create.maxPlayers")}</label>
            <input type="number" min={2} placeholder="—" value={form.maxPlayers} onChange={e => set("maxPlayers", e.target.value)} className={field} />
          </div>
        </div>
        <p className="text-xs text-[#4d6480] -mt-2">{t("create.maxPlayersHint")}</p>
        <div>
          <label className={fieldLabel}>{t("create.setsToWin")}</label>
          <SetsToWinPicker value={form.setsToWin} onChange={n => set("setsToWin", n)} />
          <p className="text-xs text-[#4d6480] mt-1.5">{t("create.setsToWinHint")}</p>
        </div>
        <div>
          <label className={fieldLabel}>{t("create.ratingRange")} <span className="normal-case text-[#4d6480]">({t("common.optional")})</span></label>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder={t("create.min")} value={form.minRating} onChange={e => set("minRating", e.target.value)} className={field} />
            <input type="number" placeholder={t("create.max")} value={form.maxRating} onChange={e => set("maxRating", e.target.value)} className={field} />
          </div>
          <p className="text-xs text-[#4d6480] mt-1.5">{t("create.ratingHint")}</p>
        </div>
        <p className="text-xs text-[#4d6480]">{t("create.hint")}</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => navigate("/")} className={`${btnSecondary} flex-1`}>{t("common.cancel")}</button>
          <button type="submit" disabled={loading} className={`${btnPrimary} flex-1`}>
            {loading ? t("common.creating") : t("common.create")}
          </button>
        </div>
      </form>
    </Layout>
  );
}
