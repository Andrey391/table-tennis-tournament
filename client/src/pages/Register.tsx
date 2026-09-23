import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import ConsentFields from "../components/ConsentFields";
import { useT } from "../i18n";
import { btnPrimary, card, errorBox, field, fieldLabel } from "../lib/ui";

export default function Register() {
  const { register } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ email: "", password: "", firstName: "", lastName: "", club: "", city: "" });
  const [consent, setConsent] = React.useState({ accept: false, publicProfile: false });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { setError(""); await register({ ...form, acceptTerms: consent.accept, publicProfile: consent.publicProfile }); navigate("/"); }
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
        <form onSubmit={handleSubmit} className={`${card} space-y-4 p-6`}>
          {error && <div className={errorBox}>{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>{t("auth.firstName")}</label>
              <input type="text" value={form.firstName} onChange={set("firstName")}
                className={field} required />
            </div>
            <div>
              <label className={fieldLabel}>{t("auth.lastName")}</label>
              <input type="text" value={form.lastName} onChange={set("lastName")}
                className={field} required />
            </div>
          </div>
          <div>
            <label className={fieldLabel}>{t("auth.email")}</label>
            <input type="email" value={form.email} onChange={set("email")}
              className={field} required />
          </div>
          <div>
            <label className={fieldLabel}>{t("auth.password")}</label>
            <input type="password" value={form.password} onChange={set("password")}
              className={field} required minLength={6} />
          </div>
          <div>
            <label className={fieldLabel}>{t("auth.club")}</label>
            <input type="text" value={form.club} onChange={set("club")} placeholder={t("auth.optional")}
              className={field} />
          </div>
          <div>
            <label className={fieldLabel}>{t("auth.city")}</label>
            <input type="text" value={form.city} onChange={set("city")} placeholder={t("auth.optional")}
              className={field} />
          </div>
          <ConsentFields accept={consent.accept} publicProfile={consent.publicProfile} onChange={setConsent} />
          <button type="submit" disabled={loading || !consent.accept}
            className={`${btnPrimary} w-full`}>
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
