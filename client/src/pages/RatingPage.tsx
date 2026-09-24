import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useT } from "../i18n";
import { cityKey } from "../lib/format";
import { MEDALS, card, fieldLabel, pageTitle, searchField } from "../lib/ui";

// The single list of players, ordered by rating. "Players" and "Rating" used to be
// two screens showing the same rows with a different sort and a search box on one
// of them; both routes now land here, and every row opens that player's profile.
//
// It opens on the viewer's own city and can be narrowed to one club: the rating is
// one number app-wide, but a ladder only means something among people who meet at
// the table. The note under the title says plainly that this is the app's own
// rating, computed with the FNTR formula, and not the federation's official one.
export default function RatingPage() {
  const { t } = useT();
  const { user } = useAuth();
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [city, setCity] = useState<string>(() => { try { return localStorage.getItem("ratingCity") ?? ""; } catch { return ""; } });
  const [cityTouched, setCityTouched] = useState(() => { try { return localStorage.getItem("ratingCity") !== null; } catch { return false; } });
  const [clubId, setClubId] = useState("");
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    apiService.clubs.cities().then(r => setCities(r.data.map((c: { city: string }) => c.city))).catch(console.error);
  }, []);

  // Same rule as the home feed: the signup city, unless a city was picked by hand.
  useEffect(() => {
    if (!cityTouched && user?.city) setCity(user.city);
  }, [user?.city, cityTouched]);

  useEffect(() => {
    setClubId("");
    if (!city) { setClubs([]); return; }
    apiService.clubs.getAll({ city }).then(r => setClubs(r.data)).catch(console.error);
  }, [city]);

  // A city change also resets the club, so two requests can be on the wire at once;
  // only the latest one may land.
  useEffect(() => {
    let live = true;
    setLoading(true);
    apiService.rating.getAll({ ...(city ? { city } : {}), ...(clubId ? { clubId } : {}) })
      .then(r => { if (live) setPlayers(r.data); }).catch(console.error).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [city, clubId]);

  const pickCity = (c: string) => {
    setCityTouched(true);
    setCity(c);
    try { localStorage.setItem("ratingCity", c); } catch { /* choice just won't persist */ }
  };

  const cityOptions: string[] = [];
  for (const c of [...cities, user?.city, city]) {
    if (c && c.trim() && !cityOptions.some(o => cityKey(o) === cityKey(c))) cityOptions.push(c.trim());
  }
  cityOptions.sort((a, b) => a.localeCompare(b));
  const selectedCity = cityOptions.find(o => cityKey(o) === cityKey(city)) ?? "";

  const filtered = players.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout>
      <h1 className={`${pageTitle} mb-1`}>{t("rating.title")}</h1>
      <p className="text-xs text-[#6b84a0] mb-1">{t("rating.note")}</p>
      <button type="button" onClick={() => setShowHow(v => !v)} className="text-xs text-[#ccff00] mb-3">
        {showHow ? t("rating.howHide") : t("rating.howTitle")}
      </button>
      {showHow && (
        <div className={`${card} p-3 mb-3 space-y-1.5 text-xs text-[#93a8c2]`}>
          <p>{t("rating.how1")}</p>
          <p>{t("rating.how2")}</p>
          <p>{t("rating.how3")}</p>
          <p>{t("rating.how4")}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="min-w-0">
          <span className={fieldLabel}>{t("common.city")}</span>
          <select value={selectedCity} onChange={e => pickCity(e.target.value)} className={searchField}>
            <option value="">{t("rating.allCities")}</option>
            {cityOptions.map(c => <option key={cityKey(c)} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className={fieldLabel}>{t("common.club")}</span>
          <select value={clubId} onChange={e => setClubId(e.target.value)} disabled={!clubs.length} className={`${searchField} disabled:opacity-50`}>
            <option value="">{t("rating.allClubs")}</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <input type="text" placeholder={t("players.search")} value={search} onChange={e => setSearch(e.target.value)}
        className={`${searchField} mb-3`} />
      {loading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <EmptyState text={clubId && !search ? t("rating.clubEmpty") : t("rating.empty")} />
      ) : (
        <div className={`${card} divide-y divide-[#1c3350]/50`}>
          {filtered.map((p: any, i: number) => (
            <Link key={p.id} to={`/player/${p.id}`} className="flex items-center justify-between px-3 py-2.5 active:bg-[#1c3350] transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Ranks come from the unfiltered order, so searching doesn't crown someone 1st. */}
                {!search && i < 3 ? (
                  <span className="shrink-0 inline-flex w-6 h-6 rounded-full text-xs font-bold items-center justify-center text-[#0a1628]" style={{ background: MEDALS[i] }}>{i + 1}</span>
                ) : <span className="text-xs text-[#4d6480] w-6 shrink-0 text-center">{players.indexOf(p) + 1}</span>}
                <Avatar firstName={p.firstName} lastName={p.lastName} rating={p.rating} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.firstName} {p.lastName}{p.id === user?.id && <span className="text-[#ccff00] text-xs ml-1.5">{t("rating.you")}</span>}</p>
                  {p.city && <p className="text-xs text-[#6b84a0] truncate">{p.city}</p>}
                </div>
              </div>
              <span className="text-[#4d6480] text-sm shrink-0 px-1">&rsaquo;</span>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
