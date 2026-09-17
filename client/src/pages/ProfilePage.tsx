import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiService } from "../services/api";
import Avatar from "../components/Avatar";
import Layout from "../components/Layout";
import { useT, type Lang } from "../i18n";

type Bucket = { played: number; wins: number };
type Stats = {
  tournaments: number;
  matches: number; wins: number; losses: number;
  games: number; gameWins: number; gameLosses: number;
  byTarget: { matches: Record<string, Bucket>; games: Record<string, Bucket> };
};

export default function ProfilePage() {
  const { user } = useAuth();
  const { t, lang, setLang } = useT();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => { apiService.profile.stats().then(r => setStats(r.data)).catch(console.error); }, []);

  const rate = (wins: number, played: number) => (played > 0 ? Math.round((wins / played) * 100) : 0);
  const card = "bg-[#101f36] rounded-lg border border-[#1c3350]";
  const label = "text-xs font-medium text-[#6b84a0] uppercase tracking-wider";

  // Short (11) vs long (21) split for one kind of play.
  const TargetSplit = ({ buckets }: { buckets?: Record<string, Bucket> }) => (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {([["11", "profile.short11"], ["21", "profile.long21"]] as const).map(([key, labelKey]) => {
        const b = buckets?.[key];
        return (
          <div key={key} className="bg-[#0a1628] rounded-lg border border-[#1c3350] p-2.5">
            <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider">{t(labelKey)}</p>
            <p className="text-lg font-bold mt-0.5">{b?.played ?? 0}</p>
            <p className="text-[11px] text-[#4d6480]">
              {b && b.played > 0 ? t("profile.winsOf", { wins: b.wins, played: b.played }) : t("profile.noneYet")}
            </p>
          </div>
        );
      })}
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

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className={`${card} p-3 text-center`}>
          <p className="text-xl font-bold">{stats?.tournaments ?? "—"}</p>
          <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider mt-0.5">{t("profile.tournaments")}</p>
        </div>
        <div className={`${card} p-3 text-center`}>
          <p className="text-xl font-bold">{stats?.games ?? "—"}</p>
          <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider mt-0.5">{t("profile.gamesSection")}</p>
        </div>
        <div className={`${card} p-3 text-center`}>
          <p className="text-xl font-bold text-[#ccff00]">{user?.rating}</p>
          <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider mt-0.5">{t("profile.rating")}</p>
        </div>
      </div>

      <div className={`${card} p-4 mb-4`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={label}>{t("profile.matchesSection")}</h2>
          <span className="text-xs text-[#4d6480]">{stats?.matches ?? 0} {t("profile.played")}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1c3350" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#ccff00" strokeWidth="3"
                strokeDasharray={`${rate(stats?.wins ?? 0, stats?.matches ?? 0)} ${100 - rate(stats?.wins ?? 0, stats?.matches ?? 0)}`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{rate(stats?.wins ?? 0, stats?.matches ?? 0)}%</span>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-lg font-bold text-green-400">{stats?.wins ?? 0}</p>
              <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider">{t("profile.matchesWon")}</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-400">{stats?.losses ?? 0}</p>
              <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider">{t("profile.losses")}</p>
            </div>
          </div>
        </div>
        <p className={`${label} mt-4`}>{t("profile.byTarget")}</p>
        <TargetSplit buckets={stats?.byTarget?.matches} />
      </div>

      <div className={`${card} p-4 mb-4`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className={label}>{t("profile.gamesSection")}</h2>
          <span className="text-xs text-[#4d6480]">{stats?.games ?? 0} {t("profile.played")}</span>
        </div>
        <p className="text-[11px] text-[#4d6480] mb-3">{t("profile.gamesHint")}</p>
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1c3350" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#3b82f6" strokeWidth="3"
                strokeDasharray={`${rate(stats?.gameWins ?? 0, stats?.games ?? 0)} ${100 - rate(stats?.gameWins ?? 0, stats?.games ?? 0)}`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{rate(stats?.gameWins ?? 0, stats?.games ?? 0)}%</span>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-lg font-bold">{stats?.games ?? 0}</p>
              <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider">{t("profile.gamesPlayed")}</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-400">{stats?.gameWins ?? 0}</p>
              <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider">{t("profile.gamesWon")}</p>
            </div>
          </div>
        </div>
        <p className={`${label} mt-4`}>{t("profile.byTarget")}</p>
        <TargetSplit buckets={stats?.byTarget?.games} />
      </div>

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
