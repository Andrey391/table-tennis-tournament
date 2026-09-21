import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { tourRestart, rememberDemoTournament } from "../lib/tour";
import { btnPrimary } from "../lib/ui";

// The way in for someone who has never run a club night. It signs them in as a
// throwaway account that already owns an event and drops them on it with the
// tour running — the feed alone shows none of what the app is for.
export default function TryDemoButton({ variant = "solid" }: { variant?: "solid" | "ghost" }) {
  const { startDemo } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const start = async () => {
    setLoading(true);
    try {
      setError("");
      const tournamentId = await startDemo();
      rememberDemoTournament(tournamentId);
      tourRestart();
      navigate(`/tournament/${tournamentId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || t("demo.startFailed"));
    } finally { setLoading(false); }
  };

  return (
    <>
      <button type="button" onClick={start} disabled={loading}
        className={`w-full ${variant === "solid" ? btnPrimary : "py-3 px-5 rounded-lg text-sm transition bg-transparent text-[#ccff00] font-bold border border-[#ccff00]/40 active:bg-[#ccff00]/10 disabled:opacity-50"}`}>
        {loading ? t("demo.starting") : t("demo.try")}
      </button>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </>
  );
}
