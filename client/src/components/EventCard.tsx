import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { formatEventDay, formatTimeRange, formatRating } from "../lib/format";
import { cardFeature } from "../lib/ui";

// A feed card in the shape people recognise from other sport apps: when, where,
// what kind of event, and the faces of who is playing. Full width of the column,
// so on a desktop it stretches exactly like the plain cards it replaced. Shared by
// the home feed and the games list so the two cannot drift apart.
export default function EventCard({ tr }: { tr: any }) {
  const { t, lang } = useT();
  const badge = tr.status === "ACTIVE" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
    tr.status === "COMPLETED" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
    tr.status === "CANCELLED" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
    "bg-[#1c3350] text-[#93a8c2] border border-[#1c3350]";
  const total = tr._count?.players || 0;
  // Room for four faces; when there are more, the last slot says how many.
  const faces: any[] = tr.players || [];
  const overflow = total > 4 ? total - 3 : 0;
  const shown = overflow ? faces.slice(0, 3) : faces.slice(0, 4);
  const icon = "w-4 h-4 shrink-0 text-[#ccff00]";
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };
  return (
    <Link to={`/tournament/${tr.id}`}
      className={`${cardFeature} block overflow-hidden p-4 active:brightness-110 transition`}>
      <div className="flex justify-between items-start gap-2 mb-3">
        <h3 className="font-bold text-lg leading-tight min-w-0 truncate">{tr.name}</h3>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${badge}`}>{t(`status.${tr.status}`)}</span>
          {tr.myStatus === "PENDING" && <span className="text-[10px] text-yellow-400">{t("tournament.requested")}</span>}
          {tr.isOrganizer && <span className="text-[10px] text-[#6b84a0]">{t("tournament.manager")}</span>}
        </div>
      </div>
      <div className="space-y-2 text-sm">
        {tr.startTime && (
          <p className="flex items-center gap-2.5 text-white">
            <svg {...line} className={icon}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <span className="truncate">{formatEventDay(tr.startTime, lang)} | {formatTimeRange(tr.startTime, tr.endTime, lang)}</span>
          </p>
        )}
        {tr.club && (
          <p className="flex items-center gap-2.5 text-white">
            <svg {...line} className={icon}><path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
            <span className="truncate">{tr.club.name} | {tr.club.city}</span>
          </p>
        )}
        <p className="flex items-center justify-between gap-2.5 text-white">
          <span className="flex items-center gap-2.5 min-w-0">
            <svg {...line} className={icon}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>
            <span className="truncate">{t(tr.kind === "GAME" ? "games.unrated" : "home.rated")}</span>
          </span>
          <span className="text-xs text-[#93a8c2] shrink-0">{total}{tr.maxPlayers ? `/${tr.maxPlayers}` : ""} {t("common.players")}</span>
        </p>
      </div>
      {total > 0 && (
        <div className="grid grid-cols-4 gap-1 mt-4">
          {shown.map((p: any) => (
            <div key={p.userId} className="flex flex-col items-center min-w-0 text-center">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-[#16283f] border border-[#24405e] flex items-center justify-center text-sm font-bold">
                  {`${p.user?.firstName?.[0] || ""}${p.user?.lastName?.[0] || ""}`.toUpperCase() || "?"}
                </div>
                <span className="absolute -top-1 -right-2 bg-[#ccff00] text-[#0a1628] text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none border-2 border-[#101f36]">{formatRating(p.user?.rating)}</span>
              </div>
              <span className="mt-1.5 text-[11px] font-medium leading-tight max-w-full truncate">{p.user?.lastName}</span>
              <span className="text-[11px] text-[#93a8c2] leading-tight max-w-full truncate">{p.user?.firstName}</span>
            </div>
          ))}
          {overflow > 0 && (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full border border-dashed border-[#24405e] flex items-center justify-center text-sm font-bold text-[#93a8c2]">+{overflow}</div>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}
