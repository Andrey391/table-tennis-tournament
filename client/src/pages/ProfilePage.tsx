import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiService } from "../services/api";
import Avatar from "../components/Avatar";
import Layout from "../components/Layout";
import { useT, type Lang } from "../i18n";

type Tally = { played: number; wins: number; losses: number };
type Bucket = { played: number; wins: number };
type Level = { matches: Tally; sets: Tally; byTarget: Record<string, Bucket> };
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

  useEffect(() => { apiService.profile.stats().then(r => setStats(r.data)).catch(console.error); }, []);

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

      <p className={`${label} mt-4 mb-2`}>{t("stats.byLength")}</p>
      <div className="grid grid-cols-2 gap-2">
        {([["11", "stats.short11"], ["21", "stats.long21"]] as const).map(([key, labelKey]) => {
          const b = level?.byTarget?.[key];
          return (
            <div key={key} className="bg-[#0a1628] rounded-lg border border-[#1c3350] p-2.5">
              <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider">{t(labelKey)}</p>
              <p className="text-lg font-bold mt-0.5">{b?.played ?? 0}</p>
              <p className="text-[11px] text-[#4d6480]">
                {b && b.played > 0 ? t("stats.winsOf", { wins: b.wins, played: b.played }) : t("stats.noneYet")}
              </p>
            </div>
          );
        })}
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
