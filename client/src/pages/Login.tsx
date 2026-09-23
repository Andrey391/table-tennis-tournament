import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import TryDemoButton from "../components/TryDemoButton";
import { useT } from "../i18n";
import { btnGhost, btnPrimary, card, errorBox, field, fieldLabel } from "../lib/ui";

export default function Login() {
  const { login } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { setError(""); await login(email, password); navigate("/"); }
    catch (err: any) { setError(err.response?.data?.error || t("auth.loginFailed")); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo size="lg" as="plain" />
          <p className="text-[#6b84a0] text-sm mt-3">{t("auth.signInSubtitle")}</p>
        </div>
        <form onSubmit={handleSubmit} className={`${card} space-y-4 p-6`}>
          {error && <div className={errorBox}>{error}</div>}
          <div>
            <label className={fieldLabel}>{t("auth.email")}</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}
              className={field} required />
          </div>
          <div>
            <label className={fieldLabel}>{t("auth.password")}</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
              className={field} required />
            <Link to="/forgot" state={{ email }} className="block text-right text-xs text-[#93a8c2] mt-1.5">{t("auth.forgot")}</Link>
          </div>
          <button type="submit" disabled={loading}
            className={`${btnPrimary} w-full`}>
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
          {/* No account at all: a throwaway one with a club night already on it,
              which is the only way to see what the app actually does. */}
          <TryDemoButton variant="ghost" />
          {/* Browsing is open; an account is only needed to take part. */}
          <button type="button" onClick={() => navigate("/")}
            className={`${btnGhost} w-full`}>
            {t("auth.continueAsGuest")}
          </button>
          <p className="text-center text-sm text-[#6b84a0]">
            {t("auth.noAccount")} <Link to="/register" className="text-[#ccff00] font-medium">{t("auth.register")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
