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
  /** "Next" on this step presses the real control instead of skipping past it.
   *  Without it, "Next" on the pairing step walked the visitor straight over the
   *  one button the step is about, and nothing was ever paired. */
  press?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  { id: "roster", anchor: "roster", target: "tournament" },
  { id: "pair", anchor: "pair", target: "tournament", doneBy: "pair", press: true },
  { id: "myMatch", anchor: "my-match", target: "tournament", doneBy: "openMatch", press: true },
  { id: "start", anchor: "start", target: "match", doneBy: "start", press: true },
  { id: "score", anchor: "score", target: "match", doneBy: "score", press: true },
  { id: "finish", anchor: "finish", target: "match", doneBy: "end", press: true },
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

// Called by a screen right after the visitor does something. It moves the tour
// past the step that was waiting for that action — including when the visitor
// got there first and the step is still ahead of them. They pair the round while
// the card is still on "the roster", and without this the tour would then park
// on a pairing button that no longer exists, offering to take them to a screen
// where it is not. Something already done is never walked back to.
export function tourDone(action: string) {
  const i = tourStep();
  if (i < 0) return;
  const target = TOUR_STEPS.findIndex((s) => s.doneBy === action);
  if (target < i) return;
  set(Math.min(target + 1, TOUR_STEPS.length - 1));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const find = (sel: string) => document.querySelector<HTMLElement>(sel);
// A disabled button swallows a synthetic click, so it counts as "not there".
const usable = (el: HTMLElement | null) => (el && !(el as HTMLButtonElement).disabled ? el : null);

// Imitates the visitor pressing the control a step is about, by clicking the real
// element — so the screen runs exactly the handler a finger would, and reports
// `tourDone` itself. Returns false when the control is missing or disabled, in
// which case "Next" does nothing rather than skip the step.
export async function pressStep(id: string): Promise<boolean> {
  const step = TOUR_STEPS.find((s) => s.id === id);
  if (!step) return false;
  const anchor = () => find(`[data-tour="${step.anchor}"]`);

  if (id === "score") {
    // Play the match out for the visitor's own side, one set at a time, until the
    // screen reports the sets it is played to as won (it advances the tour then).
    // Bounded, so a screen that never gets there cannot keep this looping.
    let taps = 0;
    while (TOUR_STEPS[tourStep()]?.id === "score" && taps < 12) {
      const button = usable(find('[data-tour="score"] [data-mine]') ?? find('[data-tour="score"] button'));
      if (!button) { await sleep(150); taps++; continue; }
      button.click();
      taps++;
      await sleep(550);
    }
    return true;
  }

  const el = usable(anchor());
  if (!el) return false;
  el.click();
  if (id === "finish") {
    // Ending a match asks first, in place; the visitor's "Next" answers it too.
    for (let i = 0; i < 10; i++) {
      await sleep(100);
      const confirm = usable(find('[data-tour="confirm-end"]'));
      if (confirm) { confirm.click(); return true; }
    }
    return false;
  }
  return true;
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
