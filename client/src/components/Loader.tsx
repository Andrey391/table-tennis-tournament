import { useT } from "../i18n";

// What a list shows while its request is still on the wire. Without it "nothing
// yet" and "not loaded yet" look identical, and a slow connection reads as an
// empty feed. Screens hold `null` until the first response, then swap this out.
export default function Loader({ className = "py-12" }: { className?: string }) {
  const { t } = useT();
  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-3 text-[#6b84a0] text-sm ${className}`}>
      <span className="w-6 h-6 rounded-full border-2 border-[#1c3350] border-t-[#ccff00] animate-spin" />
      {t("common.loading")}
    </div>
  );
}
