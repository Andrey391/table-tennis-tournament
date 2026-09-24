import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";

// The "?" after a setting's name, with a few lines on what it does. It opens on
// hover with a mouse and on a tap everywhere else: a phone has no hover, and the
// phone is where the app is used. A tap outside, Escape, or scrolling closes it.
// The bubble is portalled to <body> and kept inside the screen with the usual
// 16px gutter, so it is never clipped by a card or pushed off a 375px screen.
export default function HelpTip({ text }: { text: string }) {
  const { t } = useT();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const pointer = useRef<string>("");
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

  const show = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(280, window.innerWidth - 32);
    const left = Math.min(Math.max(16, r.left + r.width / 2 - width / 2), window.innerWidth - width - 16);
    // Below the "?", unless it sits in the lower half of the screen.
    setPos(r.top > window.innerHeight / 2 ? { left, width, bottom: window.innerHeight - r.top + 6 } : { left, width, top: r.bottom + 6 });
  };
  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const outside = (e: PointerEvent) => { if (!button.current?.contains(e.target as Node)) hide(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  return (
    <>
      <button ref={button} type="button" aria-label={t("help.label")} aria-expanded={!!pos} aria-describedby={pos ? id : undefined}
        onPointerDown={e => { pointer.current = e.pointerType; }}
        onPointerEnter={e => { if (e.pointerType === "mouse") show(); }}
        onPointerLeave={e => { if (e.pointerType === "mouse") hide(); }}
        // A mouse has already opened it by hovering; a tap or Enter toggles it.
        onClick={e => { e.preventDefault(); e.stopPropagation(); if (pointer.current === "mouse") show(); else if (pos) hide(); else show(); pointer.current = ""; }}
        className="inline-flex items-center justify-center w-6 h-6 -my-1 ml-0.5 align-middle shrink-0 normal-case tracking-normal">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#4d6480] text-[10px] font-bold leading-none text-[#93a8c2]">?</span>
      </button>
      {pos && createPortal(
        <div id={id} role="tooltip" style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className="z-50 bg-[#16283f] border border-[#1c3350] rounded-lg p-3 text-xs leading-relaxed text-white/85 shadow-lg shadow-black/40 normal-case tracking-normal font-normal">
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
