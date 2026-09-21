import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { tourRestart } from "../lib/tour";

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
      tourRestart();
      navigate(`/tournament/${tournamentId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || t("demo.startFailed"));
    } finally { setLoading(false); }
  };

  return (
    <>
      <button type="button" onClick={start} disabled={loading}
        className={variant === "solid"
          ? "w-full bg-[#ccff00] text-[#0a1628] py-3 rounded-lg text-sm font-bold disabled:opacity-50"
          : "w-full bg-transparent text-[#ccff00] py-2.5 rounded-lg text-sm font-bold border border-[#ccff00]/40 disabled:opacity-50"}>
        {loading ? t("demo.starting") : t("demo.try")}
      </button>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </>
  );
}
