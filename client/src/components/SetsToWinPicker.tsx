// "Sets to win" chooser: the three formats clubs actually play (to 2, 3 or 4 sets)
// as one-tap presets, plus -/+ for anything else. A bare number input used to sit
// here, and on the scoring screen it fired a request per keystroke — typing "3"
// over "1" went through an empty field first.
export default function SetsToWinPicker({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const btn = "h-10 rounded-lg text-sm font-bold border disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} aria-label="-"
        className={`${btn} w-10 bg-[#1c3350] text-[#93a8c2] border-[#1c3350]`}>&minus;</button>
      {[2, 3, 4].map(n => (
        <button key={n} type="button" disabled={disabled} onClick={() => onChange(n)}
          className={`${btn} flex-1 ${value === n ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#0a1628] text-[#93a8c2] border-[#1c3350]"}`}>{n}</button>
      ))}
      {![2, 3, 4].includes(value) && (
        <span className={`${btn} flex-1 flex items-center justify-center bg-[#ccff00] text-[#0a1628] border-[#ccff00]`}>{value}</span>
      )}
      <button type="button" disabled={disabled || value >= 20} onClick={() => onChange(value + 1)} aria-label="+"
        className={`${btn} w-10 bg-[#1c3350] text-[#93a8c2] border-[#1c3350]`}>+</button>
    </div>
  );
}
