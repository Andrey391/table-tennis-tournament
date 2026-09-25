import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import EventCard from "../components/EventCard";
import ClubScheduleModal from "../components/ClubScheduleModal";
import { useConfirm } from "../components/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { formatEventDay, playerName } from "../lib/format";
import { MEDALS, backLink, btnGhost, btnPrimary, btnPrimaryLg, btnSecondary, card, cardFeature, errorBox, field, sectionLabel } from "../lib/ui";

const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const toHM = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// Today as "YYYY-MM-DD" in the viewer's own zone; the server stores a booking's
// day as that date at UTC midnight, which is what `new Date("YYYY-MM-DD")` gives.
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// A club's own page: where it is and how to reach it, which tables are free right
// now, what is on there and what was played there. The manager's controls (details,
// tables, prices) sit folded at the bottom, so the page reads for a player first.
export default function ClubPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, lang } = useT();
  const { user, token } = useAuth();
  const [club, setClub] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [today, setToday] = useState<any[] | null>(null);
  const [events, setEvents] = useState<any[] | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [following, setFollowing] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [editClub, setEditClub] = useState<{ name: string; city: string; address: string; phone: string } | null>(null);
  const [newTable, setNewTable] = useState("");
  const [newTablePrice, setNewTablePrice] = useState("");
  const [editPriceId, setEditPriceId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  // Re-rendered each minute so "free until" does not go stale on an open screen.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(i); }, []);

  const nextNumber = (c: any) => String(Math.max(0, ...(c.tables ?? []).map((tbl: any) => tbl.number)) + 1);
  const loadClub = () => {
    if (!id) return;
    apiService.clubs.getById(id).then(r => { setClub(r.data); setNewTable(nextNumber(r.data)); }).catch(() => setNotFound(true));
    apiService.clubs.availability(id, new Date(localToday()).toISOString()).then(r => setToday(r.data)).catch(() => setToday([]));
  };
  useEffect(() => {
    if (!id) return;
    loadClub();
    apiService.tournaments.getAll({ clubId: id, status: "DRAFT,ACTIVE", limit: 10 }).then(r => setEvents(r.data.items)).catch(() => setEvents([]));
    apiService.stats.results({ clubId: id }).then(r => setResults(r.data.filter((e: any) => e.status === "COMPLETED").slice(0, 5))).catch(() => setResults([]));
  }, [id]);
  useEffect(() => {
    if (!id || !token) return;
    apiService.subscriptions.getMine().then(r => setFollowing(r.data.some((s: any) => s.clubId === id))).catch(console.error);
  }, [id, token]);

  if (notFound) return <Layout><EmptyState text={t("clubs.notFound")} /></Layout>;
  if (!club) return <Layout><Loader className="py-20" /></Layout>;

  // Mirrors loadOwnedClub on the server: a club with no manager is an admin's to edit.
  const isOwner = !!user && (club.createdById === user.id || (!club.createdById && user.role === "ADMIN"));
  const fail = (err: any) => setError(err.response?.data?.error || t("common.failed"));
  const mapsUrl = `${lang === "ru" ? "https://yandex.ru/maps/?text=" : "https://www.google.com/maps/search/?api=1&query="}${encodeURIComponent(`${club.city}, ${club.address || club.name}`)}`;

  // Each table's state at this minute: busy until the end of the booking it is in,
  // or free until the next one starts (or for the rest of the day).
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const tableState = (tbl: any) => {
    const busy = [...(tbl.busy ?? [])].map((b: any) => ({ from: toMin(b.startTime), to: toMin(b.startTime) + Math.round(b.durationHours * 60) })).sort((a, b) => a.from - b.from);
    const current = busy.find(b => b.from <= nowMin && nowMin < b.to);
    if (current) return { free: false, text: t("clubs.busyUntil", { time: toHM(current.to) }) };
    const next = busy.find(b => b.from > nowMin);
    return { free: true, text: next ? t("clubs.freeUntil", { time: toHM(next.from) }) : t("clubs.freeRestOfDay") };
  };
  const byId = new Map((today ?? []).map((tbl: any) => [tbl.id, tbl]));
  const tables: any[] = club.tables ?? [];
  const freeNow = tables.filter(tbl => tableState(byId.get(tbl.id) ?? {}).free).length;

  const toggleFollow = async () => {
    setError("");
    try {
      if (following) await apiService.subscriptions.unsubscribe(club.id); else await apiService.subscriptions.subscribe(club.id);
      setFollowing(!following);
      setClub((c: any) => ({ ...c, _count: { ...c._count, subscriptions: (c._count?.subscriptions ?? 0) + (following ? -1 : 1) } }));
    } catch (err) { fail(err); }
  };

  const saveClub = async () => {
    if (!editClub || !editClub.name || !editClub.city) return;
    setError("");
    try {
      await apiService.clubs.update(club.id, { name: editClub.name, city: editClub.city, address: editClub.address || undefined, phone: editClub.phone || undefined });
      setEditClub(null);
      loadClub();
    } catch (err) { fail(err); }
  };

  const addTable = async () => {
    if (!newTable) return;
    setError("");
    try {
      await apiService.clubs.addTable(club.id, { number: +newTable, ...(newTablePrice ? { pricePerHour: +newTablePrice } : {}) });
      setNewTablePrice("");
      loadClub();
    } catch (err) { fail(err); }
  };

  const removeTable = async (tableId: string) => {
    const number = club.tables?.find((x: any) => x.id === tableId)?.number;
    if (!(await confirm({ title: t("confirm.tableTitle", { n: number ?? "" }), text: t("confirm.tableText"), confirmLabel: t("common.delete"), danger: true }))) return;
    setError("");
    try { await apiService.clubs.removeTable(club.id, tableId); loadClub(); } catch (err) { fail(err); }
  };

  const savePrice = async (tableId: string) => {
    setError("");
    try {
      await apiService.clubs.updateTable(club.id, tableId, { pricePerHour: priceInput ? +priceInput : null });
      setEditPriceId(null);
      loadClub();
    } catch (err) { fail(err); }
  };

  const icon = "w-4 h-4 shrink-0 text-[#ccff00]";
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };

  return (
    <Layout>
      <button onClick={() => navigate(-1)} className={backLink}>&larr; {t("common.back")}</button>

      <div className={`${cardFeature} p-4 mb-4`}>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">{club.name}</h1>
        <p className="text-xs text-[#6b84a0] mt-1">
          {t("clubs.tablesCount", { n: tables.length })} &middot; {t("clubs.subscribers", { n: club._count?.subscriptions ?? 0 })}
        </p>
        <div className="space-y-2 text-sm mt-3">
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2.5">
            <svg {...line} className={icon}><path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2" /></svg>
            <span className="min-w-0 truncate">{club.city}{club.address ? `, ${club.address}` : ""}</span>
            <span className="text-xs text-[#ccff00] shrink-0 ml-auto">{t("clubs.onMap")}</span>
          </a>
          {club.phone && (
            <a href={`tel:${club.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2.5">
              <svg {...line} className={icon}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
              <span className="truncate">{club.phone}</span>
            </a>
          )}
          <div className="flex items-center gap-2.5">
            <svg {...line} className={icon}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
            {club.createdBy ? (
              <Link to={`/player/${club.createdBy.id}`} className="flex items-center gap-2 min-w-0">
                <span className="text-[#93a8c2] truncate">{t("clubs.admin")}: {playerName(club.createdBy)}</span>
              </Link>
            ) : <span className="text-[#4d6480]">{t("clubs.noAdmin")}</span>}
          </div>
        </div>
      </div>

      {error && <div className={`${errorBox} mb-4`}>{error}</div>}

      <div className="flex gap-2 mb-6">
        <Link to={`/bookings?club=${club.id}`} className={`${btnPrimaryLg} flex-1 text-center`}>{t("play.book")}</Link>
        {token ? (
          <button onClick={toggleFollow} className={`${following ? btnGhost : btnSecondary} shrink-0`}>
            {following ? t("clubs.following") : t("play.follow")}
          </button>
        ) : (
          <Link to="/login" className={`${btnSecondary} shrink-0`}>{t("play.follow")}</Link>
        )}
      </div>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className={sectionLabel}>{t("clubs.today")}</h2>
          {tables.length > 0 && <button onClick={() => setShowSchedule(true)} className="text-xs text-[#ccff00] font-medium">{t("play.schedule")}</button>}
        </div>
        {tables.length === 0 ? (
          <EmptyState text={t("clubs.noTablesYet")} />
        ) : today === null ? (
          <Loader className="py-4" />
        ) : (
          <div className={card}>
            <p className="px-3 pt-3 pb-2 text-sm">
              {t("clubs.freeNow")} <span className={`font-bold ${freeNow ? "text-[#ccff00]" : "text-red-400"}`}>{freeNow}</span>
              <span className="text-[#6b84a0]"> / {tables.length}</span>
            </p>
            {tables.map(tbl => {
              const st = tableState(byId.get(tbl.id) ?? {});
              return (
                <div key={tbl.id} className="flex items-center gap-3 px-3 py-2.5 border-t border-[#1c3350]">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${st.free ? "bg-[#ccff00]" : "bg-red-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t("clubs.tableN", { n: tbl.number })} <span className="text-xs text-[#4d6480] font-normal">&middot; {t(tbl.indoor ? "clubs.indoor" : "clubs.outdoor")}</span></p>
                    <p className={`text-xs ${st.free ? "text-[#93a8c2]" : "text-red-400"}`}>{st.text}</p>
                  </div>
                  <span className="text-xs text-[#93a8c2] shrink-0">{tbl.pricePerHour != null ? `${tbl.pricePerHour} ${t("play.perHour")}` : t("play.tableFree")}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className={`${sectionLabel} mb-2`}>{t("clubs.events")}</h2>
        {events === null ? <Loader className="py-4" /> : events.length === 0 ? (
          <EmptyState text={t("clubs.noEvents")} />
        ) : (
          <div className="space-y-3">{events.map(e => <EventCard key={e.id} tr={e} />)}</div>
        )}
      </section>

      <section className="mb-6">
        <h2 className={`${sectionLabel} mb-2`}>{t("clubs.results")}</h2>
        {results === null ? <Loader className="py-4" /> : results.length === 0 ? (
          <EmptyState text={t("clubs.noResults")} />
        ) : (
          <div className="space-y-2">
            {results.map(e => (
              <Link key={e.id} to={`/tournament/${e.id}`} className={`${card} block p-3 active:brightness-110`}>
                <div className="flex justify-between gap-2">
                  <p className="text-sm font-medium truncate">{e.name}</p>
                  <span className="text-[11px] text-[#4d6480] shrink-0">{formatEventDay(e.startTime || e.createdAt, lang)}</span>
                </div>
                {e.podium.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                    {e.podium.map((p: any, i: number) => (
                      <span key={p.userId} className="flex items-center gap-1.5 text-xs text-[#93a8c2]">
                        <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-[#0a1628]" style={{ background: MEDALS[i] }}>{i + 1}</span>
                        {playerName(p)}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {isOwner && (
        <section className="mb-6">
          <button onClick={() => setShowManage(v => !v)} className={`${btnGhost} w-full`}>
            {t("clubs.manage")} {showManage ? "▴" : "▾"}
          </button>
          {showManage && (
            <div className={`${card} p-3 mt-3 space-y-4`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className={sectionLabel}>{t("clubs.details")}</p>
                  <button type="button"
                    onClick={() => setEditClub(editClub ? null : { name: club.name, city: club.city, address: club.address || "", phone: club.phone || "" })}
                    className="text-xs text-[#ccff00] font-medium">
                    {editClub ? t("common.cancel") : t("play.editClub")}
                  </button>
                </div>
                {editClub && (
                  <div className="space-y-2">
                    <input type="text" placeholder={t("play.clubName")} value={editClub.name} onChange={e => setEditClub({ ...editClub, name: e.target.value })} className={field} required />
                    <input type="text" placeholder={t("common.city")} value={editClub.city} onChange={e => setEditClub({ ...editClub, city: e.target.value })} className={field} required />
                    <input type="text" placeholder={t("play.clubAddress")} value={editClub.address} onChange={e => setEditClub({ ...editClub, address: e.target.value })} className={field} />
                    <input type="text" placeholder={t("play.clubPhone")} value={editClub.phone} onChange={e => setEditClub({ ...editClub, phone: e.target.value })} className={field} />
                    <button type="button" onClick={saveClub} className={`${btnPrimary} w-full`}>{t("common.save")}</button>
                  </div>
                )}
              </div>

              <div>
                <p className={`${sectionLabel} mb-2`}>{t("play.tables")}</p>
                {tables.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {tables.map(tbl => (
                      <span key={tbl.id} className="flex items-center gap-1.5 bg-[#0a1628] border border-[#1c3350] rounded-full pl-3 pr-1.5 py-1 text-xs text-[#93a8c2]">
                        &#8470;{tbl.number}
                        <button type="button" onClick={() => { setEditPriceId(tbl.id); setPriceInput(tbl.pricePerHour != null ? String(tbl.pricePerHour) : ""); }} className="text-[#ccff00]">
                          {tbl.pricePerHour != null ? `${tbl.pricePerHour} ${t("play.perHour")}` : t("play.editPrice")}
                        </button>
                        <button type="button" onClick={() => removeTable(tbl.id)} aria-label={t("play.removeTable")} className="text-[#6b84a0] px-1">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
                {editPriceId && tables.some(tbl => tbl.id === editPriceId) && (
                  <div className="flex gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <input type="number" inputMode="decimal" min={0} step="0.01" placeholder={t("play.tablePrice")} value={priceInput} onChange={e => setPriceInput(e.target.value)} className={field} />
                    </div>
                    <button type="button" onClick={() => savePrice(editPriceId)} className={`${btnSecondary} shrink-0`}>{t("common.save")}</button>
                    <button type="button" onClick={() => setEditPriceId(null)} className="text-xs text-[#6b84a0] px-1">{t("common.cancel")}</button>
                  </div>
                )}
                {/* Widths live on wrappers: `field` already carries w-full, and a second
                    w-* on the same input lost to it, squeezing the number box to its spinner. */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="w-24 shrink-0">
                      <input type="number" inputMode="numeric" min={1} placeholder={t("play.tableNumber")} value={newTable} onChange={e => setNewTable(e.target.value)} className={field} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <input type="number" inputMode="decimal" min={0} step="0.01" placeholder={t("play.tablePrice")} value={newTablePrice} onChange={e => setNewTablePrice(e.target.value)} className={field} />
                    </div>
                  </div>
                  <button type="button" onClick={addTable} disabled={!newTable} className={`${btnSecondary} w-full`}>{t("play.addTable")}</button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <ClubScheduleModal open={showSchedule} onClose={() => setShowSchedule(false)} clubId={club.id} />
      {confirmDialog}
    </Layout>
  );
}
