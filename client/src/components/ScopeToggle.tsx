// The "All / Mine" switch above an event feed. Hidden for a guest, who has no "mine".
export default function ScopeToggle({ scope, onChange, labels, hidden }: {
  scope: "all" | "mine"; onChange: (s: "all" | "mine") => void; labels: [string, string]; hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="flex gap-2 mb-3">
      {(["all", "mine"] as const).map((sc, i) => (
        <button key={sc} onClick={() => onChange(sc)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
            scope === sc ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#101f36] text-[#93a8c2] border-[#1c3350]"
          }`}>{labels[i]}</button>
      ))}
    </div>
  );
}
