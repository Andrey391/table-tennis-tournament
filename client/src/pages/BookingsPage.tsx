import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import { useT } from "../i18n";
import { formatShortDate, formatSlot } from "../lib/format";

const DURATIONS = [1, 1.5, 2, 3];

export default function BookingsPage() {
  const { t, lang } = useT();
  const [clubs, setClubs] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [form, setForm] = useState({ clubId: "", tableId: "", date: "", startTime: "", durationHours: 1 });
  const [newClub, setNewClub] = useState({ name: "", city: "", address: "", phone: "" });
  const [showAddClub, setShowAddClub] = useState(false);
  const [subClubId, setSubClubId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    apiService.clubs.getAll().then(r => setClubs(r.data)).catch(console.error);
    apiService.bookings.getMine().then(r => setBookings(r.data)).catch(console.error);
    apiService.subscriptions.getMine().then(r => setSubscriptions(r.data)).catch(console.error);
  };
  useEffect(load, []);

  // Which tables are already taken that day, so a clashing slot is visible before submitting.
  useEffect(() => {
    if (!form.clubId || !form.date) { setAvailability([]); return; }
    apiService.clubs.availability(form.clubId, new Date(form.date).toISOString())
      .then(r => setAvailability(r.data)).catch(console.error);
  }, [form.clubId, form.date]);

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val, ...(key === "clubId" ? { tableId: "" } : {}) }));

  const createBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clubId || !form.date || !form.startTime) return;
    setBusy(true); setError("");
    try {
      await apiService.bookings.create({
        clubId: form.clubId,
        tableId: form.tableId || undefined,
        date: new Date(form.date).toISOString(),
        startTime: form.startTime,
        durationHours: form.durationHours,
      });
      setForm({ clubId: form.clubId, tableId: "", date: "", startTime: "", durationHours: 1 });
      load();
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

  const field = "w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none";
  const sectionLabel = "text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-2";

  return (
    <Layout>
      <h1 className="text-2xl font-bold tracking-tight mb-4">{t("play.title")}</h1>
      {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-4">{error}</div>}

      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className={sectionLabel + " mb-0"}>{t("play.book")}</h2>
          <button onClick={() => setShowAddClub(v => !v)} className="text-xs text-[#ccff00] font-medium">{t("play.addClub")}</button>
        </div>

        {showAddClub && (
          <form onSubmit={addClub} className="bg-[#101f36] p-4 rounded-lg border border-[#1c3350] space-y-3 mb-3">
            <input type="text" placeholder={t("play.clubName")} value={newClub.name} onChange={e => setNewClub({ ...newClub, name: e.target.value })} className={field} required />
            <input type="text" placeholder={t("common.city")} value={newClub.city} onChange={e => setNewClub({ ...newClub, city: e.target.value })} className={field} required />
            <input type="text" placeholder={t("play.clubAddress")} value={newClub.address} onChange={e => setNewClub({ ...newClub, address: e.target.value })} className={field} />
            <input type="text" placeholder={t("play.clubPhone")} value={newClub.phone} onChange={e => setNewClub({ ...newClub, phone: e.target.value })} className={field} />
            <button type="submit" className="w-full bg-[#ccff00] text-[#0a1628] py-2.5 rounded-lg text-sm font-bold">{t("common.save")}</button>
          </form>
        )}

        {clubs.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#6b84a0] bg-[#101f36] rounded-lg border border-[#1c3350] px-4">{t("play.noClubs")}</p>
        ) : (
          <form onSubmit={createBooking} className="bg-[#101f36] p-4 rounded-lg border border-[#1c3350] space-y-3">
            <select value={form.clubId} onChange={e => set("clubId", e.target.value)} className={field} required>
              <option value="">{t("play.selectClub")}</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className={field} required />
              <input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} className={field} required />
            </div>

            <div>
              <label className="block text-xs text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("common.hours")}</label>
              <div className="flex gap-2">
                {DURATIONS.map(d => (
                  <button key={d} type="button" onClick={() => set("durationHours", d)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                      form.durationHours === d ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
                    }`}>{String(d).replace(".", ",")}</button>
                ))}
              </div>
            </div>

            {availability.length > 0 && (
              <div>
                <label className="block text-xs text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("common.table")}</label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => set("tableId", "")}
                    className={`px-3 py-2 rounded-lg text-sm border ${!form.tableId ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"}`}>
                    {t("play.anyTable")}
                  </button>
                  {availability.map(tbl => (
                    <button key={tbl.id} type="button" onClick={() => set("tableId", tbl.id)}
                      className={`px-3 py-2 rounded-lg text-sm border text-left ${form.tableId === tbl.id ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"}`}>
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

            <button type="submit" disabled={busy} className="w-full bg-[#ccff00] text-[#0a1628] py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
              {busy ? t("play.booking") : t("play.bookAction")}
            </button>
          </form>
        )}
      </section>

      <section className="mb-6">
        <h2 className={sectionLabel}>{t("play.myBookings")}</h2>
        {bookings.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#6b84a0] bg-[#101f36] rounded-lg border border-[#1c3350]">{t("play.noBookings")}</p>
        ) : (
          <div className="space-y-2">
            {bookings.map(b => (
              <div key={b.id} className="flex justify-between items-center bg-[#101f36] p-3 rounded-lg border border-[#1c3350]">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.club?.name}</p>
                  <p className="text-xs text-[#93a8c2]">{formatShortDate(b.date, lang)} &middot; {formatSlot(b.startTime, b.durationHours)}{b.table ? ` · ${t("common.table")} №${b.table.number}` : ""}</p>
                  {b.club?.address && <p className="text-xs text-[#4d6480] truncate">{b.club.address}</p>}
                </div>
                <button onClick={() => removeBooking(b.id)} className="text-red-400 text-xs px-2 py-1 shrink-0">{t("common.cancel")}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className={sectionLabel}>{t("play.mySubscriptions")}</h2>
        <form onSubmit={subscribe} className="flex gap-2 mb-3">
          <select value={subClubId} onChange={e => setSubClubId(e.target.value)} className={field + " flex-1"}>
            <option value="">{t("play.followClub")}</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
          </select>
          <button type="submit" className="px-4 py-2.5 bg-[#ccff00] text-[#0a1628] rounded-lg text-sm font-bold shrink-0">{t("play.follow")}</button>
        </form>
        {subscriptions.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#6b84a0] bg-[#101f36] rounded-lg border border-[#1c3350]">{t("play.noSubscriptions")}</p>
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
    </Layout>
  );
}
