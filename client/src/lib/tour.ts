// The demo tour's state, kept out of React so any screen can move it along with
// a one-line call after the action it was asking for (`tourDone("pair")`) —
// without the pages having to know a tour exists beyond that one line.
//
// Steps are a fixed order. Each names the element it points at (`data-tour`) and
// the i18n keys for its card; `doneBy` is the moment that advances it on its own,
// so the visitor never has to confirm something they have just done.

export interface TourStep {
  id: string;
  anchor?: string;
  /** Advances the tour when a screen reports this action. */
  doneBy?: string;
}

export const TOUR_STEPS: TourStep[] = [
  { id: "roster", anchor: "roster" },
  { id: "pair", anchor: "pair", doneBy: "pair" },
  { id: "myMatch", anchor: "my-match", doneBy: "openMatch" },
  { id: "score", anchor: "score", doneBy: "score" },
  { id: "finish", anchor: "finish", doneBy: "end" },
  { id: "standings", anchor: "standings" },
  { id: "claim", anchor: "claim" },
];

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
