import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useT } from "../i18n";
import { useAuth } from "../context/AuthContext";
import { playerName, formatEventDay, formatDelta, deltaTone } from "../lib/format";
import { MEDALS, card, cardFeature, chip, pageTitle, searchField } from "../lib/ui";

// Two views of what has been played: a feed of events with their podiums, and
// leaderboards over a period. The match-by-match detail lives on the event page.
export default function ResultsPage() {
  const { t, lang } = useT();
  const { user } = useAuth();
  const [tab, setTab] = useState<"events" | "leaders">("events");

  const [scope, setScope] = useState<"all" | "mine">("all");
  const [kind, setKind] = useState<"" | "TOURNAMENT" | "GAME">("");
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<any[] | null>(null);

  const [metric, setMetric] = useState<"rating" | "wins" | "played">("rating");
  const [period, setPeriod] = useState<"month" | "year" | "all">("month");
  const [leaders, setLeaders] = useState<any[] | null>(null);

  useEffect(() => {
    if (tab !== "events") return;
    setEvents(null);
    const timer = setTimeout(() => {
      apiService.stats.results({ kind: kind || undefined, q: search.trim() || undefined, userId: scope === "mine" ? user?.id : undefined })
        .then(r => setEvents(r.data)).catch(() => setEvents([]));
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [tab, kind, scope, search, user?.id]);

  useEffect(() => {
    if (tab !== "leaders") return;
    setLeaders(null);
    apiService.stats.leaders({ metric, period }).then(r => setLeaders(r.data)).catch(() => setLeaders([]));
  }, [tab, metric, period]);

  return (
    <Layout>
      <h1 className={`${pageTitle} mb-4`}>{t("results.title")}</h1>
      <div className={`${card} grid grid-cols-2 gap-1 p-1 mb-4`}>
        {(["events", "leaders"] as const).map(k => (
          <button key={k} onClick={() => setTab(k)} className={`py-2 rounded text-sm font-medium ${tab === k ? "bg-[#1c3350] text-white" : "text-[#6b84a0]"}`}>
            {t(k === "events" ? "results.tabEvents" : "results.tabLeaders")}
          </button>
        ))}
      </div>

      {tab === "events" ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
            {user && (["all", "mine"] as const).map(s => <button key={s} onClick={() => setScope(s)} className={chip(scope === s)}>{t(`results.${s}`)}</button>)}
            {user && <span className="w-px bg-[#1c3350] shrink-0" />}
            {([["", "results.kindAll"], ["TOURNAMENT", "results.kindTournaments"], ["GAME", "results.kindGames"]] as const).map(([k, key]) => (
              <button key={k} onClick={() => setKind(k)} className={chip(kind === k)}>{t(key)}</button>
            ))}
          </div>
          <input type="text" placeholder={t("results.search")} value={search} onChange={e => setSearch(e.target.value)}
            className={`${searchField} mb-4`} />

          {events === null ? (
            <Loader />
          ) : events.length === 0 ? (
            <EmptyState text={t("results.emptyFeed")} />
          ) : (
            <div className="space-y-3">
              {events.map(e => (
                <Link key={e.id} to={`/tournament/${e.id}`} className={`${cardFeature} block overflow-hidden p-4 active:brightness-110 transition`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-lg leading-tight truncate">{e.name}</p>
                      <p className="text-[11px] text-[#4d6480] truncate mt-0.5">
                        {formatEventDay(e.startTime || e.createdAt, lang)}
                        {e.club && ` · ${e.club.name}`}
                        {` · ${t("results.players", { n: e.players })}`}
                        {e.kind === "GAME" && ` · ${t("games.unrated")}`}
                      </p>
                    </div>
                    {e.live > 0 && <span className="shrink-0 text-[10px] uppercase tracking-wider text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5">{t("results.liveNow")}</span>}
                  </div>
                  {e.podium.length === 0 ? (
                    <p className="text-xs text-[#6b84a0] mt-3">{t("results.noMatchesYet")}</p>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      {e.podium.map((p: any, i: number) => (
                        <div key={p.userId} className="flex items-center gap-2 text-sm">
                          <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-[#0a1628] shrink-0" style={{ background: MEDALS[i] }}>{i + 1}</span>
                          <span className="truncate flex-1">{playerName(p)}</span>
                          <span className="text-xs text-[#93a8c2] shrink-0">{p.wins}{t("tournament.winShort")} {p.losses}{t("tournament.lossShort")}</span>
                          {e.kind === "TOURNAMENT" && <span className={`text-xs font-mono w-10 text-right shrink-0 ${deltaTone(p.ratingChange)}`}>{formatDelta(p.ratingChange)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
            {([["rating", "leaders.metricRating"], ["wins", "leaders.metricWins"], ["played", "leaders.metricPlayed"]] as const).map(([k, key]) => (
              <button key={k} onClick={() => setMetric(k)} className={chip(metric === k)}>{t(key)}</button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
            {(["month", "year", "all"] as const).map(k => <button key={k} onClick={() => setPeriod(k)} className={chip(period === k)}>{t(`leaders.${k}`)}</button>)}
          </div>
          {metric === "rating" && <p className="text-[11px] text-[#4d6480] -mt-2 mb-3">{t("leaders.hintRating")}</p>}

          {leaders === null ? (
            <Loader />
          ) : leaders.length === 0 ? (
            <EmptyState text={t("leaders.empty")} />
          ) : (
            <div className={`${card} divide-y divide-[#1c3350]/50`}>
              {leaders.map((r, i) => (
                <Link key={r.player.id} to={`/player/${r.player.id}`} className="flex items-center gap-3 px-3 py-2.5">
                  <span className={`text-xs w-5 shrink-0 font-bold ${i < 3 ? "text-[#ccff00]" : "text-[#4d6480]"}`}>{i + 1}</span>
                  <Avatar firstName={r.player.firstName} lastName={r.player.lastName} rating={r.player.rating} size="sm" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{playerName(r.player)}</span>
                    <span className="block text-[11px] text-[#4d6480]">{t("leaders.matches", { n: r.played })} · {t("leaders.record", { wins: r.wins, losses: r.losses })}</span>
                  </span>
                  <span className={`font-mono font-bold text-sm shrink-0 ${metric === "rating" ? deltaTone(r.ratingChange) : "text-white"}`}>
                    {metric === "rating" ? formatDelta(r.ratingChange) : metric === "wins" ? r.wins : r.played}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
