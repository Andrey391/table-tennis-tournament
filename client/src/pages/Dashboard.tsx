import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import ScopeToggle from "../components/ScopeToggle";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import EventCard from "../components/EventCard";
import PlayerScheduleModal from "../components/PlayerScheduleModal";
import { useT } from "../i18n";
import { playerName, matchScoreLine, cityKey } from "../lib/format";
import TryDemoButton from "../components/TryDemoButton";
import { demoTournamentPath } from "../lib/tour";
import { btnPrimary, card, sectionLabel } from "../lib/ui";

// Statuses that still have something to play: roster open, or rounds under way.
const ACTIVE_STATUSES = "DRAFT,ACTIVE";

export default function Dashboard() {
  const { t } = useT();
  const { token, user } = useAuth();
  const isGuest = !token;
  const demoPath = demoTournamentPath();
  // null = the feed has not answered yet; [] = it did, and there is nothing in it.
  const [tournaments, setTournaments] = useState<any[] | null>(null);
  const [games, setGames] = useState<any[] | null>(null);
  const [cities, setCities] = useState<{ city: string; clubs: number }[]>([]);
  // Signup asks for a city; opening the app in someone else's city is not what
  // that answer meant. A stored choice still wins — it was made deliberately.
  const [city, setCity] = useState<string>(() => { try { return localStorage.getItem("city") ?? ""; } catch { return ""; } });
  const [cityTouched, setCityTouched] = useState(() => { try { return localStorage.getItem("city") !== null; } catch { return false; } });
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [myMatches, setMyMatches] = useState<any[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);

  // "Your match" on the home screen: during a club night this is what a player opens
  // the app for. Polled like the event page, so a newly paired round shows up here.
  useEffect(() => {
    if (isGuest) { setMyMatches([]); return; }
    const load = () => apiService.matches.mine().then(r => setMyMatches(r.data)).catch(console.error);
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [isGuest]);

  useEffect(() => { apiService.clubs.cities().then(r => setCities(r.data)).catch(console.error); }, []);
  useEffect(() => {
    if (!cityTouched && user?.city) setCity(user.city);
  }, [user?.city, cityTouched]);
  useEffect(() => {
    // /tournaments/mine needs an account; a guest only ever sees the open feed.
    // The home screen is for what is still going on: events that are being filled or
    // played. Finished and cancelled ones live under Results.
    const mine = scope === "mine" && !isGuest;
    const fetchTournaments = mine
      ? apiService.tournaments.getMine({ kind: "TOURNAMENT", status: ACTIVE_STATUSES })
      : apiService.tournaments.getAll({ kind: "TOURNAMENT", status: ACTIVE_STATUSES, ...(city ? { city } : {}) });
    const fetchGames = mine
      ? apiService.tournaments.getMine({ kind: "GAME", status: ACTIVE_STATUSES })
      : apiService.tournaments.getAll({ kind: "GAME", status: ACTIVE_STATUSES, ...(city ? { city } : {}) });
    // Switching city or scope must not leave the previous list on screen as if it were
    // the answer, and a slow earlier response must not overwrite a newer one.
    // getAll (public feed) returns { items, nextCursor }; getMine still returns a plain array.
    let stale = false;
    setTournaments(null);
    setGames(null);
    fetchTournaments.then(r => { if (!stale) setTournaments(mine ? r.data : r.data.items); }).catch(e => { console.error(e); if (!stale) setTournaments([]); });
    fetchGames.then(r => { if (!stale) setGames(mine ? r.data : r.data.items); }).catch(e => { console.error(e); if (!stale) setGames([]); });
    if (cityTouched) { try { localStorage.setItem("city", city); } catch { /* choice just won't persist */ } }
    return () => { stale = true; };
  }, [city, scope, cityTouched, isGuest]);

  // Two-level sort: events being played right now go first (that is what someone
  // opening the app is looking for), then within each group, furthest-out start
  // time first. Undated events sort last within their group.
  const sortEvents = (list: any[]) => [...list].sort((a, b) => {
    const aActive = a.status === "ACTIVE" ? 0 : 1;
    const bActive = b.status === "ACTIVE" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aTime = a.startTime ? new Date(a.startTime).getTime() : -Infinity;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : -Infinity;
    return bTime - aTime;
  });
  const events = sortEvents(tournaments ?? []);
  const gameEvents = sortEvents(games ?? []);

  // One entry per city, however it was typed. The server's list goes first so its
  // spelling wins; the viewer's own city and a remembered choice are added only when
  // no listed city is the same place ("москва" is not a second Moscow).
  const cityOptions: string[] = [];
  for (const c of [...cities.map(c => c.city), user?.city, city]) {
    if (c && c.trim() && !cityOptions.some(o => cityKey(o) === cityKey(c))) cityOptions.push(c.trim());
  }
  cityOptions.sort((a, b) => a.localeCompare(b));
  // The <select> only shows an option whose value equals its own, so map the chosen
  // city onto the spelling in the list.
  const selectedCity = cityOptions.find(o => cityKey(o) === cityKey(city)) ?? "";

  return (
    <Layout>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-[#6b84a0]">{t("home.yourCity")}</p>
          <select value={selectedCity} onChange={e => { setCityTouched(true); setCity(e.target.value); }}
            className="bg-transparent text-[#ccff00] font-semibold text-base focus:outline-none -ml-1">
            <option value="" className="bg-[#101f36] text-white">{t("home.allCities")}</option>
            {cityOptions.map(c => <option key={cityKey(c)} value={c} className="bg-[#101f36] text-white">{c}</option>)}
          </select>
        </div>
      </div>

      {/* A demo visitor who taps Home has no other way back: their event is not
          in the public feed, and it is the only thing their account is for. */}
      {user?.isDemo && demoPath && (
        <Link to={demoPath} className="block rounded-lg p-4 mb-3 border border-[#ccff00]/40 bg-[#142a44]">
          <p className="text-[11px] text-[#ccff00] uppercase tracking-wider">{t("demo.title")}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-base font-bold">{t("demo.backToEvent")}</span>
            <span className="text-xs text-[#ccff00] font-medium">&rarr;</span>
          </div>
        </Link>
      )}

      {myMatches.map(m => (
        <Link key={m.id} to={`/tournament/${m.tournament.id}/match/${m.id}`}
          className="block rounded-lg p-4 mb-3 border bg-[#ccff00]/10 border-[#ccff00]/40">
          <p className="text-[11px] text-[#ccff00] uppercase tracking-wider truncate">{t("tournament.myMatch")} &middot; {m.tournament.name}</p>
          <p className="text-base font-bold mt-1 truncate">
            {t("tournament.myMatchVs", { name: playerName(m.player1Id === user?.id ? m.player2 : m.player1) })}
          </p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-[#93a8c2]">
              {t("tournament.round", { n: m.round })}
              {m.tableNumber ? ` \u00b7 ${t("tournament.myMatchTable", { n: m.tableNumber })}` : ""}
              {m.status === "IN_PROGRESS" && <span className="font-mono ml-2">{matchScoreLine(m)}</span>}
            </span>
            <span className="text-xs text-[#ccff00] font-medium">{t("tournament.openMatch")} &rarr;</span>
          </div>
        </Link>
      ))}

      <div className="relative overflow-hidden rounded-2xl border border-[#1c3350] bg-gradient-to-br from-[#142a44] via-[#101f36] to-[#0a1628] p-5 mb-5">
        <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-[#ccff00]/10 blur-2xl" />
        <p className="relative text-[11px] font-medium uppercase tracking-wider text-[#ccff00] mb-2">{t("home.badge")}</p>
        <h1 className="relative text-3xl font-bold leading-[1.1] tracking-tight" dangerouslySetInnerHTML={{ __html: t("home.title") }} />
        <p className="relative text-sm text-[#93a8c2] mt-2.5 max-w-[34ch]">{t("home.subtitle")}</p>
        <Link to={isGuest ? "/login" : "/tournament/new"}
          className={`${btnPrimary} relative inline-flex mt-4`}>
          {isGuest ? t("auth.signIn") : t("home.newTournament")}
        </Link>
        {isGuest && (
          <div className="relative mt-3 max-w-[34ch]">
            <TryDemoButton variant="ghost" />
            <p className="text-[11px] text-[#4d6480] mt-2">{t("guest.viewOnly")}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {([
          { to: "/results", label: "home.tiles.results", d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
          // Booking a table and looking at your own match schedule both need
          // an account, so these tiles are simply absent for a guest.
          ...(isGuest ? [] : [{ to: "/bookings", label: "home.tiles.bookings", d: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" }]),
          { to: "/games", label: "games.title", d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M4.9 4.9c3.5 1 6.2 3.7 7.1 7.1M19.1 19.1c-3.5-1-6.2-3.7-7.1-7.1" },
          { to: "/clubs", label: "home.tiles.clubs", d: "M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11ZM12 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" },
          ...(isGuest ? [] : [{ onClick: () => setShowSchedule(true), label: "home.tiles.schedule", d: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2" }]),
        ] as ({ to: string; label: string; d: string; onClick?: undefined } | { to?: undefined; label: string; d: string; onClick: () => void })[]).map(tile => tile.to ? (
          <Link key={tile.to} to={tile.to} className={`${card} p-3.5 flex flex-col items-start gap-2 active:bg-[#1c3350] transition-colors`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#ccff00" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d={tile.d} />
            </svg>
            <span className="text-sm font-medium">{t(tile.label)}</span>
          </Link>
        ) : (
          <button key={tile.label} type="button" onClick={tile.onClick} className={`${card} p-3.5 flex flex-col items-start gap-2 active:bg-[#1c3350] transition-colors text-left`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#ccff00" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d={tile.d} />
            </svg>
            <span className="text-sm font-medium">{t(tile.label)}</span>
          </button>
        ))}
      </div>

      <ScopeToggle scope={scope} onChange={setScope} labels={[t("home.scopeAll"), t("home.scopeMine")]} hidden={isGuest} />

      <div className="flex justify-between items-baseline mb-2.5">
        <h2 className={sectionLabel}>{t("home.tournaments")}</h2>
        {!!tournaments?.length && <span className="text-xs text-[#4d6480]">{tournaments.length}</span>}
      </div>

      {tournaments === null ? (
        <Loader />
      ) : tournaments.length === 0 ? (
        <EmptyState text={t(scope === "mine" && !isGuest ? "home.mineEmpty" : "home.empty")}>
          {!isGuest && <Link to="/tournament/new" className={`${btnPrimary} inline-block`}>{t("home.createFirst")}</Link>}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {events.map(tr => <EventCard key={tr.id} tr={tr} />)}
        </div>
      )}

      <div className="flex justify-between items-baseline mb-2.5 mt-5">
        <h2 className={sectionLabel}>{t("games.title")}</h2>
        {!!gameEvents.length && <span className="text-xs text-[#4d6480]">{gameEvents.length}</span>}
      </div>

      {games === null ? (
        <Loader />
      ) : gameEvents.length === 0 ? (
        <EmptyState text={t("games.empty")} />
      ) : (
        <div className="space-y-2">
          {gameEvents.map(tr => <EventCard key={tr.id} tr={tr} />)}
        </div>
      )}

      {user && <PlayerScheduleModal open={showSchedule} onClose={() => setShowSchedule(false)} playerId={user.id} />}
    </Layout>
  );
}
