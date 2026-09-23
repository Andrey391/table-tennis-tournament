import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import { useT } from "../i18n";
import { formatShortDate, formatSlot } from "../lib/format";
import { btnPrimary, card, errorBox, field, fieldLabel } from "../lib/ui";
import SetsToWinPicker from "./SetsToWinPicker";
import ClubScheduleModal from "./ClubScheduleModal";
import Loader from "./Loader";
import EmptyState from "./EmptyState";

// "HH:MM" -> minutes since midnight, for turning a start/end pair into a duration.
const parseHM = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const pad2 = (n: number) => String(n).padStart(2, "0");
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toTimeStr = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
// Current time rounded up to the next full hour — never earlier than now, so it
// never lands in the past for the "start" field's default.
const roundedUpHour = () => {
  const d = new Date();
  if (d.getMinutes() > 0 || d.getSeconds() > 0) d.setHours(d.getHours() + 1);
  d.setMinutes(0, 0, 0);
  return d;
};
const addHour = (hm: string) => { const [h, m] = hm.split(":").map(Number); return `${pad2((h + 1) % 24)}:${pad2(m)}`; };
// A suggested slot's date is a calendar-day label (UTC midnight), not a real
// instant — read with UTC getters and rebuilt as a local Date on those same
// Y/M/D so it prints and re-submits as that calendar day for every viewer,
// not one shifted by their own timezone offset.
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return { dateStr: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`, localDate: new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) };
};

// Mirrors the server's bookingsOverlap (shared/booking.ts) so a table already
// taken over the chosen slot can be greyed out before submitting, not just
// rejected afterwards.
const overlaps = (aStart: string, aHours: number, bStart: string, bHours: number) => {
  const a1 = parseHM(aStart), a2 = a1 + Math.round(aHours * 60);
  const b1 = parseHM(bStart), b2 = b1 + Math.round(bHours * 60);
  return a1 < b2 && b1 < a2;
};

// One form for scheduling any event, used both on /bookings (default: a game)
// and on /tournament/new (default: a tournament). Picking a club turns the
// submit into a real table booking (POST /bookings, which creates the booking
// and the event together); with no club there is no table to hold, so the
// event is created directly and — since a tournament's rounds need a venue —
// only a plain game is offered. Managing a club's own tables/details lives
// solely on /clubs now; this form only ever *selects* among what's there.
export default function EventForm({
  defaultEventType = "GAME",
  initialClubId = "",
  onCreated,
}: {
  defaultEventType?: "GAME" | "TOURNAMENT";
  // Preselected venue, when the form is opened from a club's own page.
  initialClubId?: string;
  onCreated: (result: any) => void;
}) {
  const { t, lang } = useT();
  const [clubs, setClubs] = useState<any[] | null>(null);
  const [availability, setAvailability] = useState<any[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<{ date: string; startTime: string } | null>(null);
  const [form, setForm] = useState(() => {
    const startDate = roundedUpHour();
    return {
      clubId: initialClubId, tableId: "", date: toDateStr(startDate), startTime: toTimeStr(startDate), endTime: addHour(toTimeStr(startDate)),
      eventType: defaultEventType, eventTitle: "", description: "",
      setsToWin: 3, tablesCount: 4, maxPlayers: "", minRating: "", maxRating: "", ratingWeight: "0.5",
      isPublic: true, access: "OPEN" as "OPEN" | "CLOSED",
    };
  });
  // Whether the user has touched "end" directly, so the start-time auto-fill
  // stops overwriting a choice they made on purpose.
  const [endTouched, setEndTouched] = useState(false);

  useEffect(() => { apiService.clubs.getAll().then(r => setClubs(r.data)).catch(e => { console.error(e); setClubs(p => p ?? []); }); }, []);

  const loadAvailability = () => {
    if (!form.clubId || !form.date) { setAvailability([]); return; }
    apiService.clubs.availability(form.clubId, new Date(form.date).toISOString())
      .then(r => setAvailability(r.data)).catch(console.error);
  };
  useEffect(loadAvailability, [form.clubId, form.date]);

  const set = (key: string, val: any) => setForm(f => ({
    ...f, [key]: val,
    ...(key === "clubId" ? { tableId: "" } : {}),
    // Keep "end" one hour after "start" until the user has picked their own end time.
    ...(key === "startTime" && !endTouched ? { endTime: addHour(val) } : {}),
  }));

  // No club selected means no table to hold, so a tournament (which needs a
  // venue for its rounds) isn't on offer — only a simple game.
  const effectiveType: "GAME" | "TOURNAMENT" = form.clubId ? form.eventType : "GAME";

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
  // Keep the tables-count field from claiming more tables than are actually
  // free for the chosen slot — it defaults to 4 before availability is known,
  // and a slot with fewer free tables must pull it back down.
  useEffect(() => {
    if (!hasSlot || availability.length === 0) return;
    if (form.tablesCount > freeTablesCount) set("tablesCount", Math.max(1, freeTablesCount));
  }, [freeTablesCount, hasSlot, availability.length]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.startTime || !form.endTime) return;
    if (form.date === toDateStr(new Date()) && form.startTime < toTimeStr(new Date())) {
      setError(t("play.startInPast"));
      return;
    }
    let diffMinutes = parseHM(form.endTime) - parseHM(form.startTime);
    if (diffMinutes <= 0) diffMinutes += 24 * 60;
    const durationHours = diffMinutes / 60;
    if (durationHours < 0.5 || durationHours > 8) { setError(t("play.durationRange")); return; }
    if (effectiveType === "TOURNAMENT" && availability.length > 0 && form.tablesCount > freeTablesCount) {
      setError(t("play.notEnoughTables", { n: freeTablesCount }));
      return;
    }
    setBusy(true); setError(""); setSuggestion(null);
    // The actual instant the event starts/ends, resolved in this browser's own
    // timezone — the server only ever sees "HH:MM" strings otherwise and would
    // have to guess an instant, guessing wrong for anyone not in UTC.
    const startsAt = new Date(`${form.date}T${form.startTime}`);
    const endsAt = new Date(startsAt.getTime() + Math.round(durationHours * 60) * 60_000);
    try {
      let created;
      if (form.clubId) {
        created = await apiService.bookings.create({
          clubId: form.clubId,
          tableId: form.tableId || undefined,
          date: new Date(form.date).toISOString(),
          startTime: form.startTime,
          durationHours,
          eventStartTime: startsAt.toISOString(),
          eventEndTime: endsAt.toISOString(),
          eventType: effectiveType,
          eventTitle: form.eventTitle || undefined,
          setsToWin: form.setsToWin,
          tablesCount: effectiveType === "TOURNAMENT" ? form.tablesCount : undefined,
          isPublic: form.isPublic,
          ...(effectiveType === "TOURNAMENT" ? {
            description: form.description || undefined,
            maxPlayers: form.maxPlayers ? +form.maxPlayers : undefined,
            minRating: form.minRating ? +form.minRating : undefined,
            maxRating: form.maxRating ? +form.maxRating : undefined,
            ratingWeight: form.ratingWeight ? +form.ratingWeight : undefined,
            access: form.access,
          } : {}),
        });
      } else {
        // Nothing to book — a plain game created directly, no table involved.
        created = await apiService.tournaments.create({
          kind: "GAME",
          name: form.eventTitle || undefined,
          startTime: startsAt.toISOString(),
          endTime: endsAt.toISOString(),
          setsToWin: form.setsToWin,
          isPublic: form.isPublic,
        });
      }
      const startDate = roundedUpHour();
      setForm(f => ({ ...f, tableId: "", date: toDateStr(startDate), startTime: toTimeStr(startDate), endTime: addHour(toTimeStr(startDate)), eventTitle: "", description: "" }));
      setEndTouched(false);
      onCreated(created.data);
    } catch (err: any) {
      const data = err.response?.data;
      setError(data?.error || t("common.failed"));
      if (data?.suggestion) setSuggestion(data.suggestion);
    }
    finally { setBusy(false); }
  };

  // Apply a server-suggested next-free slot to the form so the user can just
  // resubmit rather than hunting for a free time by hand.
  const applySuggestion = () => {
    if (!suggestion) return;
    const { dateStr } = dayLabel(suggestion.date);
    setForm(f => ({ ...f, date: dateStr, startTime: suggestion.startTime, endTime: addHour(suggestion.startTime) }));
    setEndTouched(false);
    setSuggestion(null);
    setError("");
  };

  if (clubs === null) return <Loader className="py-8" />;

  return (
    <form onSubmit={submit} className={`${card} p-4 space-y-3`}>
      {error && (
        <div className={errorBox}>
          <p>{error}</p>
          {suggestion && (
            <button type="button" onClick={applySuggestion} className="mt-2 text-[#ccff00] font-medium underline underline-offset-2">
              {t("play.useSuggestedTime", { date: formatShortDate(dayLabel(suggestion.date).localDate, lang), time: suggestion.startTime })}
            </button>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={fieldLabel}>{t("create.club")}</label>
          <Link to="/clubs" className="text-xs text-[#ccff00] font-medium">{t("play.manageClubs")}</Link>
        </div>
        {clubs.length === 0 ? (
          <EmptyState text={t("play.noClubs")} />
        ) : (
          <select value={form.clubId} onChange={e => set("clubId", e.target.value)} className={field}>
            <option value="">{t("create.noClub")}</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name} &middot; {c.city}</option>)}
          </select>
        )}
      </div>

      <input type="date" min={toDateStr(new Date())} value={form.date} onChange={e => set("date", e.target.value)} className={field} required />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel}>{t("create.start")}</label>
          <input type="time" min={form.date === toDateStr(new Date()) ? toTimeStr(new Date()) : undefined}
            value={form.startTime} onChange={e => set("startTime", e.target.value)} className={field} required />
        </div>
        <div>
          <label className={fieldLabel}>{t("create.end")}</label>
          <input type="time" value={form.endTime} onChange={e => { setEndTouched(true); set("endTime", e.target.value); }} className={field} required />
        </div>
      </div>

      {form.clubId && availability.length > 0 && (
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
        {form.clubId ? (
          <div className="flex gap-2">
            {(["GAME", "TOURNAMENT"] as const).map(kind => (
              <button key={kind} type="button" onClick={() => set("eventType", kind)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                  form.eventType === kind ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
                }`}>{t(kind === "GAME" ? "play.asGame" : "play.asTournament")}</button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#4d6480]">{t("play.gameOnlyNoClub")}</p>
        )}
      </div>

      {effectiveType === "TOURNAMENT" && (
        <>
          {availability.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>{t("create.tables")}</label>
                <input type="number" min={1} max={Math.max(1, freeTablesCount)} value={form.tablesCount}
                  onChange={e => set("tablesCount", Math.max(1, +e.target.value))} className={field} />
                <p className="text-xs text-[#4d6480] mt-1.5">
                  {hasSlot ? t("play.freeTablesHint", { n: freeTablesCount }) : t("play.pickSlotFirst")}
                </p>
              </div>
              <div>
                <label className={fieldLabel}>{t("create.maxPlayers")}</label>
                <input type="number" min={2} placeholder="—" value={form.maxPlayers} onChange={e => set("maxPlayers", e.target.value)} className={field} />
                <p className="text-xs text-[#4d6480] mt-1.5">{t("create.maxPlayersHint")}</p>
              </div>
            </div>
          )}

          {availability.length === 0 && (
            <div>
              <label className={fieldLabel}>{t("create.maxPlayers")}</label>
              <input type="number" min={2} placeholder="—" value={form.maxPlayers} onChange={e => set("maxPlayers", e.target.value)} className={field} />
              <p className="text-xs text-[#4d6480] mt-1.5">{t("create.maxPlayersHint")}</p>
            </div>
          )}

          <div>
            <label className={fieldLabel}>{t("create.description")} <span className="normal-case text-[#4d6480]">({t("common.optional")})</span></label>
            <textarea rows={3} placeholder={t("create.descriptionPlaceholder")} value={form.description} onChange={e => set("description", e.target.value)} className={field} />
          </div>

          <div>
            <label className={fieldLabel}>{t("create.ratingRange")} <span className="normal-case text-[#4d6480]">({t("common.optional")})</span></label>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" placeholder={t("create.min")} value={form.minRating} onChange={e => set("minRating", e.target.value)} className={field} />
              <input type="number" placeholder={t("create.max")} value={form.maxRating} onChange={e => set("maxRating", e.target.value)} className={field} />
            </div>
            <p className="text-xs text-[#4d6480] mt-1.5">{t("create.ratingHint")}</p>
          </div>

          <div>
            <label className={fieldLabel}>{t("create.ratingWeight")}</label>
            <input type="number" min={0.1} max={1} step={0.1} value={form.ratingWeight} onChange={e => set("ratingWeight", e.target.value)} className={field} />
            <p className="text-xs text-[#4d6480] mt-1.5">{t("create.ratingWeightHint")}</p>
          </div>

          <div>
            <label className={fieldLabel}>{t("tournament.access.label")}</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => set("access", "OPEN")}
                className={`flex-1 py-2 rounded-lg text-sm border ${form.access === "OPEN" ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00] font-bold" : "border-[#1c3350] text-[#93a8c2]"}`}>
                {t("tournament.access.open")}
              </button>
              <button type="button" onClick={() => set("access", "CLOSED")}
                className={`flex-1 py-2 rounded-lg text-sm border ${form.access === "CLOSED" ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00] font-bold" : "border-[#1c3350] text-[#93a8c2]"}`}>
                {t("tournament.access.closed")}
              </button>
            </div>
            <p className="text-xs text-[#4d6480] mt-1.5">{t("tournament.access.hint")}</p>
          </div>
        </>
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

      {/* Every event created here — booked or not — can stay out of the public
          feed while its participants still see it. */}
      <label className="flex items-center gap-2 text-sm text-[#93a8c2]">
        <input type="checkbox" checked={!form.isPublic} onChange={e => set("isPublic", !e.target.checked)} className="w-4 h-4" />
        {t("tournament.private")}
      </label>

      <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? t("play.booking") : (form.clubId ? t("play.bookAction") : t("common.create"))}
      </button>

      <ClubScheduleModal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        clubId={form.clubId}
        initialDate={form.date || undefined}
        selectedTableId={form.tableId}
        onSelectTable={id => set("tableId", id)}
      />
    </form>
  );
}
