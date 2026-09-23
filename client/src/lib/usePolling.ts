import { useEffect, useRef } from "react";

// Runs `fn` now and then again `intervalMs` after each run has *finished* — so a
// slow answer never has a second request stacked on top of it, which is what
// setInterval did whenever the server took longer than the interval. Stops while
// the tab is hidden (a phone in a pocket keeps nothing on screen to update) and
// runs at once when it comes back. `key` restarts the loop, e.g. when the id on
// screen changes; the latest `fn` is always the one called.
export function usePolling(fn: () => unknown, intervalMs: number, key: unknown = null, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let stopped = false;

    const schedule = () => {
      if (stopped || timer != null || document.visibilityState !== "visible") return;
      timer = setTimeout(tick, intervalMs);
    };
    const tick = async () => {
      timer = null;
      if (stopped || running) return;
      running = true;
      try { await fnRef.current(); } catch { /* the next run will try again */ }
      running = false;
      schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") { if (timer != null) { clearTimeout(timer); timer = null; } return; }
      if (timer != null) { clearTimeout(timer); timer = null; }
      tick();
    };

    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (timer != null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, key, enabled]);
}
