import React from "react";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { TOUR_STEPS, tourStep, tourNext, tourSkip, tourFinish, tourSubscribe } from "../lib/tour";

// Walks a demo visitor through one club night on the real screens: the roster,
// the pairing, their own match, recording a set, settling it, the table. A
// separate "how it works" screen would have to be kept in step with the app;
// pointing at the actual buttons cannot drift.
//
// Mounted once at the root, so it follows the visitor across pages — including
// MatchPage, which renders outside Layout.
export default function Tour() {
  const { user } = useAuth();
  const { t } = useT();
  const [step, setStep] = React.useState(tourStep);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  React.useEffect(() => tourSubscribe(() => setStep(tourStep())), []);

  const current = step >= 0 ? TOUR_STEPS[step] : undefined;
  const anchor = current?.anchor;

  // The anchor appears, moves and disappears as rounds are paired and polls come
  // in, so its box is re-measured on a timer rather than once on mount.
  React.useEffect(() => {
    if (!anchor) { setRect(null); return; }
    let scrolled = false;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${anchor}"]`);
      if (!el) { setRect(null); return; }
      const box = el.getBoundingClientRect();
      setRect(box);
      if (!scrolled) { scrolled = true; el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    };
    measure();
    const id = setInterval(measure, 400);
    window.addEventListener("scroll", measure, true);
    return () => { clearInterval(id); window.removeEventListener("scroll", measure, true); };
  }, [anchor]);

  if (!user?.isDemo || !current) return null;
  const last = step === TOUR_STEPS.length - 1;

  return (
    <>
      {/* A ring around the thing being talked about, not an overlay: the visitor
          has to be able to tap that button while the card is up. */}
      {rect && (
        <div className="fixed pointer-events-none z-40 rounded-xl border-2 border-[#ccff00] transition-all duration-200"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 9999px rgba(10,22,40,0.55)" }} />
      )}
      <div className="fixed left-0 right-0 bottom-0 z-50 p-4 pb-6 bg-gradient-to-t from-[#0a1628] via-[#0a1628] to-transparent">
        <div className="max-w-md mx-auto bg-[#101f36] border border-[#1c3350] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-[#4d6480]">{t("tour.counter", { n: step + 1, total: TOUR_STEPS.length })}</span>
            <button onClick={tourSkip} className="text-xs text-[#6b84a0]">{t("tour.skip")}</button>
          </div>
          <div className="text-sm font-bold text-white mb-1">{t(`tour.${current.id}.title`)}</div>
          <p className="text-xs text-[#93a8c2] leading-relaxed">{t(`tour.${current.id}.text`)}</p>
          <button onClick={last ? tourFinish : tourNext}
            className="w-full mt-3 bg-[#ccff00] text-[#0a1628] py-2.5 rounded-lg text-sm font-bold">
            {last ? t("tour.finish") : t("tour.next")}
          </button>
        </div>
      </div>
    </>
  );
}
