import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import Layout from "../components/Layout";

export default function BookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [form, setForm] = useState({ club: "", date: "", startTime: "", durationHours: 1, tableNumber: "" });
  const [subClub, setSubClub] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    apiService.bookings.getMine().then(r => setBookings(r.data)).catch(console.error);
    apiService.subscriptions.getMine().then(r => setSubscriptions(r.data)).catch(console.error);
  };
  useEffect(load, []);

  const set = (key: string, val: any) => setForm({ ...form, [key]: val });

  const createBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.club || !form.date || !form.startTime) return;
    setBusy(true); setError("");
    try {
      await apiService.bookings.create({
        club: form.club,
        date: new Date(form.date).toISOString(),
        startTime: form.startTime,
        durationHours: form.durationHours,
        tableNumber: form.tableNumber ? +form.tableNumber : undefined,
      });
      setForm({ club: "", date: "", startTime: "", durationHours: 1, tableNumber: "" });
      load();
    } catch (err: any) { setError(err.response?.data?.error || "Failed to book"); }
    finally { setBusy(false); }
  };

  const removeBooking = async (id: string) => {
    try { await apiService.bookings.remove(id); load(); } catch (err: any) { setError(err.response?.data?.error || "Failed"); }
  };

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subClub) return;
    try { await apiService.subscriptions.subscribe(subClub); setSubClub(""); load(); }
    catch (err: any) { setError(err.response?.data?.error || "Failed to subscribe"); }
  };

  const unsubscribe = async (club: string) => {
    try { await apiService.subscriptions.unsubscribe(club); load(); } catch (err: any) { setError(err.response?.data?.error || "Failed"); }
  };

  return (
    <Layout>
      <h1 className="text-2xl font-bold tracking-tight mb-4">Play</h1>
      {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20 mb-4">{error}</div>}

      <section className="mb-6">
        <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-2">Book a table</h2>
        <form onSubmit={createBooking} className="bg-[#101f36] p-4 rounded-lg border border-[#1c3350] space-y-3">
          <input type="text" placeholder="Club" value={form.club} onChange={e => set("club", e.target.value)}
            className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" required />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.date} onChange={e => set("date", e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" required />
            <input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#6b84a0] mb-1.5 uppercase tracking-wider">Hours</label>
              <input type="number" min={0.5} step={0.5} value={form.durationHours} onChange={e => set("durationHours", +e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-[#6b84a0] mb-1.5 uppercase tracking-wider">Table (optional)</label>
              <input type="number" min={1} value={form.tableNumber} onChange={e => set("tableNumber", e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" />
            </div>
          </div>
          <button type="submit" disabled={busy} className="w-full bg-[#ccff00] text-[#0a1628] py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
            {busy ? "Booking..." : "Book"}
          </button>
        </form>
      </section>

      <section className="mb-6">
        <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-2">My bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#6b84a0] bg-[#101f36] rounded-lg border border-[#1c3350]">No bookings yet</p>
        ) : (
          <div className="space-y-2">
            {bookings.map(b => (
              <div key={b.id} className="flex justify-between items-center bg-[#101f36] p-3 rounded-lg border border-[#1c3350]">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.club}</p>
                  <p className="text-xs text-[#6b84a0]">{new Date(b.date).toLocaleDateString()} &middot; {b.startTime} &middot; {b.durationHours}h{b.tableNumber ? ` · Table ${b.tableNumber}` : ""}</p>
                </div>
                <button onClick={() => removeBooking(b.id)} className="text-red-400 text-xs px-2 py-1 shrink-0">Cancel</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-2">My subscriptions</h2>
        <form onSubmit={subscribe} className="flex gap-2 mb-3">
          <input type="text" placeholder="Follow a club..." value={subClub} onChange={e => setSubClub(e.target.value)}
            className="flex-1 px-3 py-2.5 bg-[#101f36] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" />
          <button type="submit" className="px-4 py-2.5 bg-[#ccff00] text-[#0a1628] rounded-lg text-sm font-bold">Follow</button>
        </form>
        {subscriptions.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#6b84a0] bg-[#101f36] rounded-lg border border-[#1c3350]">Not following any clubs yet</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subscriptions.map(s => (
              <span key={s.id} className="flex items-center gap-1.5 bg-[#101f36] border border-[#1c3350] rounded-full pl-3 pr-1.5 py-1 text-xs">
                {s.club}
                <button onClick={() => unsubscribe(s.club)} className="text-[#6b84a0] hover:text-white px-1">&times;</button>
              </span>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
