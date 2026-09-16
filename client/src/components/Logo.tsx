import { Link } from "react-router-dom";

export default function Logo({ size = "sm", as = "link" }: { size?: "sm" | "lg"; as?: "link" | "plain" }) {
  const lg = size === "lg";
  const inner = (
    <>
      <span className={`inline-flex items-center justify-center rounded-full bg-[#ccff00] shrink-0 ${lg ? "w-8 h-8" : "w-6 h-6"}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#0a1628" strokeWidth={2.5} strokeLinecap="round" className={lg ? "w-5 h-5" : "w-4 h-4"}>
          <path d="M6.6 14.4a6.6 6.6 0 0 1 7.8-7.8" />
        </svg>
      </span>
      <span className={`font-bold tracking-tight leading-none ${lg ? "text-2xl" : "text-sm"}`}>
        TT <span className="text-[#ccff00]">TOURNAMENT</span>
      </span>
    </>
  );

  if (as === "plain") return <div className={`inline-flex items-center ${lg ? "gap-2.5" : "gap-2"}`}>{inner}</div>;
  return <Link to="/" className={`inline-flex items-center text-white ${lg ? "gap-2.5" : "gap-2"}`}>{inner}</Link>;
}
