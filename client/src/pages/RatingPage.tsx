import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useT } from "../i18n";
import { MEDALS, card, pageTitle, searchField } from "../lib/ui";

// The single list of players, ordered by rating. "Players" and "Rating" used to be
// two screens showing the same rows with a different sort and a search box on one
// of them; both routes now land here, and every row opens that player's profile.
export default function RatingPage() {
  const { t } = useT();
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiService.rating.getAll().then(r => setPlayers(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = players.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout>
      <h1 className={`${pageTitle} mb-4`}>{t("rating.title")}</h1>
      <input type="text" placeholder={t("players.search")} value={search} onChange={e => setSearch(e.target.value)}
        className={`${searchField} mb-3`} />
      {loading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <EmptyState text={t("rating.empty")} />
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
                  <p className="text-sm font-medium truncate">{p.firstName} {p.lastName}</p>
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
