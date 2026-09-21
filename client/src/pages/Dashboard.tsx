import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import ScopeToggle from "../components/ScopeToggle";
import { useT } from "../i18n";
import { formatEventDay, formatTimeRange, playerName, matchScoreLine } from "../lib/format";
import TryDemoButton from "../components/TryDemoButton";
import { demoTournamentPath } from "../lib/tour";

export default function Dashboard() {
  const { t, lang } = useT();
  const { token, user } = useAuth();
  const isGuest = !token;
  const demoPath = demoTournamentPath();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [cities, setCities] = useState<{ city: string; clubs: number }[]>([]);
  // Signup asks for a city; opening the app in someone else's city is not what
  // that answer meant. A stored choice still wins — it was made deliberately.
  const [city, setCity] = useState<string>(() => { try { return localStorage.getItem("city") ?? ""; } catch { return ""; } });
  const [cityTouched, setCityTouched] = useState(() => { try { return localStorage.getItem("city") !== null; } catch { return false; } });
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [myMatches, setMyMatches] = useState<any[]>([]);

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
    const fetch = scope === "mine" && !isGuest
      ? apiService.tournaments.getMine({ kind: "TOURNAMENT" })
      : apiService.tournaments.getAll({ kind: "TOURNAMENT", ...(city ? { city } : {}) });
    fetch.then(r => setTournaments(r.data)).catch(console.error);
    if (cityTouched) { try { localStorage.setItem("city", city); } catch { /* choice just won't persist */ } }
  }, [city, scope, cityTouched, isGuest]);

  // The feed arrives ordered by start time ascending, which puts last spring's
  // finished events on top of tonight's. What someone opening the app wants is
  // "what's next": upcoming and undated first, the past below it, most recent first.
  const now = Date.now();
  const isPast = (tr: any) => !!tr.startTime && new Date(tr.endTime || tr.startTime).getTime() < now;
  const upcoming = tournaments.filter(tr => !isPast(tr));
  const past = tournaments.filter(isPast).reverse();

  return (
    <Layout>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-[#6b84a0]">{t("home.yourCity")}</p>
          <select value={city} onChange={e => { setCityTouched(true); setCity(e.target.value); }}
            className="bg-transparent text-[#ccff00] font-semibold text-base focus:outline-none -ml-1">
            <option value="" className="bg-[#101f36] text-white">{t("home.allCities")}</option>
            {(user?.city && !cities.some(c => c.city === user.city) ? [{ city: user.city, clubs: 0 }, ...cities] : cities)
              .map(c => <option key={c.city} value={c.city} className="bg-[#101f36] text-white">{c.city}</option>)}
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
          className="relative inline-flex mt-4 px-5 py-3 rounded-lg bg-[#ccff00] text-[#0a1628] text-sm font-bold active:scale-[0.97] transition-transform">
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
        {[
          { to: "/rating", label: "home.tiles.players", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
          { to: "/results", label: "home.tiles.results", d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
          // Booking a table needs an account, so that tile is simply absent for a guest.
          ...(isGuest ? [] : [{ to: "/bookings", label: "home.tiles.bookings", d: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" }]),
          { to: "/games", label: "games.title", d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M4.9 4.9c3.5 1 6.2 3.7 7.1 7.1M19.1 19.1c-3.5-1-6.2-3.7-7.1-7.1" },
        ].map(tile => (
          <Link key={tile.to} to={tile.to} className="bg-[#101f36] border border-[#1c3350] rounded-lg p-3.5 flex flex-col items-start gap-2 active:bg-[#1c3350] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ccff00" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d={tile.d} />
            </svg>
            <span className="text-sm font-medium">{t(tile.label)}</span>
          </Link>
        ))}
      </div>

      <ScopeToggle scope={scope} onChange={setScope} labels={[t("home.scopeAll"), t("home.scopeMine")]} hidden={isGuest} />

      <div className="flex justify-between items-baseline mb-2.5">
        <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider">{t("home.tournaments")}</h2>
        {tournaments.length > 0 && <span className="text-xs text-[#4d6480]">{tournaments.length}</span>}
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-14 bg-[#101f36] rounded-lg border border-[#1c3350] px-4">
          <p className="text-[#6b84a0] mb-4 text-sm">{t(scope === "mine" && !isGuest ? "home.mineEmpty" : "home.empty")}</p>
          {!isGuest && <Link to="/tournament/new" className="inline-block px-5 py-2.5 bg-[#ccff00] text-[#0a1628] rounded-lg text-sm font-bold">{t("home.createFirst")}</Link>}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {upcoming.map(tr => <EventCard key={tr.id} tr={tr} t={t} lang={lang} />)}
          </div>
          {past.length > 0 && (
            <>
              <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mt-5 mb-2.5">{t("home.past")}</h2>
              <div className="space-y-2">
                {past.map(tr => <EventCard key={tr.id} tr={tr} t={t} lang={lang} />)}
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  );
}

function EventCard({ tr, t, lang }: { tr: any; t: (k: string, v?: any) => string; lang: any }) {
  return (
    <Link to={`/tournament/${tr.id}`}
      className="relative block overflow-hidden bg-[#101f36] p-3.5 pl-4 rounded-lg border border-[#1c3350] active:bg-[#1c3350] transition-colors">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${
        tr.status === "ACTIVE" ? "bg-yellow-400" : tr.status === "COMPLETED" ? "bg-green-500" : tr.status === "CANCELLED" ? "bg-red-500" : "bg-[#24405e]"
      }`} />
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-base truncate">{tr.name}</h3>
          {tr.startTime && <p className="text-xs text-[#93a8c2] mt-1">{formatEventDay(tr.startTime, lang)} &middot; {formatTimeRange(tr.startTime, tr.endTime, lang)}</p>}
          {tr.club && <p className="text-xs text-[#6b84a0] mt-0.5 truncate">{tr.club.name} &middot; {tr.club.city}</p>}
          <p className="text-xs text-[#6b84a0] mt-0.5">
            {tr._count?.players || 0}{tr.maxPlayers ? `/${tr.maxPlayers}` : ""} {t("common.players")} &middot; {tr._count?.matches || 0} {t("stats.matches").toLowerCase()}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
            tr.status === "ACTIVE" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
            tr.status === "COMPLETED" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
            tr.status === "CANCELLED" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
            "bg-[#1c3350] text-[#93a8c2] border border-[#1c3350]"
          }`}>{t(`status.${tr.status}`)}</span>
          {tr.myStatus === "PENDING" && <span className="text-[10px] text-yellow-400">{t("tournament.requested")}</span>}
          {tr.isOrganizer && <span className="text-[10px] text-[#4d6480]">{t("tournament.manager")}</span>}
        </div>
      </div>
    </Link>
  );
}
