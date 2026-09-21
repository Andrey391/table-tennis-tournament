import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useT } from "../i18n";
import { playerName, formatDelta, deltaTone } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import PlayerStats, { HeadToHead } from "../components/PlayerStats";
import { backLink, card, sectionLabel } from "../lib/ui";

// Anyone's profile: who they are, and the matches behind the rating. Reached by
// tapping a player anywhere they are listed — the rating table, the roster, the
// standings — which previously led nowhere at all.
export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useT();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    apiService.players.getById(id).then(r => setData(r.data)).catch(console.error);
  }, [id]);

  if (!data) return <Layout><Loader className="py-20" /></Layout>;

  const p = data.player;
  const matches: any[] = data.matches || [];

  return (
    <Layout>
      <button onClick={() => navigate(-1)} className={backLink}>&larr; {t("common.back")}</button>

      <div className="text-center mb-6">
        <div className="flex justify-center mb-3">
          <Avatar firstName={p.firstName} lastName={p.lastName} rating={p.rating} size="lg" />
        </div>
        <h1 className="text-xl font-bold">{p.firstName} {p.lastName}</h1>
        {p.club && <p className="text-sm text-[#6b84a0] mt-1">{p.club}</p>}
        {p.city && <p className="text-xs text-[#4d6480] mt-0.5">{p.city}</p>}
        <p className="text-xs text-[#93a8c2] mt-2">{t("player.record", { wins: data.recent.wins, losses: data.recent.losses })}</p>
      </div>

      {user && user.id !== p.id && <HeadToHead playerId={user.id} otherId={p.id} />}
      <PlayerStats playerId={p.id} />

      <h2 className={`${sectionLabel} mb-2`}>{t("player.history")}</h2>
      {matches.length === 0 ? (
        <EmptyState text={t("player.noHistory")} />
      ) : (
        <div className="space-y-2">
          {matches.map(m => {
            const isP1 = m.player1?.id === p.id;
            const opponent = isP1 ? m.player2 : m.player1;
            const mine = isP1 ? m.setsWon1 : m.setsWon2;
            const theirs = isP1 ? m.setsWon2 : m.setsWon1;
            const tone = mine > theirs ? "text-green-400" : theirs > mine ? "text-red-400" : "text-[#93a8c2]";
            return (
              <Link key={m.id} to={`/tournament/${m.tournament?.id}/match/${m.id}`}
                className={`${card} block p-3 active:bg-[#1c3350] transition-colors`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{t("player.vs")} {playerName(opponent)}</span>
                  <span className={`font-mono font-bold text-sm shrink-0 ${tone}`}>{mine} : {theirs}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-[11px] text-[#4d6480] truncate">
                    {t("player.inEvent")} {m.tournament?.name}
                    {m.tournament?.kind === "GAME" && ` · ${t("games.unrated")}`}
                  </span>
                  {m.eloDelta != null && <span className={`text-[11px] font-mono shrink-0 ${deltaTone(mine > theirs ? m.eloDelta : -m.eloDelta)}`}>{formatDelta(mine > theirs ? m.eloDelta : -m.eloDelta)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
