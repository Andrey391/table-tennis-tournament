import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import EventForm from "../components/EventForm";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useT } from "../i18n";
import { formatShortDate, formatSlot } from "../lib/format";
import { card, errorBox, pageTitle, sectionLabel } from "../lib/ui";

export default function BookingsPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  // null until the first answer, so "no bookings" only ever means it.
  const [bookings, setBookings] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  // Collapsed by default so "мои брони" is visible without scrolling past the
  // form first — it only opens when the user actually wants to book something.
  // `?club=` comes from a club page's "book a table": the form opens with that
  // venue already picked.
  const [searchParams] = useSearchParams();
  const clubParam = searchParams.get("club") || "";
  const [showForm, setShowForm] = useState(!!clubParam);

  const load = () => {
    // On failure a list settles to empty rather than spinning forever.
    const failed = (set: (v: any[] | ((p: any[] | null) => any[])) => void) => (e: unknown) => { console.error(e); set(p => p ?? []); };
    apiService.bookings.getMine().then(r => setBookings(r.data)).catch(failed(setBookings));
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

  const [payingId, setPayingId] = useState<string | null>(null);
  // Online payment is off until the operator wires up a provider; a priced booking
  // is then paid at the club, and a "Pay" button would promise something that isn't there.
  const [payments, setPayments] = useState<{ enabled: boolean; test: boolean }>({ enabled: false, test: false });
  useEffect(() => { apiService.bookings.paymentConfig().then(r => setPayments(r.data)).catch(() => {}); }, []);
  const payBooking = async (id: string) => {
    setPayingId(id);
    setError("");
    try { await apiService.bookings.pay(id); load(); }
    catch (err: any) { setError(err.response?.data?.error || t("play.payFailed")); }
    finally { setPayingId(null); }
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
        {showForm && <EventForm defaultEventType="GAME" initialClubId={clubParam} onCreated={onCreated} />}
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
                  {b.priceTotal != null && (
                    <p className="text-xs mt-1">
                      <span className="text-[#93a8c2]">{t("play.bookingPrice")}: {b.priceTotal} {t("play.currency")}</span>{" "}
                      {b.paymentStatus === "PAID" && <span className="text-[#ccff00]">&middot; {t("play.paid")}{b.paymentRef?.startsWith("mock_") && ` (${t("play.testPayment")})`}</span>}
                      {b.paymentStatus === "UNPAID" && !payments.enabled && <span className="text-[#6b84a0]">&middot; {t("play.payAtClub")}</span>}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {b.priceTotal != null && b.paymentStatus === "UNPAID" && payments.enabled && (
                    <button onClick={() => payBooking(b.id)} disabled={payingId === b.id} className="text-[#ccff00] text-xs px-2 py-1 font-bold disabled:opacity-50">
                      {payingId === b.id ? t("play.paying") : t("play.pay")}
                    </button>
                  )}
                  <button onClick={() => removeBooking(b.id)} className="text-red-400 text-xs px-2 py-1">{t("common.cancel")}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
