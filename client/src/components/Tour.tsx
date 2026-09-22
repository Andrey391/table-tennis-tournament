import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { TOUR_STEPS, tourStep, tourNext, tourSkip, tourFinish, tourSubscribe, stepPath, pressStep, demoTournamentId } from "../lib/tour";
import { btnPrimary } from "../lib/ui";
import { apiService } from "../services/api";

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
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = React.useState(tourStep);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const [pressing, setPressing] = React.useState(false);

  React.useEffect(() => tourSubscribe(() => setStep(tourStep())), []);

  const current = step >= 0 ? TOUR_STEPS[step] : undefined;
  const anchor = current?.anchor;
  // Null until the step's element is on screen. Every step is about a control,
  // so until that control exists there is nothing to say about it — the card
  // says where to go instead of describing something the visitor cannot see.
  const waiting = !rect;
  // Where this step's control lives. The card takes the visitor there rather
  // than telling them to find their own way back.
  const path = current ? stepPath(current.target) : null;
  const canGo = !!path && path !== location.pathname;

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
  // The card must never sit on top of the thing it's describing: pin it to
  // whichever edge the anchor isn't near. An anchor in the lower half of the
  // screen pushes the card to the top; anywhere else (including "waiting",
  // where there's nothing on screen to avoid) it stays at the bottom.
  const placeAtTop = !!rect && rect.top + rect.height / 2 > window.innerHeight / 2;

  // On a step that ends in an action, "Next" performs it (see `pressStep`); the
  // screen then reports it done and the tour moves on by itself.
  const onNext = async () => {
    if (last) {
      // The match the tour just walked the visitor through scoring was a
      // tutorial run, not their club night — undo the sets and the rating
      // change it left behind so round 1 is a clean board to record for real.
      const id = demoTournamentId();
      if (id) apiService.tournaments.resetDemoRound1(id).catch(console.error);
      tourFinish();
      return;
    }
    if (!current.press) { tourNext(); return; }
    if (pressing) return;
    setPressing(true);
    try { await pressStep(current.id); } finally { setPressing(false); }
  };

  return (
    <>
      {/* A ring around the thing being talked about, not an overlay: the visitor
          has to be able to tap that button while the card is up. */}
      {rect && (
        <div className="fixed pointer-events-none z-40 rounded-xl border-2 border-[#ccff00] transition-all duration-200"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 9999px rgba(10,22,40,0.55)" }} />
      )}
      <div className={`fixed left-0 right-0 z-50 p-4 ${placeAtTop
        ? "top-0 pt-6 bg-gradient-to-b from-[#0a1628] via-[#0a1628] to-transparent"
        : "bottom-0 pb-6 bg-gradient-to-t from-[#0a1628] via-[#0a1628] to-transparent"}`}>
        <div className="max-w-md mx-auto bg-[#101f36] border border-[#1c3350] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-[#4d6480]">{t("tour.counter", { n: step + 1, total: TOUR_STEPS.length })}</span>
            <button onClick={tourSkip} className="text-xs text-[#6b84a0]">{t("tour.skip")}</button>
          </div>
          <div className="text-sm font-bold text-white mb-1">{t(`tour.${current.id}.title`)}</div>
          <p className="text-xs text-[#93a8c2] leading-relaxed">{waiting ? t(`tour.${current.id}.wait`) : t(`tour.${current.id}.text`)}</p>
          {/* No "next" while the step's control is off screen: it would walk the
              visitor past the one thing the step is about. Steps that end in an
              action advance themselves anyway (`doneBy`). */}
          {!waiting ? (
            <button onClick={onNext} disabled={pressing}
              className={`${btnPrimary} w-full mt-3`}>
              {last ? t("tour.finish") : t("tour.next")}
            </button>
          ) : canGo && (
            <button onClick={() => navigate(path!)}
              className={`${btnPrimary} w-full mt-3`}>
              {t("tour.go")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
