import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiService } from "../services/api";
import Avatar from "../components/Avatar";
import Layout from "../components/Layout";
import { useT, type Lang } from "../i18n";

export default function ProfilePage() {
  const { user } = useAuth();
  const { t, lang, setLang } = useT();
  const [stats, setStats] = useState<{ tournaments: number; matches: number; wins: number; losses: number } | null>(null);

  useEffect(() => { apiService.profile.stats().then(r => setStats(r.data)).catch(console.error); }, []);

  const winRate = stats && stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;

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
        <div className="bg-[#101f36] rounded-lg border border-[#1c3350] p-3 text-center">
          <p className="text-xl font-bold">{stats?.tournaments ?? "—"}</p>
          <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider mt-0.5">{t("profile.tournaments")}</p>
        </div>
        <div className="bg-[#101f36] rounded-lg border border-[#1c3350] p-3 text-center">
          <p className="text-xl font-bold">{stats?.matches ?? "—"}</p>
          <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider mt-0.5">{t("profile.matches")}</p>
        </div>
        <div className="bg-[#101f36] rounded-lg border border-[#1c3350] p-3 text-center">
          <p className="text-xl font-bold text-[#ccff00]">{user?.rating}</p>
          <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider mt-0.5">{t("profile.rating")}</p>
        </div>
      </div>

      <div className="bg-[#101f36] rounded-lg border border-[#1c3350] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider">{t("profile.matchStats")}</h2>
          <span className="text-xs text-[#4d6480]">{stats?.matches ?? 0} {t("profile.played")}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1c3350" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#ccff00" strokeWidth="3"
                strokeDasharray={`${winRate} ${100 - winRate}`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{winRate}%</span>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-lg font-bold text-green-400">{stats?.wins ?? 0}</p>
              <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider">{t("profile.wins")}</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-400">{stats?.losses ?? 0}</p>
              <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider">{t("profile.losses")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#101f36] rounded-lg border border-[#1c3350] p-4 mt-4">
        <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-3">{t("profile.settings")}</h2>
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
