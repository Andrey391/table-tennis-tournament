import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiService } from "../services/api";
import Layout from "../components/Layout";
import { useT } from "../i18n";

export default function ResultsPage() {
  const { t } = useT();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => { apiService.tournaments.getAll().then(r => setTournaments(r.data)).catch(console.error); }, []);
  useEffect(() => { if (selected) apiService.matches.getByTournament(selected).then(r => setMatches(r.data)).catch(console.error); }, [selected]);

  const live = matches.filter((m: any) => m.status === "IN_PROGRESS");
  const completed = matches.filter((m: any) => m.status === "COMPLETED");

  return (
    <Layout>
      <h1 className="text-2xl font-bold tracking-tight mb-3">{t("results.title")}</h1>
      <select value={selected || ""} onChange={e => setSelected(e.target.value || null)}
        className="w-full px-3 py-2.5 bg-[#101f36] rounded border border-[#1c3350] text-sm focus:outline-none mb-4">
        <option value="">{t("results.select")}</option>
        {tournaments.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      {live.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-medium text-yellow-400 uppercase tracking-wider mb-2">{t("results.live")}</h2>
          <div className="space-y-2">
            {live.map((m: any) => (
              <Link key={m.id} to={`/tournament/${selected}/match/${m.id}`}
                className="flex items-center justify-between bg-[#101f36] border border-yellow-500/20 p-3 rounded-lg">
                <span className="text-sm flex-1 min-w-0 text-right truncate pr-2">{m.player1?.firstName || "TBD"}</span>
                <span className="px-3 font-mono font-bold text-sm text-yellow-400 shrink-0">{m.score1} - {m.score2}</span>
                <span className="text-sm flex-1 min-w-0 truncate pl-2">{m.player2?.firstName || "TBD"}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-[#6b84a0] uppercase tracking-wider mb-2">{t("results.completed")}</h2>
          <div className="space-y-2">
            {completed.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between bg-[#101f36] p-3 rounded-lg border border-[#1c3350]">
                <span className="text-sm flex-1 min-w-0 text-right truncate pr-2 text-[#93a8c2]">{m.player1?.firstName || "TBD"}</span>
                <span className="px-3 font-mono font-bold text-sm shrink-0">{m.score1} - {m.score2}</span>
                <span className="text-sm flex-1 min-w-0 truncate pl-2 text-[#93a8c2]">{m.player2?.firstName || "TBD"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && completed.length === 0 && live.length === 0 && (
        <div className="text-center py-12 bg-[#101f36] rounded-lg border border-[#1c3350]">
          <p className="text-[#6b84a0] text-sm">{t("results.empty")}</p>
        </div>
      )}
    </Layout>
  );
}
