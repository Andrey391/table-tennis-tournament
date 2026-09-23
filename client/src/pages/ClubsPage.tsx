import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { btnPrimary, card, errorBox, field, pageTitle, searchField } from "../lib/ui";

// The full list of clubs — guest-readable, like the rest of the browsing screens.
// Each row opens the club's own page (/club/:id), which holds everything about it,
// including the manager's controls for its details and tables.
export default function ClubsPage() {
  const { t } = useT();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<any[] | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newClub, setNewClub] = useState({ name: "", city: "", address: "", phone: "" });
  const [error, setError] = useState("");

  // Debounced so every keystroke doesn't fire a request.
  useEffect(() => {
    const id = setTimeout(() => {
      apiService.clubs.getAll(search ? { q: search } : undefined)
        .then(r => setClubs(r.data)).catch(e => { console.error(e); setClubs(p => p ?? []); });
    }, 250);
    return () => clearTimeout(id);
  }, [search]);

  const addClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClub.name || !newClub.city) return;
    setError("");
    try {
      const r = await apiService.clubs.create({ name: newClub.name, city: newClub.city, address: newClub.address || undefined, phone: newClub.phone || undefined });
      navigate(`/club/${r.data.id}`);
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  return (
    <Layout>
      <div className="flex items-start justify-between gap-2 mb-4">
        <h1 className={pageTitle}>{t("clubs.title")}</h1>
        {token && (
          <button onClick={() => setShowAdd(v => !v)} className="text-sm text-[#ccff00] font-bold shrink-0 mt-1">
            {showAdd ? t("common.cancel") : `+ ${t("play.addClub")}`}
          </button>
        )}
      </div>

      {error && <div className={`${errorBox} mb-4`}>{error}</div>}

      {showAdd && (
        <form onSubmit={addClub} className={`${card} p-4 space-y-3 mb-4`}>
          <input type="text" placeholder={t("play.clubName")} value={newClub.name} onChange={e => setNewClub({ ...newClub, name: e.target.value })} className={field} required />
          <input type="text" placeholder={t("common.city")} value={newClub.city} onChange={e => setNewClub({ ...newClub, city: e.target.value })} className={field} required />
          <input type="text" placeholder={t("play.clubAddress")} value={newClub.address} onChange={e => setNewClub({ ...newClub, address: e.target.value })} className={field} />
          <input type="text" placeholder={t("play.clubPhone")} value={newClub.phone} onChange={e => setNewClub({ ...newClub, phone: e.target.value })} className={field} />
          <button type="submit" className={`${btnPrimary} w-full`}>{t("common.save")}</button>
        </form>
      )}

      <input type="text" placeholder={t("clubs.search")} value={search} onChange={e => setSearch(e.target.value)} className={`${searchField} mb-3`} />

      {clubs === null ? (
        <Loader />
      ) : clubs.length === 0 ? (
        <EmptyState text={t("clubs.empty")} />
      ) : (
        <div className="space-y-2">
          {clubs.map(c => (
            <Link key={c.id} to={`/club/${c.id}`} className={`${card} flex justify-between items-center gap-3 p-3 active:brightness-110`}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-[#93a8c2] truncate">{c.city}{c.address ? ` · ${c.address}` : ""}</p>
                <p className="text-[11px] text-[#4d6480] mt-0.5">
                  {t("clubs.tablesCount", { n: c._count?.tables ?? 0 })}
                  {c._count?.tournaments ? ` · ${t("clubs.eventsCount", { n: c._count.tournaments })}` : ""}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {c.minPrice != null && <span className="text-xs text-[#ccff00] font-medium">{t("clubs.priceFrom", { price: c.minPrice })}</span>}
                <span className="text-lg text-[#4d6480]">&rsaquo;</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
