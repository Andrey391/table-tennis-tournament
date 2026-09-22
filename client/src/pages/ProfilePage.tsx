import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiService } from "../services/api";
import Avatar from "../components/Avatar";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import { useT, type Lang } from "../i18n";
import { playerName, formatDelta, deltaTone, matchDelta, formatRating } from "../lib/format";
import { btnPrimary, btnSecondary, card, errorBox, field, fieldLabel, noticeBox, sectionLabel } from "../lib/ui";
import PlayerStats from "../components/PlayerStats";
import PlayerScheduleModal from "../components/PlayerScheduleModal";

type Tally = { played: number; wins: number; losses: number };
type Level = { matches: Tally; sets: Tally };
type Stats = {
  events: { tournaments: number; games: number };
  tournaments: Level;
  games: Level;
  total: Level;
};

export default function ProfilePage() {
  const { user, refreshUser, setUser } = useAuth();
  const { t, lang, setLang } = useT();
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);

  // The session user is loaded once when the app starts, so the rating shown here
  // was whatever it happened to be then — and Elo moves it after every settled
  // match. Re-read it when the screen that displays it opens.
  useEffect(() => { refreshUser(); }, [refreshUser]);

  useEffect(() => { apiService.profile.stats().then(r => setStats(r.data)).catch(console.error); }, []);
  // The tallies say how much was played; this says what. "Who did I play last
  // Thursday" had no answer on this screen before.
  useEffect(() => {
    if (!user?.id) return;
    apiService.players.getById(user.id).then(r => setHistory(r.data.matches || [])).catch(e => { console.error(e); setHistory(h => h ?? []); });
  }, [user?.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  // A date input wants "YYYY-MM-DD"; the API hands back an ISO timestamp.
  const toDateInput = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

  const openEdit = () => {
    setError(""); setNotice("");
    setEdit({
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      email: user?.email ?? "",
      club: user?.club ?? "",
      city: user?.city ?? "",
      phone: user?.phone ?? "",
      dateOfBirth: toDateInput(user?.dateOfBirth),
      currentPassword: "",
      newPassword: "",
    });
  };

  // Closing the form is the whole cancel: the fields live in `edit`, never in `user`,
  // so nothing typed reaches the account, and reopening starts from the saved values.
  const cancelEdit = () => { setEdit(null); setError(""); };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !edit) return;
    setBusy(true); setError("");
    try {
      const r = await apiService.players.update(user.id, {
        firstName: edit.firstName,
        lastName: edit.lastName,
        email: edit.email,
        club: edit.club || null,
        city: edit.city || null,
        phone: edit.phone || null,
        // A date input gives a bare day; the API takes an ISO timestamp.
        dateOfBirth: edit.dateOfBirth ? new Date(edit.dateOfBirth).toISOString() : null,
        ...(edit.newPassword ? { currentPassword: edit.currentPassword, newPassword: edit.newPassword } : {}),
      });
      // The response is the same shape as /auth/me, so the header avatar and the
      // rating tile update without another round trip.
      setUser(r.data);
      setEdit(null);
      setNotice(t("profile.saved"));
    } catch (err: any) { setError(err.response?.data?.error || t("common.failed")); }
    finally { setBusy(false); }
  };

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
        <h2 className={sectionLabel}>{titleKey === "stats.inTournaments" ? t("stats.inTournaments") : t("stats.inGames")}</h2>
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
        <button onClick={() => (edit ? cancelEdit() : openEdit())} className="text-xs text-[#ccff00] font-medium mt-2">
          {edit ? t("common.cancel") : t("profile.edit")}
        </button>
      </div>

      {notice && <div className={`${noticeBox} mb-3`}>{notice}</div>}
      {error && <div className={`${errorBox} mb-3`}>{error}</div>}

      {edit && (
        <form onSubmit={saveProfile} className={`${card} p-4 mb-5 space-y-3`}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={fieldLabel}>{t("auth.firstName")}</label>
              <input type="text" value={edit.firstName} onChange={e => setEdit({ ...edit, firstName: e.target.value })} className={field} required />
            </div>
            <div>
              <label className={fieldLabel}>{t("auth.lastName")}</label>
              <input type="text" value={edit.lastName} onChange={e => setEdit({ ...edit, lastName: e.target.value })} className={field} required />
            </div>
          </div>
          <div>
            <label className={fieldLabel}>{t("auth.email")}</label>
            <input type="email" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} className={field} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={fieldLabel}>{t("auth.club")}</label>
              <input type="text" value={edit.club} onChange={e => setEdit({ ...edit, club: e.target.value })} className={field} />
            </div>
            <div>
              <label className={fieldLabel}>{t("auth.city")}</label>
              <input type="text" value={edit.city} onChange={e => setEdit({ ...edit, city: e.target.value })} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={fieldLabel}>{t("profile.phone")}</label>
              <input type="tel" value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} className={field} />
            </div>
            <div>
              <label className={fieldLabel}>{t("profile.birthday")}</label>
              <input type="date" value={edit.dateOfBirth} onChange={e => setEdit({ ...edit, dateOfBirth: e.target.value })} className={field} />
            </div>
          </div>

          {/* The rating is Elo, computed from settled matches — showing it here as
              a read-only line is more honest than leaving people to wonder why it
              is the one thing they cannot type over. */}
          <div className="bg-[#0a1628] rounded-lg border border-[#1c3350] p-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className={sectionLabel}>{t("profile.rating")}</p>
              <p className="text-[11px] text-[#4d6480] mt-0.5">{t("profile.ratingReadOnly")}</p>
            </div>
            <span className="text-lg font-bold text-[#ccff00] shrink-0 ml-3">{formatRating(user?.rating)}</span>
          </div>

          <div className="border-t border-[#1c3350] pt-3 space-y-2">
            <p className={sectionLabel}>{t("profile.changePassword")}</p>
            <input type="password" placeholder={t("profile.currentPassword")} value={edit.currentPassword}
              onChange={e => setEdit({ ...edit, currentPassword: e.target.value })} className={field} autoComplete="current-password" />
            <input type="password" placeholder={t("profile.newPassword")} value={edit.newPassword} minLength={6}
              onChange={e => setEdit({ ...edit, newPassword: e.target.value })} className={field} autoComplete="new-password" />
            <p className="text-[11px] text-[#4d6480]">{t("profile.passwordHint")}</p>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={cancelEdit} disabled={busy} className={`${btnSecondary} flex-1`}>{t("common.cancel")}</button>
            <button type="submit" disabled={busy} className={`${btnPrimary} flex-1`}>
              {busy ? t("common.creating") : t("common.save")}
            </button>
          </div>
        </form>
      )}

      {/* Level 1: the events themselves. */}
      <h2 className={`${sectionLabel} mb-2`}>{t("stats.events")}</h2>
      <div className="grid grid-cols-3 gap-2 mb-5">
        <Tile value={stats?.events.tournaments ?? "—"} caption={t("stats.tournaments")} />
        <Tile value={stats?.events.games ?? "—"} caption={t("stats.games")} />
        <div className={`${card} p-3 text-center`}>
          <p className="text-xl font-bold text-[#ccff00]">{formatRating(user?.rating)}</p>
          <p className="text-[11px] text-[#6b84a0] uppercase tracking-wider mt-0.5">{t("profile.rating")}</p>
        </div>
      </div>

      {/* Levels 2 and 3, kept apart because only one of them moves the rating. */}
      <LevelCard titleKey="stats.inTournaments" level={stats?.tournaments} accent="#ccff00" />
      <p className="text-[11px] text-[#4d6480] -mt-2 mb-4">{t("stats.ratedHint")}</p>
      <LevelCard titleKey="stats.inGames" level={stats?.games} accent="#3b82f6" />

      {user && <PlayerStats playerId={user.id} />}

      <div className="flex items-center justify-between mb-2">
        <h2 className={sectionLabel}>{t("player.history")}</h2>
        <button onClick={() => setShowSchedule(true)} className="text-xs text-[#ccff00] font-medium">{t("play.schedule")}</button>
      </div>
      {history === null ? (
        <Loader className="py-8 mb-5" />
      ) : history.length === 0 ? (
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
              <Link key={m.id} to={`/tournament/${m.tournament?.id}/match/${m.id}`} className={`${card} block p-3 active:bg-[#1c3350] transition-colors`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{t("player.vs")} {playerName(opponent)}</span>
                  <span className={`font-mono font-bold text-sm shrink-0 ${tone}`}>{mine} : {theirs}</span>
                </div>
                <div className="flex justify-between gap-2 mt-0.5">
                  <p className="text-[11px] text-[#4d6480] truncate">
                    {t("player.inEvent")} {m.tournament?.name}
                    {m.tournament?.kind === "GAME" && ` · ${t("games.unrated")}`}
                  </p>
                  {m.eloDelta != null && <span className={`text-[11px] font-mono shrink-0 ${deltaTone(matchDelta(m, mine, theirs))}`}>{formatDelta(matchDelta(m, mine, theirs))}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className={`${card} p-4`}>
        <h2 className={`${sectionLabel} mb-3`}>{t("profile.settings")}</h2>
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

      {user && <PlayerScheduleModal open={showSchedule} onClose={() => setShowSchedule(false)} playerId={user.id} />}
    </Layout>
  );
}
