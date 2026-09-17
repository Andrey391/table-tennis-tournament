import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import { useT } from "../i18n";

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
        <form onSubmit={handleSubmit} className="space-y-4 bg-[#101f36] p-6 rounded-lg border border-[#1c3350]">
          {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("auth.email")}</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none transition-colors" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("auth.password")}</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none transition-colors" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-[#ccff00] text-[#0a1628] py-3 rounded-lg text-sm font-bold hover:bg-[#d8ff33] disabled:opacity-50 transition-colors">
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
          {/* Browsing is open; an account is only needed to take part. */}
          <button type="button" onClick={() => navigate("/")}
            className="w-full bg-transparent text-[#93a8c2] py-2.5 rounded-lg text-sm font-medium border border-[#1c3350]">
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
