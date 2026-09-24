import { useT } from "../i18n";
import HelpTip from "./HelpTip";

export type TournamentFormat = "SWISS" | "KNOCKOUT" | "PLACEMENT";
const FORMATS: TournamentFormat[] = ["SWISS", "KNOCKOUT", "PLACEMENT"];

// How an event's rounds are paired (Tournament.format, server/src/shared/bracket.ts):
// Swiss with nobody eliminated, a knockout bracket, or a bracket where every place
// is played for. Each option carries a one-line summary and a "?" with the full
// description. Used on the create form and in the manager's edit panel, which
// only offers it before round 1.
export default function FormatPicker({ value, onChange }: { value: TournamentFormat; onChange: (f: TournamentFormat) => void }) {
  const { t } = useT();
  return (
    <div className="space-y-2">
      {FORMATS.map(f => (
        // The "?" is a button of its own, so it sits beside the option's button
        // rather than inside it.
        <div key={f} className={`flex items-start gap-1 rounded-lg border ${value === f ? "border-[#ccff00] bg-[#ccff00]/10" : "border-[#1c3350]"}`}>
          <button type="button" onClick={() => onChange(f)} aria-pressed={value === f} className="flex-1 min-w-0 text-left p-3 pr-0">
            <span className={`block text-sm font-medium ${value === f ? "text-[#ccff00]" : "text-white"}`}>{t(`format.${f}`)}</span>
            <span className="block text-xs text-[#6b84a0] mt-0.5">{t(`format.${f}.hint`)}</span>
          </button>
          <span className="p-2.5"><HelpTip text={t(`format.${f}.help`)} /></span>
        </div>
      ))}
    </div>
  );
}
