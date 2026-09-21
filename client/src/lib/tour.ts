// The demo tour's state, kept out of React so any screen can move it along with
// a one-line call after the action it was asking for (`tourDone("pair")`) —
// without the pages having to know a tour exists beyond that one line.
//
// Steps are a fixed order. Each names the element it points at (`data-tour`) and
// the i18n keys for its card; `doneBy` is the moment that advances it on its own,
// so the visitor never has to confirm something they have just done.

export interface TourStep {
  id: string;
  /** The `data-tour` element this step is about. Every step has one: a card
   *  pointing at nothing is a slide, and the app already has screens. */
  anchor: string;
  /** The screen that element is on. When the visitor is somewhere else, the
   *  step offers to take them there rather than describing how to get back. */
  target: "tournament" | "match";
  /** Advances the tour when a screen reports this action. */
  doneBy?: string;
}

export const TOUR_STEPS: TourStep[] = [
  { id: "roster", anchor: "roster", target: "tournament" },
  { id: "pair", anchor: "pair", target: "tournament", doneBy: "pair" },
  { id: "myMatch", anchor: "my-match", target: "tournament", doneBy: "openMatch" },
  { id: "start", anchor: "start", target: "match", doneBy: "start" },
  { id: "score", anchor: "score", target: "match", doneBy: "score" },
  { id: "finish", anchor: "finish", target: "match", doneBy: "end" },
  { id: "standings", anchor: "standings", target: "tournament" },
  { id: "claim", anchor: "claim", target: "tournament" },
];

// Where the demo lives, so both the tour and the Dashboard can get back to it.
// It is remembered per device rather than looked up, because the screens that
// need it (a tour card, a "return to your demo" link) must not have to fetch
// anything to know whether to offer the way back.
const T_KEY = "demoTournament";
const M_KEY = "demoMatch";

export function rememberDemoTournament(id: string) { localStorage.setItem(T_KEY, id); }
export function rememberDemoMatch(id: string) { localStorage.setItem(M_KEY, id); }
export function forgetDemo() { localStorage.removeItem(T_KEY); localStorage.removeItem(M_KEY); }

export function demoTournamentPath(): string | null {
  const id = localStorage.getItem(T_KEY);
  return id ? `/tournament/${id}` : null;
}

// The match screen needs both ids. Falls back to the event itself, which always
// shows the visitor's own match at the top — never to a dead end.
export function stepPath(target: TourStep["target"]): string | null {
  const tournament = localStorage.getItem(T_KEY);
  if (!tournament) return null;
  const match = localStorage.getItem(M_KEY);
  return target === "match" && match ? `/tournament/${tournament}/match/${match}` : `/tournament/${tournament}`;
}

const KEY = "tour";
type Listener = () => void;
const listeners = new Set<Listener>();

// -1 means finished or skipped; the tour is per-device and per-demo, so a plain
// localStorage number is the whole story.
export function tourStep(): number {
  const raw = localStorage.getItem(KEY);
  return raw === null ? 0 : Number(raw);
}

function set(step: number) {
  localStorage.setItem(KEY, String(step));
  listeners.forEach((l) => l());
}

export function tourNext() { set(Math.min(tourStep() + 1, TOUR_STEPS.length - 1)); }
export function tourSkip() { set(-1); }
export function tourRestart() { set(0); }
export function tourFinish() { set(-1); }

// Called by a screen right after the visitor does something. It only moves the
// tour when that is the step actually being shown, so nothing jumps ahead when
// the visitor wanders off the script.
export function tourDone(action: string) {
  const i = tourStep();
  if (i < 0 || TOUR_STEPS[i]?.doneBy !== action) return;
  set(Math.min(i + 1, TOUR_STEPS.length - 1));
}

export function tourSubscribe(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

// A demo visitor reaching for something a throwaway account cannot do — adding
// real players to the roster, above all — is the moment to offer them a real
// one. The offer lives in the demo strip at the top of the screen (it holds the
// form), so a screen asks for it through this rather than growing a second copy.
const claimListeners = new Set<Listener>();

export function requestClaim() { claimListeners.forEach((l) => l()); }

export function onClaimRequested(l: Listener) {
  claimListeners.add(l);
  return () => { claimListeners.delete(l); };
}
