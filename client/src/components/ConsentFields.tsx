import { Link } from "react-router-dom";
import { useT } from "../i18n";

// The two consents a signup asks for, used by Register and by the demo's claim
// form. They are separate on purpose (152-FZ): processing the data at all is a
// condition of having an account; showing the name to anyone at all is not, so
// it is its own box and starts unticked.
export default function ConsentFields({ accept, publicProfile, onChange }: {
  accept: boolean; publicProfile: boolean;
  onChange: (next: { accept: boolean; publicProfile: boolean }) => void;
}) {
  const { t } = useT();
  const doc = (to: string, key: string) => <Link to={to} target="_blank" className="text-[#ccff00] underline">{t(key)}</Link>;
  return (
    <div className="space-y-2.5">
      <label className="flex items-start gap-2.5 text-xs text-[#93a8c2] leading-snug">
        <input type="checkbox" checked={accept} onChange={e => onChange({ accept: e.target.checked, publicProfile })} required className="mt-0.5 accent-[#ccff00] shrink-0" />
        <span>{t("legal.acceptPrefix")} {doc("/privacy", "legal.privacyLink")} {t("legal.and")} {doc("/terms", "legal.termsLink")}{t("legal.acceptSuffix")}</span>
      </label>
      <label className="flex items-start gap-2.5 text-xs text-[#93a8c2] leading-snug">
        <input type="checkbox" checked={publicProfile} onChange={e => onChange({ accept, publicProfile: e.target.checked })} className="mt-0.5 accent-[#ccff00] shrink-0" />
        <span>{t("legal.publicConsent")}</span>
      </label>
    </div>
  );
}
