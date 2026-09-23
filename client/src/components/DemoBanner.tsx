import React from "react";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";
import { btnPrimary, field, fieldLabel } from "../lib/ui";
import { onClaimRequested } from "../lib/tour";
import { useConfirm } from "./ConfirmDialog";
import ConsentFields from "./ConsentFields";

// Says out loud that this account is temporary, and offers the one thing that
// makes it permanent. Claiming updates the account the visitor is already using,
// so the evening they just ran stays theirs — which is the whole reason the demo
// is a real account instead of a browser-side fake.
export default function DemoBanner() {
  const { user, claimDemo, logout } = useAuth();
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ email: "", password: "", firstName: "", lastName: "" });
  const [consent, setConsent] = React.useState({ accept: false, publicProfile: false });
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [confirm, confirmDialog] = useConfirm();

  // A screen that ran into the limits of a demo account asks for the form to be
  // opened here, rather than carrying its own copy of it.
  React.useEffect(() => onClaimRequested(() => {
    setOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }), []);

  if (!user?.isDemo) return null;

  const hoursLeft = user.demoExpiresAt
    ? Math.max(0, Math.round((new Date(user.demoExpiresAt).getTime() - Date.now()) / 3600000))
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { setError(""); await claimDemo({ ...form, acceptTerms: consent.accept, publicProfile: consent.publicProfile }); setOpen(false); }
    catch (err: any) { setError(err.response?.data?.error || t("demo.claimFailed")); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-[#142a44] border-b border-[#1c3350] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-[#ccff00]">{t("demo.title")}</div>
          <div className="text-[11px] text-[#93a8c2] truncate">
            {hoursLeft === null ? t("demo.subtitle") : t("demo.expiresIn", { n: hoursLeft })}
          </div>
        </div>
        <button data-tour="claim" onClick={() => setOpen(o => !o)}
          className="bg-[#ccff00] text-[#0a1628] px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">
          {t("demo.keep")}
        </button>
        <button onClick={async () => { if (await confirm({ title: t("confirm.logoutTitle"), text: t("confirm.logoutDemoText"), confirmLabel: t("demo.exit"), danger: true })) logout(); }} className="text-xs text-[#6b84a0] shrink-0">{t("demo.exit")}</button>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-3 pb-1">
          <p className="text-[11px] text-[#93a8c2]">{t("demo.claimHint")}</p>
          {error && <div className="bg-red-500/10 text-red-400 p-2 rounded-lg text-xs border border-red-500/20">{error}</div>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={fieldLabel}>{t("auth.firstName")}</label>
              <input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className={field} required />
            </div>
            <div>
              <label className={fieldLabel}>{t("auth.lastName")}</label>
              <input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className={field} required />
            </div>
          </div>
          <div>
            <label className={fieldLabel}>{t("auth.email")}</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={field} required />
          </div>
          <div>
            <label className={fieldLabel}>{t("auth.password")}</label>
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={field} minLength={6} required />
          </div>
          <ConsentFields accept={consent.accept} publicProfile={consent.publicProfile} onChange={setConsent} />
          <button type="submit" disabled={saving || !consent.accept}
            className={`${btnPrimary} w-full`}>
            {saving ? t("demo.claiming") : t("demo.claim")}
          </button>
        </form>
      )}
      {confirmDialog}
    </div>
  );
}
