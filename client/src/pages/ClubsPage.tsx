import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import ClubScheduleModal from "../components/ClubScheduleModal";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { btnPrimary, btnSecondary, card, errorBox, field, fieldLabel, pageTitle, searchField } from "../lib/ui";
import { playerName } from "../lib/format";
import Avatar from "../components/Avatar";
import { Link } from "react-router-dom";

// The full list of clubs — guest-readable, like the rest of the browsing screens.
// Editing a club and its tables used to only be reachable through the booking
// form on /bookings (you had to start booking a table just to fix a phone
// number); each club here expands in place to the same edit/tables controls,
// gated by the same "created it, or nobody has" ownership rule as everywhere else.
export default function ClubsPage() {
  const { t } = useT();
  const { user, token } = useAuth();
  const [clubs, setClubs] = useState<any[] | null>(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [newTable, setNewTable] = useState("");
  const [newTablePrice, setNewTablePrice] = useState("");
  const [editPriceId, setEditPriceId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [editClub, setEditClub] = useState<{ name: string; city: string; address: string; phone: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newClub, setNewClub] = useState({ name: "", city: "", address: "", phone: "" });
  const [scheduleClubId, setScheduleClubId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    apiService.clubs.getAll(search ? { q: search } : undefined)
      .then(r => setClubs(r.data)).catch(e => { console.error(e); setClubs(p => p ?? []); });
  };
  // Debounced so every keystroke doesn't fire a request.
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [search]);

  const refreshDetail = (id: string) => apiService.clubs.getById(id).then(r => setDetails(d => ({ ...d, [id]: r.data })));

  const toggleClub = (id: string) => {
    setEditClub(null);
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!details[id]) refreshDetail(id);
  };

  const addClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClub.name || !newClub.city) return;
    setError("");
    try {
      const r = await apiService.clubs.create({ name: newClub.name, city: newClub.city, address: newClub.address || undefined, phone: newClub.phone || undefined });
      setNewClub({ name: "", city: "", address: "", phone: "" });
      setShowAdd(false);
      load();
      setOpenId(r.data.id);
      setDetails(d => ({ ...d, [r.data.id]: r.data }));
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const saveClub = async (id: string) => {
    if (!editClub || !editClub.name || !editClub.city) return;
    setError("");
    try {
      await apiService.clubs.update(id, {
        name: editClub.name, city: editClub.city,
        address: editClub.address || undefined, phone: editClub.phone || undefined,
      });
      setEditClub(null);
      refreshDetail(id);
      load();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const addTable = async (id: string) => {
    if (!newTable) return;
    setError("");
    try {
      await apiService.clubs.addTable(id, { number: +newTable, ...(newTablePrice ? { pricePerHour: +newTablePrice } : {}) });
      setNewTable("");
      setNewTablePrice("");
      refreshDetail(id);
      load();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const removeTable = async (clubId: string, tableId: string) => {
    setError("");
    try {
      await apiService.clubs.removeTable(clubId, tableId);
      refreshDetail(clubId);
      load();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const savePrice = async (clubId: string, tableId: string) => {
    setError("");
    try {
      await apiService.clubs.updateTable(clubId, tableId, { pricePerHour: priceInput ? +priceInput : null });
      setEditPriceId(null);
      refreshDetail(clubId);
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
          {clubs.map(c => {
            const isOpen = openId === c.id;
            const detail = details[c.id];
            const isOwner = !!user && !!detail && (detail.createdById === user.id || !detail.createdById);
            return (
              <div key={c.id} className={card}>
                <button type="button" onClick={() => toggleClub(c.id)} className="w-full flex justify-between items-center gap-2 p-3 text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-[#93a8c2] truncate">{c.city}{c.address ? ` · ${c.address}` : ""}</p>
                  </div>
                  <span className="text-xs text-[#4d6480] shrink-0">{t("clubs.tablesCount", { n: c._count?.tables ?? 0 })}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-[#1c3350] p-3 space-y-3">
                    {!detail ? (
                      <Loader className="py-4" />
                    ) : (
                      <>
                        {detail.phone && <p className="text-xs text-[#93a8c2]">{t("play.clubPhone")}: {detail.phone}</p>}

                        <div>
                          <p className={fieldLabel + " mb-1"}>{t("clubs.admin")}</p>
                          {detail.createdBy ? (
                            <Link to={`/player/${detail.createdBy.id}`} className="flex items-center gap-2">
                              <Avatar firstName={detail.createdBy.firstName} lastName={detail.createdBy.lastName} rating={detail.createdBy.rating} size="sm" />
                              <span className="text-sm text-[#93a8c2]">{playerName(detail.createdBy)}</span>
                            </Link>
                          ) : (
                            <p className="text-xs text-[#4d6480]">{t("clubs.noAdmin")}</p>
                          )}
                        </div>

                        {isOwner && (
                          <div className="flex justify-end -mt-1">
                            <button type="button"
                              onClick={() => (editClub ? setEditClub(null) : setEditClub({ name: detail.name, city: detail.city, address: detail.address || "", phone: detail.phone || "" }))}
                              className="text-xs text-[#ccff00] font-medium">
                              {editClub ? t("common.cancel") : t("play.editClub")}
                            </button>
                          </div>
                        )}

                        {isOwner && editClub && (
                          <div className="space-y-2">
                            <input type="text" placeholder={t("play.clubName")} value={editClub.name} onChange={e => setEditClub({ ...editClub, name: e.target.value })} className={field} required />
                            <input type="text" placeholder={t("common.city")} value={editClub.city} onChange={e => setEditClub({ ...editClub, city: e.target.value })} className={field} required />
                            <input type="text" placeholder={t("play.clubAddress")} value={editClub.address} onChange={e => setEditClub({ ...editClub, address: e.target.value })} className={field} />
                            <input type="text" placeholder={t("play.clubPhone")} value={editClub.phone} onChange={e => setEditClub({ ...editClub, phone: e.target.value })} className={field} />
                            <button type="button" onClick={() => saveClub(c.id)} className={`${btnPrimary} w-full`}>{t("common.save")}</button>
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className={fieldLabel}>{t("play.tables")}</label>
                            {!!detail.tables?.length && (
                              <button type="button" onClick={() => setScheduleClubId(c.id)} className="text-xs text-[#ccff00] font-medium">
                                {t("play.schedule")}
                              </button>
                            )}
                          </div>
                          {detail.tables?.length ? (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {detail.tables.map((tbl: any) => (
                                <span key={tbl.id} className="flex items-center gap-1.5 bg-[#0a1628] border border-[#1c3350] rounded-full pl-3 pr-1.5 py-1 text-xs text-[#93a8c2]">
                                  &#8470;{tbl.number}
                                  {isOwner ? (
                                    <button type="button" onClick={() => { setEditPriceId(tbl.id); setPriceInput(tbl.pricePerHour != null ? String(tbl.pricePerHour) : ""); }}
                                      className="text-[#ccff00]">
                                      {tbl.pricePerHour != null ? `${tbl.pricePerHour} ${t("play.perHour")}` : t("play.editPrice")}
                                    </button>
                                  ) : tbl.pricePerHour != null ? (
                                    <span>{tbl.pricePerHour} {t("play.perHour")}</span>
                                  ) : null}
                                  {isOwner && (
                                    <button type="button" onClick={() => removeTable(c.id, tbl.id)} aria-label={t("play.removeTable")} className="text-[#6b84a0] px-1">&times;</button>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-[#4d6480] mb-2">{t("play.noTables")}</p>
                          )}
                          {isOwner && editPriceId && detail.tables?.some((tbl: any) => tbl.id === editPriceId) && (
                            <div className="flex gap-2 mb-2">
                              <input type="number" min={0} step="0.01" placeholder={t("play.tablePrice")} value={priceInput} onChange={e => setPriceInput(e.target.value)}
                                className={field + " flex-1"} />
                              <button type="button" onClick={() => savePrice(c.id, editPriceId)} className={`${btnSecondary} shrink-0`}>{t("common.save")}</button>
                              <button type="button" onClick={() => setEditPriceId(null)} className="text-xs text-[#6b84a0] px-1">{t("common.cancel")}</button>
                            </div>
                          )}
                          {isOwner ? (
                            <div className="flex gap-2">
                              <input type="number" min={1} placeholder={t("play.tableNumber")} value={newTable} onChange={e => setNewTable(e.target.value)}
                                className={field + " flex-1"} />
                              <input type="number" min={0} step="0.01" placeholder={t("play.tablePrice")} value={newTablePrice} onChange={e => setNewTablePrice(e.target.value)}
                                className={field + " w-28 shrink-0"} />
                              <button type="button" onClick={() => addTable(c.id)} disabled={!newTable} className={`${btnSecondary} shrink-0`}>
                                {t("play.addTable")}
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-[#4d6480]">{t("play.notClubManager")}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ClubScheduleModal
        open={!!scheduleClubId}
        onClose={() => setScheduleClubId(null)}
        clubId={scheduleClubId || ""}
      />
    </Layout>
  );
}
