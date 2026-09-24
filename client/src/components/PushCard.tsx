import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { PushState, disablePush, enablePush, pushState } from "../lib/push";
import { btnPrimary, btnSmall, card } from "../lib/ui";

// "Notifications on this phone": the switch for Web Push (lib/push.ts). The full
// card sits on the inbox; `nudge` is the event-page version, shown to a player
// only while push is off, since "next round is out" is the one message that has
// to reach a phone in a pocket. Renders nothing where push cannot work at all.
export default function PushCard({ nudge = false }: { nudge?: boolean }) {
  const { t, lang } = useT();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { pushState().then(setState).catch(() => setState("unsupported")); }, []);

  if (!state || state === "unavailable" || state === "unsupported") return null;
  if (nudge && state !== "off" && state !== "needs-install") return null;

  const toggle = async () => {
    setBusy(true);
    setFailed(false);
    try { setState(state === "on" ? await disablePush() : await enablePush(lang)); }
    catch (err) { console.error(err); setFailed(true); }
    finally { setBusy(false); }
  };

  return (
    <div className={`${card} p-3 mb-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("push.cardTitle")}</p>
          <p className="text-xs text-[#6b84a0] mt-0.5">{t(`push.state.${state}`)}</p>
        </div>
        {state === "off" && <button onClick={toggle} disabled={busy} className={`${btnPrimary} shrink-0`}>{t("push.enable")}</button>}
        {state === "on" && <button onClick={toggle} disabled={busy} className={`${btnSmall} shrink-0`}>{t("push.disable")}</button>}
      </div>
      {failed && <p className="text-xs text-red-400 mt-2">{t("push.failed")}</p>}
    </div>
  );
}
