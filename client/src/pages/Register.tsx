import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import { useT } from "../i18n";

export default function Register() {
  const { register } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ email: "", password: "", firstName: "", lastName: "", club: "", city: "" });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { setError(""); await register(form); navigate("/"); }
    catch (err: any) { setError(err.response?.data?.error || t("auth.registerFailed")); }
    finally { setLoading(false); }
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo size="lg" as="plain" />
          <p className="text-[#6b84a0] text-sm mt-3">{t("auth.createSubtitle")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-[#101f36] p-6 rounded-lg border border-[#1c3350]">
          {error && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm border border-red-500/20">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("auth.firstName")}</label>
              <input type="text" value={form.firstName} onChange={set("firstName")}
                className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("auth.lastName")}</label>
              <input type="text" value={form.lastName} onChange={set("lastName")}
                className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("auth.email")}</label>
            <input type="email" value={form.email} onChange={set("email")}
              className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("auth.password")}</label>
            <input type="password" value={form.password} onChange={set("password")}
              className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" required minLength={6} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("auth.club")}</label>
            <input type="text" value={form.club} onChange={set("club")} placeholder={t("auth.optional")}
              className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider">{t("auth.city")}</label>
            <input type="text" value={form.city} onChange={set("city")} placeholder={t("auth.optional")}
              className="w-full px-3 py-2.5 bg-[#0a1628] rounded border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-[#ccff00] text-[#0a1628] py-3 rounded-lg text-sm font-bold hover:bg-[#d8ff33] disabled:opacity-50 transition-colors">
            {loading ? t("auth.creating") : t("auth.createAccount")}
          </button>
          <p className="text-center text-sm text-[#6b84a0]">
            {t("auth.haveAccount")} <Link to="/login" className="text-[#ccff00] font-medium">{t("auth.signIn")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
