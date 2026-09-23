import React from "react";
import { Link, useLocation } from "react-router-dom";
import { apiService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import { useT } from "../i18n";
import { btnPrimary, card, errorBox, field, fieldLabel, noticeBox } from "../lib/ui";

const RESEND_SEC = 60;

// Forgot password, in two steps on one screen: the address gets a 6-digit code
// by email, and the code plus a new password signs the user straight in (the
// /forgot route then redirects home, like /login does for a signed-in user).
export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const { t } = useT();
  const location = useLocation();
  const [email, setEmail] = React.useState<string>((location.state as any)?.email || "");
  const [sent, setSent] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [password2, setPassword2] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [wait, setWait] = React.useState(0);

  React.useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const failText = (err: any, fallback: string) =>
    err.response?.status === 429 ? t("forgot.tooMany") : err.response?.status === 503 ? t("forgot.mailFailed") : fallback;

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true); setError("");
    try { await apiService.auth.forgot(email.trim()); setSent(true); setWait(RESEND_SEC); }
    catch (err: any) { setError(failText(err, t("common.failed"))); }
    finally { setLoading(false); }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== password2) { setError(t("forgot.mismatch")); return; }
    setLoading(true); setError("");
    try { await resetPassword({ email: email.trim(), code: code.trim(), newPassword: password }); }
    catch (err: any) { setError(failText(err, t("forgot.badCode"))); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo size="lg" as="plain" />
          <p className="text-[#6b84a0] text-sm mt-3">{t("forgot.title")}</p>
        </div>
        {!sent ? (
          <form onSubmit={sendCode} className={`${card} space-y-4 p-6`}>
            {error && <div className={errorBox}>{error}</div>}
            <p className="text-sm text-[#93a8c2]">{t("forgot.intro")}</p>
            <div>
              <label className={fieldLabel}>{t("auth.email")}</label>
              <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={field} required />
            </div>
            <button type="submit" disabled={loading} className={`${btnPrimary} w-full`}>
              {loading ? t("forgot.sending") : t("forgot.send")}
            </button>
            <p className="text-center text-sm"><Link to="/login" className="text-[#ccff00] font-medium">{t("forgot.backToLogin")}</Link></p>
          </form>
        ) : (
          <form onSubmit={submitReset} className={`${card} space-y-4 p-6`}>
            <div className={noticeBox}>{t("forgot.sent", { email: email.trim() })}</div>
            {error && <div className={errorBox}>{error}</div>}
            <div>
              <label className={fieldLabel}>{t("forgot.code")}</label>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="000000"
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${field} text-center text-xl tracking-[0.5em] font-bold`} required autoFocus />
            </div>
            <div>
              <label className={fieldLabel}>{t("forgot.newPassword")}</label>
              <input type="password" autoComplete="new-password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} className={field} required />
            </div>
            <div>
              <label className={fieldLabel}>{t("forgot.repeatPassword")}</label>
              <input type="password" autoComplete="new-password" minLength={6} value={password2} onChange={e => setPassword2(e.target.value)} className={field} required />
            </div>
            <button type="submit" disabled={loading || code.length !== 6} className={`${btnPrimary} w-full`}>
              {loading ? t("forgot.saving") : t("forgot.save")}
            </button>
            <p className="text-center text-xs text-[#6b84a0]">
              {wait > 0
                ? t("forgot.resendIn", { n: wait })
                : <button type="button" onClick={() => sendCode()} disabled={loading} className="text-[#ccff00] font-medium">{t("forgot.resend")}</button>}
            </p>
            <p className="text-center text-xs">
              <button type="button" onClick={() => { setSent(false); setCode(""); setError(""); }} className="text-[#93a8c2]">{t("forgot.otherEmail")}</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
