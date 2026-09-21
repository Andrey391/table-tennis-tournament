import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiService } from "../services/api";
import Logo from "../components/Logo";
import { useT } from "../i18n";
import { playerName } from "../lib/format";
import { tourSkip, rememberDemoTournament, rememberDemoMatch } from "../lib/tour";
import { btnPrimary, btnSecondary, card, errorBox } from "../lib/ui";

// The page behind a demo invitation link. The manager of a demo evening sends it
// to a second person, who takes the empty seat as a guest and lands in the same
// match: two phones, one scoreboard. Joining is an explicit tap rather than
// something the link does on open, so a chat app that previews the link (or a
// visitor who only looks) never uses the seat up.
export default function DemoJoin() {
  const { id } = useParams<{ id: string }>();
  const { user, joinDemo } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [tournament, setTournament] = React.useState<any>(null);
  const [missing, setMissing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!id) return;
    apiService.tournaments.getById(id).then(r => setTournament(r.data)).catch(() => setMissing(true));
  }, [id]);

  // Someone who is already in this event (the manager opening their own link,
  // or a guest coming back to it) has nothing to join: take them to it.
  const already = !!user && !!tournament && (tournament.organizerId === user.id || tournament.players?.some((p: any) => p.userId === user.id));
  React.useEffect(() => { if (already) navigate(`/tournament/${id}`, { replace: true }); }, [already, id, navigate]);

  const join = async () => {
    if (!id) return;
    setLoading(true); setError("");
    try {
      const joined = await joinDemo(id);
      // The guided tour is written for the person running the evening; the guest
      // just plays their match.
      tourSkip();
      rememberDemoTournament(joined.tournamentId);
      if (joined.matchId) rememberDemoMatch(joined.matchId);
      navigate(joined.matchId ? `/tournament/${joined.tournamentId}/match/${joined.matchId}` : `/tournament/${joined.tournamentId}`, { replace: true });
    } catch (err: any) {
      const status = err.response?.status;
      setError(status === 409 ? t("demoJoin.taken") : status === 404 || status === 410 ? t("demoJoin.invalid") : t("demoJoin.failed"));
      setLoading(false);
    }
  };

  const invalid = missing || (tournament && tournament.demoSeatOpen === false && !already);

  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8"><Logo size="lg" as="plain" /></div>
        <div className={`${card} p-6 space-y-4 text-center`}>
          {!tournament && !missing ? (
            <p className="text-sm text-[#6b84a0]">{t("common.loading")}</p>
          ) : invalid ? (
            <>
              <p className="text-base font-bold">{t("demoJoin.invalidTitle")}</p>
              <p className="text-sm text-[#93a8c2]">{missing ? t("demoJoin.invalid") : t("demoJoin.taken")}</p>
              <Link to="/" className={`${btnSecondary} block w-full`}>{t("demoJoin.toHome")}</Link>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider text-[#6b84a0]">{t("demoJoin.kicker")}</p>
              <p className="text-xl font-bold">{t("demoJoin.title", { name: playerName(tournament.organizer) })}</p>
              <p className="text-sm text-[#93a8c2] leading-relaxed">{t("demoJoin.text")}</p>
              {user && !user.isDemo && <p className="text-xs text-yellow-400">{t("demoJoin.replacesSession", { name: playerName(user) })}</p>}
              {error && <div className={errorBox}>{error}</div>}
              <button onClick={join} disabled={loading}
                className={`${btnPrimary} w-full`}>
                {loading ? t("demoJoin.joining") : t("demoJoin.join")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
