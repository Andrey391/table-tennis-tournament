import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiService } from "../services/api";
import Avatar from "../components/Avatar";
import Layout from "../components/Layout";
import { useT, type Lang } from "../i18n";
import { playerName } from "../lib/format";

type Tally = { played: number; wins: number; losses: number };
type Level = { matches: Tally; sets: Tally };
type Stats = {
  events: { tournaments: number; games: number };
  tournaments: Level;
  games: Level;
  total: Level;
};

export default function ProfilePage() {
  const { user } = useAuth();
  const { t, lang, setLang } = useT();
  const [stats, setStats] = useState<Stats | null>(null);

  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => { apiService.profile.stats().then(r => setStats(r.data)).catch(console.error); }, []);
  // The tallies say how much was played; this says what. "Who did I play last
  // Thursday" had no answer on this screen before.
  useEffect(() => {
    if (!user?.id) return;
    apiService.players.getById(user.id).then(r => setHistory(r.data.matches || [])).catch(console.error);
  }, [user?.id]);

  const card = "bg-[#101f36] rounded-lg border border-[#1c3350]";
  const label = "text-xs font-medium text-[#6b84a0] uppercase tracking-wider";
  const rate = (t2: Tally | undefined) => (t2 && t2.played > 0 ? Math.round((t2.wins / t2.played) * 100) : 0);

  const Tile = ({ value, caption }: { value: number | string; caption: string }) => (
    <div className={`${card} p-3 text-center`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider mt-0.5">{caption}</p>
    </div>
  );

  // Matches and the sets inside them, for one kind of event.
  const LevelCard = ({ titleKey, level, accent }: { titleKey: string; level?: Level; accent: string }) => (
    <div className={`${card} p-4 mb-4`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={label}>{titleKey === "stats.inTournaments" ? t("stats.inTournaments") : t("stats.inGames")}</h2>
        <span className="text-xs text-[#4d6480]">{rate(level?.matches)}%</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([["stats.matches", level?.matches], ["stats.sets", level?.sets]] as const).map(([key, tally]) => (
          <div key={key} className="bg-[#0a1628] rounded-lg border border-[#1c3350] p-3">
            <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider">{t(key)}</p>
            <p className="text-2xl font-bold mt-0.5" style={{ color: accent }}>{tally?.played ?? 0}</p>
            <p className="text-[11px] text-[#4d6480]">
              <span className="text-green-400">{tally?.wins ?? 0}</span> {t("stats.won").toLowerCase()}
              {" · "}
              <span className="text-red-400">{tally?.losses ?? 0}</span> {t("stats.lost").toLowerCase()}
            </p>
          </div>
        ))}
      </div>

    </div>
  );

  return (
    <Layout>
      <div className="text-center mb-6">
        <div className="flex justify-center mb-3">
          <Avatar firstName={user?.firstName} lastName={user?.lastName} rating={user?.rating} size="lg" />
        </div>
        <h1 className="text-xl font-bold">{user?.firstName} {user?.lastName}</h1>
        <p className="text-sm text-[#6b84a0] mt-1">{user?.email}</p>
        {user?.club && <p className="text-xs text-[#4d6480] mt-0.5">{user.club}</p>}
      </div>

      {/* Level 1: the events themselves. */}
      <h2 className={`${label} mb-2`}>{t("stats.events")}</h2>
      <div className="grid grid-cols-3 gap-2 mb-5">
        <Tile value={stats?.events.tournaments ?? "—"} caption={t("stats.tournaments")} />
        <Tile value={stats?.events.games ?? "—"} caption={t("stats.games")} />
        <div className={`${card} p-3 text-center`}>
          <p className="text-xl font-bold text-[#ccff00]">{user?.rating}</p>
          <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider mt-0.5">{t("profile.rating")}</p>
        </div>
      </div>

      {/* Levels 2 and 3, kept apart because only one of them moves the rating. */}
      <LevelCard titleKey="stats.inTournaments" level={stats?.tournaments} accent="#ccff00" />
      <p className="text-[11px] text-[#4d6480] -mt-2 mb-4">{t("stats.ratedHint")}</p>
      <LevelCard titleKey="stats.inGames" level={stats?.games} accent="#3b82f6" />

      <h2 className={`${label} mb-2`}>{t("player.history")}</h2>
      {history.length === 0 ? (
        <div className={`${card} p-6 text-center mb-5`}>
          <p className="text-[#6b84a0] text-sm">{t("player.noHistory")}</p>
        </div>
      ) : (
        <div className="space-y-2 mb-5">
          {history.slice(0, 10).map((m: any) => {
            const isP1 = m.player1?.id === user?.id;
            const opponent = isP1 ? m.player2 : m.player1;
            const mine = isP1 ? m.setsWon1 : m.setsWon2;
            const theirs = isP1 ? m.setsWon2 : m.setsWon1;
            const tone = mine > theirs ? "text-green-400" : theirs > mine ? "text-red-400" : "text-[#93a8c2]";
            return (
              <Link key={m.id} to={`/tournament/${m.tournament?.id}`} className={`${card} block p-3 active:bg-[#1c3350] transition-colors`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{t("player.vs")} {playerName(opponent)}</span>
                  <span className={`font-mono font-bold text-sm shrink-0 ${tone}`}>{mine} : {theirs}</span>
                </div>
                <p className="text-[11px] text-[#4d6480] truncate mt-0.5">
                  {t("player.inEvent")} {m.tournament?.name}
                  {m.tournament?.kind === "GAME" && ` · ${t("games.unrated")}`}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <div className={`${card} p-4`}>
        <h2 className={`${label} mb-3`}>{t("profile.settings")}</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t("common.language")}</span>
          <div className="flex gap-1.5">
            {(["ru", "en"] as Lang[]).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border ${
                  lang === l ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"
                }`}>{l}</button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
