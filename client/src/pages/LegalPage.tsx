import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { useT } from "../i18n";
import { legalDoc, type LegalKind } from "../lib/legal";
import { card, pageTitle } from "../lib/ui";

// The privacy policy and the terms of use, readable by anyone — the signup form
// links here, and a policy nobody can open before agreeing to it is no policy.
export default function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, lang } = useT();
  const doc = legalDoc(kind, lang);
  return (
    <Layout>
      <h1 className={`${pageTitle} mb-4`}>{doc.title}</h1>
      <div className={`${card} p-4 space-y-5`}>
        {doc.sections.map(s => (
          <section key={s.h}>
            <h2 className="text-sm font-bold mb-2">{s.h}</h2>
            {s.p.map((p, i) => <p key={i} className="text-sm text-[#93a8c2] leading-relaxed mb-2">{p}</p>)}
          </section>
        ))}
      </div>
      <p className="text-xs text-[#6b84a0] text-center mt-4">
        <Link to={kind === "privacy" ? "/terms" : "/privacy"} className="text-[#ccff00]">{t(kind === "privacy" ? "legal.terms" : "legal.privacy")}</Link>
      </p>
    </Layout>
  );
}
