import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import EventForm from "../components/EventForm";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useT } from "../i18n";
import { formatShortDate, formatSlot } from "../lib/format";
import { btnPrimary, card, errorBox, field, pageTitle, sectionLabel } from "../lib/ui";

export default function BookingsPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  // null until the first answer, so "no bookings" only ever means it.
  const [clubs, setClubs] = useState<any[] | null>(null);
  const [bookings, setBookings] = useState<any[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<any[] | null>(null);
  const [subClubId, setSubClubId] = useState("");
  const [error, setError] = useState("");
  // Collapsed by default so "мои брони" is visible without scrolling past the
  // form first — it only opens when the user actually wants to book something.
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    // On failure a list settles to empty rather than spinning forever.
    const failed = (set: (v: any[] | ((p: any[] | null) => any[])) => void) => (e: unknown) => { console.error(e); set(p => p ?? []); };
    apiService.clubs.getAll().then(r => setClubs(r.data)).catch(failed(setClubs));
    apiService.bookings.getMine().then(r => setBookings(r.data)).catch(failed(setBookings));
    apiService.subscriptions.getMine().then(r => setSubscriptions(r.data)).catch(failed(setSubscriptions));
  };
  useEffect(load, []);

  // The booking exists to hold a table for an event, and that event is where
  // the next step lives — adding an opponent and starting. Land there instead
  // of leaving people to hunt for it in the feed. A club-less game has no
  // booking wrapper, so the created row is itself the event.
  const onCreated = (created: any) => {
    load();
    setShowForm(false);
    const eventId = created?.tournament?.id || created?.id;
    if (eventId) navigate(`/tournament/${eventId}`);
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
          <button type="button" onClick={() => setShowForm(v => !v)} className="text-sm text-[#ccff00] font-bold">
            {showForm ? t("common.cancel") : `+ ${t("play.bookAction")}`}
          </button>
        </div>
        {showForm && <EventForm defaultEventType="GAME" onCreated={onCreated} />}
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
    </Layout>
  );
}
