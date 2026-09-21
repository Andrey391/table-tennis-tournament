import { formatRating } from "../lib/format";

export default function Avatar({ firstName, lastName, rating, size = "md" }: { firstName?: string; lastName?: string; rating?: number; size?: "sm" | "md" | "lg" }) {
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";
  const dim = size === "lg" ? "w-16 h-16 text-xl" : size === "sm" ? "w-8 h-8 text-[10px]" : "w-11 h-11 text-sm";
  const badge = size === "lg" ? "text-[11px] px-2 py-0.5 -bottom-1.5 -right-1.5" : "text-[9px] px-1.5 py-0.5 -bottom-1 -right-1";

  return (
    <div className="relative inline-flex shrink-0">
      <div className={`rounded-full bg-[#16283f] border border-[#1c3350] flex items-center justify-center font-bold text-white ${dim}`}>
        {initials}
      </div>
      {rating != null && (
        <span className={`absolute bg-[#ccff00] text-[#0a1628] font-bold rounded-full leading-none border-2 border-[#0a1628] ${badge}`}>
          {formatRating(rating)}
        </span>
      )}
    </div>
  );
}
