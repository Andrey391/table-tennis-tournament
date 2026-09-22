import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import SetsToWinPicker from "../components/SetsToWinPicker";
import ClubScheduleModal from "../components/ClubScheduleModal";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useT } from "../i18n";
import { formatShortDate, formatSlot } from "../lib/format";
import { btnPrimary, btnSecondary, card, errorBox, field, fieldLabel, pageTitle, sectionLabel } from "../lib/ui";

// "HH:MM" -> minutes since midnight, for turning a start/end pair into a duration.
const parseHM = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

// Mirrors the server's bookingsOverlap (shared/booking.ts) so a table already
// taken over the chosen slot can be greyed out before submitting, not just
// rejected afterwards.
const overlaps = (aStart: string, aHours: number, bStart: string, bHours: number) => {
  const a1 = parseHM(aStart), a2 = a1 + Math.round(aHours * 60);
  const b1 = parseHM(bStart), b2 = b1 + Math.round(bHours * 60);
  return a1 < b2 && b1 < a2;
};

export default function BookingsPage() {
  const { t, lang } = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  // null until the first answer, so "no clubs" / "no bookings" only ever means it.
  const [clubs, setClubs] = useState<any[] | null>(null);
  const [bookings, setBookings] = useState<any[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<any[] | null>(null);
  const [availability, setAvailability] = useState<any[]>([]);
  const [form, setForm] = useState({
    clubId: "", tableId: "", date: "", startTime: "", endTime: "",
    eventType: "GAME" as "GAME" | "TOURNAMENT", eventTitle: "", setsToWin: 3, tablesCount: 1, isPublic: true,
  });
  const [newClub, setNewClub] = useState({ name: "", city: "", address: "", phone: "" });
  const [club, setClub] = useState<any>(null);
  const [newTable, setNewTable] = useState("");
  const [showAddClub, setShowAddClub] = useState(false);
  const [editClub, setEditClub] = useState<{ name: string; city: string; address: string; phone: string } | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [subClubId, setSubClubId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    // On failure a list settles to empty rather than spinning forever.
    const failed = (set: (v: any[] | ((p: any[] | null) => any[])) => void) => (e: unknown) => { console.error(e); set(p => p ?? []); };
    apiService.clubs.getAll().then(r => setClubs(r.data)).catch(failed(setClubs));
    apiService.bookings.getMine().then(r => setBookings(r.data)).catch(failed(setBookings));
    apiService.subscriptions.getMine().then(r => setSubscriptions(r.data)).catch(failed(setSubscriptions));
  };
  useEffect(load, []);

  // The club's own tables. Without any, "book a specific table" has nothing to
  // offer and the overlap check never fires, so this is also where they get added.
  const loadClub = (clubId: string) => {
    if (!clubId) { setClub(null); return; }
    apiService.clubs.getById(clubId).then(r => setClub(r.data)).catch(console.error);
  };
  useEffect(() => { loadClub(form.clubId); setEditClub(null); }, [form.clubId]);

  // Which tables are already taken that day, so a clashing slot is visible before submitting.
  const loadAvailability = () => {
    if (!form.clubId || !form.date) { setAvailability([]); return; }
    apiService.clubs.availability(form.clubId, new Date(form.date).toISOString())
      .then(r => setAvailability(r.data)).catch(console.error);
  };
  useEffect(loadAvailability, [form.clubId, form.date]);

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val, ...(key === "clubId" ? { tableId: "" } : {}) }));

  // Slot-aware view of the club's tables: which ones actually clash with the
  // start/end just picked, so a busy table can be greyed out (and a tournament's
  // table count capped) before the server has to say no.
  const hasSlot = !!(form.startTime && form.endTime);
  let slotHours = 0;
  if (hasSlot) {
    let diff = parseHM(form.endTime) - parseHM(form.startTime);
    if (diff <= 0) diff += 24 * 60;
    slotHours = diff / 60;
  }
  const tablesForSlot = availability.map(tbl => ({
    ...tbl,
    free: !hasSlot || !tbl.busy.some((b: any) => overlaps(form.startTime, slotHours, b.startTime, b.durationHours)),
  }));
  const freeTablesCount = hasSlot ? tablesForSlot.filter(t => t.free).length : availability.length;
  // A table picked before the slot narrowed down can turn out to clash with it;
  // drop the pick rather than silently submit a table that's actually taken.
  useEffect(() => {
    if (!form.tableId) return;
    const picked = tablesForSlot.find(t => t.id === form.tableId);
    if (picked && !picked.free) set("tableId", "");
  }, [form.tableId, form.startTime, form.endTime, availability]);

  const createBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clubId || !form.date || !form.startTime || !form.endTime) return;
    // Same pair as an event's start/end; a slot past midnight (start later than end)
    // wraps to the next day rather than being rejected.
    let diffMinutes = parseHM(form.endTime) - parseHM(form.startTime);
    if (diffMinutes <= 0) diffMinutes += 24 * 60;
    const durationHours = diffMinutes / 60;
    if (durationHours < 0.5 || durationHours > 8) { setError(t("play.durationRange")); return; }
    if (form.eventType === "TOURNAMENT" && availability.length > 0 && form.tablesCount > freeTablesCount) {
      setError(t("play.notEnoughTables", { n: freeTablesCount }));
      return;
    }
    setBusy(true); setError("");
    try {
      const created = await apiService.bookings.create({
        clubId: form.clubId,
        tableId: form.tableId || undefined,
        date: new Date(form.date).toISOString(),
        startTime: form.startTime,
        durationHours,
        eventType: form.eventType,
        eventTitle: form.eventTitle || undefined,
        setsToWin: form.setsToWin,
        tablesCount: form.eventType === "TOURNAMENT" ? form.tablesCount : undefined,
        isPublic: form.isPublic,
      });
      setForm({ ...form, tableId: "", date: "", startTime: "", endTime: "", eventTitle: "", tablesCount: 1 });
      load();
      // The booking exists to hold a table for an event, and that event is where
      // the next step lives — adding an opponent and starting. Land there instead
      // of leaving people to hunt for it in the feed.
      if (created.data?.tournament?.id) navigate(`/tournament/${created.data.tournament.id}`);
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
  };

  const addClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClub.name || !newClub.city) return;
    setError("");
    try {
      const r = await apiService.clubs.create({ name: newClub.name, city: newClub.city, address: newClub.address || undefined, phone: newClub.phone || undefined });
      setNewClub({ name: "", city: "", address: "", phone: "" });
      setShowAddClub(false);
      setForm(f => ({ ...f, clubId: r.data.id }));
      load();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const openEditClub = () => {
    if (!club) return;
    setEditClub({ name: club.name, city: club.city, address: club.address || "", phone: club.phone || "" });
  };

  const saveClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editClub || !club || !editClub.name || !editClub.city) return;
    setError("");
    try {
      await apiService.clubs.update(club.id, {
        name: editClub.name, city: editClub.city,
        address: editClub.address || undefined, phone: editClub.phone || undefined,
      });
      setEditClub(null);
      loadClub(club.id);
      load();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const addTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clubId || !newTable) return;
    setError("");
    try {
      await apiService.clubs.addTable(form.clubId, { number: +newTable });
      setNewTable("");
      loadClub(form.clubId);
      loadAvailability();
      load();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const removeTable = async (tableId: string) => {
    if (!form.clubId) return;
    setError("");
    try {
      await apiService.clubs.removeTable(form.clubId, tableId);
      if (form.tableId === tableId) set("tableId", "");
      loadClub(form.clubId);
      loadAvailability();
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const removeBooking = async (id: string) => {
    try { await apiService.bookings.remove(id); load(); } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subClubId) return;
    try { await apiService.subscriptions.subscribe(subClubId); setSubClubId(""); load(); }
    catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  const unsubscribe = async (clubId: string) => {
    try { await apiService.subscriptions.unsubscribe(clubId); load(); } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
  };

  return (
    <Layout>
      <h1 className={`${pageTitle} mb-4`}>{t("play.title")}</h1>
      {error && <div className={`${errorBox} mb-4`}>{error}</div>}

      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className={sectionLabel}>{t("play.book")}</h2>
          <button onClick={() => setShowAddClub(v => !v)} className="text-xs text-[#ccff00] font-medium">{t("play.addClub")}</button>
        </div>

        {showAddClub && (
          <form onSubmit={addClub} className={`${card} p-4 space-y-3 mb-3`}>
            <input type="text" placeholder={t("play.clubName")} value={newClub.name} onChange={e => setNewClub({ ...newClub, name: e.target.value })} className={field} required />
            <input type="text" placeholder={t("common.city")} value={newClub.city} onChange={e => setNewClub({ ...newClub, city: e.target.value })} className={field} required />
            <input type="text" placeholder={t("play.clubAddress")} value={newClub.address} onChange={e => setNewClub({ ...newClub, address: e.target.value })} className={field} />
            <input type="text" placeholder={t("play.clubPhone")} value={newClub.phone} onChange={e => setNewClub({ ...newClub, phone: e.target.value })} className={field} />
            <button type="submit" className={`${btnPrimary} w-full`}>{t("common.save")}</button>
          </form>
        )}

        {clubs === null ? (
          <Loader className="py-8" />
        ) : clubs.length === 0 ? (
          <EmptyState text={t("play.noClubs")} />
        ) : (
          <form onSubmit={createBooking} className={`${card} p-4 space-y-3`}>
            <select value={form.clubId} onChange={e => set("clubId", e.target.value)} className={field} required>
              <option value="">{t("play.selectClub")}</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
            </select>

            {form.clubId && club && (() => {
              const isClubManager = club.createdById === user?.id || !club.createdById;
              return (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={fieldLabel}>{t("play.tables")}</label>
                    {isClubManager && (
                      <button type="button" onClick={() => (editClub ? setEditClub(null) : openEditClub())} className="text-xs text-[#ccff00] font-medium">
                        {editClub ? t("common.cancel") : t("play.editClub")}
                      </button>
                    )}
                  </div>

                  {editClub && (
                    <div className={`${card} p-3 space-y-2 mb-2`} onClick={e => e.stopPropagation()}>
                      <input type="text" placeholder={t("play.clubName")} value={editClub.name} onChange={e => setEditClub({ ...editClub, name: e.target.value })} className={field} required />
                      <input type="text" placeholder={t("common.city")} value={editClub.city} onChange={e => setEditClub({ ...editClub, city: e.target.value })} className={field} required />
                      <input type="text" placeholder={t("play.clubAddress")} value={editClub.address} onChange={e => setEditClub({ ...editClub, address: e.target.value })} className={field} />
                      <input type="text" placeholder={t("play.clubPhone")} value={editClub.phone} onChange={e => setEditClub({ ...editClub, phone: e.target.value })} className={field} />
                      <button type="button" onClick={saveClub} className={`${btnPrimary} w-full`}>{t("common.save")}</button>
                    </div>
                  )}

                  {club.tables?.length ? (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {club.tables.map((tbl: any) => (
                        <span key={tbl.id} className="flex items-center gap-1.5 bg-[#0a1628] border border-[#1c3350] rounded-full pl-3 pr-1.5 py-1 text-xs text-[#93a8c2]">
                          &#8470;{tbl.number}
                          {isClubManager && (
                            <button type="button" onClick={() => removeTable(tbl.id)} aria-label={t("play.removeTable")} className="text-[#6b84a0] px-1">&times;</button>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#4d6480] mb-2">{t("play.noTables")}</p>
                  )}
                  {isClubManager ? (
                    <div className="flex gap-2">
                      <input type="number" min={1} placeholder={t("play.tableNumber")} value={newTable} onChange={e => setNewTable(e.target.value)}
                        className={field + " flex-1"} />
                      <button type="button" onClick={addTable} disabled={!newTable}
                        className={`${btnSecondary} shrink-0`}>
                        {t("play.addTable")}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-[#4d6480]">{t("play.notClubManager")}</p>
                  )}
                </div>
              );
            })()}

            <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className={field} required />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>{t("create.start")}</label>
                <input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} className={field} required />
              </div>
              <div>
                <label className={fieldLabel}>{t("create.end")}</label>
                <input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} className={field} required />
              </div>
            </div>

            {availability.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={fieldLabel}>{t("common.table")}</label>
                  <button type="button" onClick={() => setShowSchedule(true)} className="text-xs text-[#ccff00] font-medium">
                    {t("play.schedule")}
                  </button>
                </div>
                {/* Each table shows its bookings for the day (the "grid"), and one that
                    clashes with the start/end just picked can't be selected — the same
                    rule the server enforces with a 409 is applied here before submitting. */}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => set("tableId", "")}
                    className={`px-3 py-2 rounded-lg text-sm border ${!form.tableId ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"}`}>
                    {t("play.anyTable")}
                  </button>
                  {tablesForSlot.map(tbl => (
                    <button key={tbl.id} type="button" disabled={!tbl.free} onClick={() => set("tableId", tbl.id)}
                      className={`px-3 py-2 rounded-lg text-sm border text-left ${
                        !tbl.free ? "opacity-40 cursor-not-allowed bg-[#0a1628] text-[#4d6480] border-[#1c3350]"
                        : form.tableId === tbl.id ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
                      }`}>
                      №{tbl.number}
                      {tbl.busy.length > 0 && (
                        <span className={`block text-[10px] ${form.tableId === tbl.id ? "text-[#0a1628]/70" : "text-[#4d6480]"}`}>
                          {t("play.tableBusy")}: {tbl.busy.map((b: any) => formatSlot(b.startTime, b.durationHours)).join(", ")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className={fieldLabel}>{t("play.bookingFor")}</label>
              <div className="flex gap-2">
                {(["GAME", "TOURNAMENT"] as const).map(kind => (
                  <button key={kind} type="button" onClick={() => set("eventType", kind)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                      form.eventType === kind ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
                    }`}>{t(kind === "GAME" ? "play.asGame" : "play.asTournament")}</button>
                ))}
              </div>
            </div>

            {form.eventType === "TOURNAMENT" && availability.length > 0 && (
              <div>
                <label className={fieldLabel}>{t("create.tables")}</label>
                <input type="number" min={1} max={Math.max(1, freeTablesCount)} value={form.tablesCount}
                  onChange={e => set("tablesCount", Math.max(1, +e.target.value))} className={field} />
                <p className="text-xs text-[#4d6480] mt-1.5">
                  {hasSlot ? t("play.freeTablesHint", { n: freeTablesCount }) : t("play.pickSlotFirst")}
                </p>
              </div>
            )}

            <div>
              <input type="text" placeholder={t("play.eventTitle")} value={form.eventTitle}
                onChange={e => set("eventTitle", e.target.value)} className={field} />
              <p className="text-xs text-[#4d6480] mt-1.5">{t("play.eventTitleHint")}</p>
            </div>

            <div>
              <label className={fieldLabel}>{t("create.setsToWin")}</label>
              <SetsToWinPicker value={form.setsToWin} onChange={n => set("setsToWin", n)} />
            </div>

            {/* Every booking creates an event; a private knockabout has no business
                showing up in the city feed next to a club tournament. */}
            <label className="flex items-center gap-2 text-sm text-[#93a8c2]">
              <input type="checkbox" checked={!form.isPublic} onChange={e => set("isPublic", !e.target.checked)} className="w-4 h-4" />
              {t("tournament.private")}
            </label>

            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
              {busy ? t("play.booking") : t("play.bookAction")}
            </button>
          </form>
        )}
      </section>

      <section className="mb-6">
        <h2 className={`${sectionLabel} mb-2`}>{t("play.myBookings")}</h2>
        {bookings === null ? (
          <Loader className="py-8" />
        ) : bookings.length === 0 ? (
          <EmptyState text={t("play.noBookings")} />
        ) : (
          <div className="space-y-2">
            {bookings.map(b => (
              <div key={b.id} className={`${card} flex justify-between items-center p-3`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.club?.name}</p>
                  <p className="text-xs text-[#93a8c2]">{formatShortDate(b.date, lang)} &middot; {formatSlot(b.startTime, b.durationHours)}{b.table ? ` · ${t("common.table")} №${b.table.number}` : ""}</p>
                  {b.club?.address && <p className="text-xs text-[#4d6480] truncate">{b.club.address}</p>}
                  {/* A game and a tournament are the same row, so the link is the same
                      screen — only the wording follows what was booked. */}
                  {b.tournament && (
                    <Link to={`/tournament/${b.tournament.id}`} className="text-xs text-[#ccff00] font-medium">
                      {t(b.tournament.kind === "GAME" ? "play.opensGame" : "play.opensTournament")}: {b.tournament.name}
                    </Link>
                  )}
                </div>
                <button onClick={() => removeBooking(b.id)} className="text-red-400 text-xs px-2 py-1 shrink-0">{t("common.cancel")}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className={`${sectionLabel} mb-2`}>{t("play.mySubscriptions")}</h2>
        <form onSubmit={subscribe} className="flex gap-2 mb-3">
          <select value={subClubId} onChange={e => setSubClubId(e.target.value)} className={field + " flex-1"}>
            <option value="">{t("play.followClub")}</option>
            {(clubs ?? []).map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
          </select>
          <button type="submit" className={`${btnPrimary} shrink-0`}>{t("play.follow")}</button>
        </form>
        {subscriptions === null ? (
          <Loader className="py-8" />
        ) : subscriptions.length === 0 ? (
          <EmptyState text={t("play.noSubscriptions")} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {subscriptions.map(s => (
              <span key={s.id} className="flex items-center gap-1.5 bg-[#101f36] border border-[#1c3350] rounded-full pl-3 pr-1.5 py-1 text-xs">
                {s.club?.name}
                <button onClick={() => unsubscribe(s.clubId)} className="text-[#6b84a0] hover:text-white px-1">&times;</button>
              </span>
            ))}
          </div>
        )}
      </section>

      <ClubScheduleModal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        clubId={form.clubId}
        initialDate={form.date || undefined}
        selectedTableId={form.tableId}
        onSelectTable={id => set("tableId", id)}
      />
    </Layout>
  );
}
