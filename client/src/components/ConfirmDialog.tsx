import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import { btnDanger, btnPrimary, btnSecondary, card } from "../lib/ui";

export interface ConfirmOptions {
  title: string;
  text?: string;
  /** Label of the action button; "Подтвердить" when omitted. */
  confirmLabel?: string;
  /** Red action button: the action loses data or cannot be taken back. */
  danger?: boolean;
}

// The one "are you sure?" of the app: a modal over everything, including the
// demo tour's card, so nothing irreversible fires on the first tap. On a phone it
// sits at the bottom, under the thumb; focus starts on "Cancel", so an accidental
// Enter or a double tap never confirms. Rendered into <body> so it also works on
// screens outside Layout (MatchPage).
export function ConfirmDialog({ open, onConfirm, onCancel, title, text, confirmLabel, danger }: ConfirmOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={e => e.stopPropagation()}
        className={`${card} w-full max-w-sm p-4 space-y-3 text-white shadow-2xl`}>
        <h2 id="confirm-title" className="text-base font-bold">{title}</h2>
        {text && <p className="text-sm text-[#93a8c2]">{text}</p>}
        <div className="flex gap-2 pt-1">
          <button ref={cancelRef} onClick={onCancel} className={`${btnSecondary} flex-1`}>{t("common.cancel")}</button>
          <button onClick={onConfirm} data-tour="confirm-dialog"
            className={`${danger ? btnDanger : btnPrimary} flex-1`}>{confirmLabel || t("common.confirm")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// `const [confirm, dialog] = useConfirm()`, render `{dialog}` once, then
// `if (!(await confirm({ title, danger: true }))) return;` at the top of any
// handler. The dialog closes the moment an answer is given, so a second tap on
// "Confirm" has nothing to land on and the action cannot be sent twice.
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const answer = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);
  const cancel = useCallback(() => answer(false), [answer]);
  const accept = useCallback(() => answer(true), [answer]);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>(resolve => {
    resolver.current?.(false);
    resolver.current = resolve;
    setOpts(o);
  }), []);

  // A screen that unmounts with the dialog open must not leave its handler hanging.
  useEffect(() => () => { resolver.current?.(false); }, []);

  const dialog = <ConfirmDialog open={!!opts} title={opts?.title ?? ""} text={opts?.text} confirmLabel={opts?.confirmLabel}
    danger={opts?.danger} onConfirm={accept} onCancel={cancel} />;
  return [confirm, dialog] as const;
}
