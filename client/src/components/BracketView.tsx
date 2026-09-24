import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { playerName } from "../lib/format";
import { sectionLabel } from "../lib/ui";

// A slot of the bracket as GET /tournaments/:id sends it (server/src/shared/bracket.ts):
// a seat is a player id, null for an empty seat (a bye), and absent while it waits
// on an earlier match.
export type BracketSlot = { round: number; index: number; from: number; to: number; p1?: string | null; p2?: string | null; matchId: string | null; winner?: string | null };
export type Bracket = { format: "KNOCKOUT" | "PLACEMENT"; size: number; rounds: number; complete: boolean; slots: BracketSlot[] };

// The bracket, drawn as a phone reads it: one round under another rather than
// columns side by side (no horizontal scrolling anywhere in the app). Every round
// is shown from the start, later ones with "?" where a seat depends on a match not
// yet played, so a player can see who they would meet next. Pairings in a round
// are grouped by the places they are played for: the final, 3rd place, 5th-8th.
export default function BracketView({ bracket, players, matches, renderMatch }: {
  bracket: Bracket;
  players: any[];
  matches: any[];
  renderMatch: (m: any) => ReactNode;
}) {
  const { t } = useT();
  const userOf = new Map(players.map((p: any) => [p.userId, p.user]));
  const matchOf = new Map(matches.map((m: any) => [m.id, m]));
  const name = (seat?: string | null) => (seat === undefined ? "?" : seat === null ? "" : playerName(userOf.get(seat)));

  const roundTitle = (r: number) => {
    if (bracket.format === "KNOCKOUT") {
      const left = bracket.rounds - r;
      if (left === 0) return t("bracket.final");
      if (left === 1) return t("bracket.semi");
      if (left === 2) return t("bracket.quarter");
      if (left === 3) return t("bracket.eighth");
    }
    return t("tournament.round", { n: r });
  };
  const groupTitle = (from: number, to: number) =>
    to - from === 1
      ? from === 1 ? t("bracket.finalMatch") : from === 3 ? t("bracket.thirdPlace") : t("bracket.forPlaces", { from, to })
      : t("bracket.forPlaces", { from, to });

  return (
    <div className="space-y-4">
      {Array.from({ length: bracket.rounds }, (_, i) => i + 1).map(round => {
        const inRound = bracket.slots.filter(s => s.round === round && !(s.p1 === null && s.p2 === null));
        const groups: BracketSlot[][] = [];
        for (const s of inRound) {
          const g = groups[groups.length - 1];
          if (g && g[0].from === s.from && g[0].to === s.to) g.push(s); else groups.push([s]);
        }
        return (
          <div key={round}>
            <h2 className={`${sectionLabel} mb-2`}>{roundTitle(round)}</h2>
            {groups.map(group => (
              <div key={`${group[0].from}-${group[0].to}`}>
                {(groups.length > 1 || bracket.format === "PLACEMENT") && (
                  <p className="text-[11px] text-[#4d6480] mb-1.5">{groupTitle(group[0].from, group[0].to)}</p>
                )}
                {group.map(s => {
                  const m = s.matchId ? matchOf.get(s.matchId) : null;
                  if (m) return <div key={s.index}>{renderMatch(m)}</div>;
                  const alone = s.p1 === null ? s.p2 : s.p2 === null ? s.p1 : undefined;
                  if (alone) return (
                    <div key={s.index} className="flex items-center justify-between bg-[#101f36]/60 border border-dashed border-[#1c3350] p-3 rounded-lg mb-2 text-sm">
                      <Link to={`/player/${alone}`} className="truncate text-[#93a8c2]">{name(alone)}</Link>
                      <span className="text-xs text-[#4d6480] shrink-0">{t("bracket.walkThrough")}</span>
                    </div>
                  );
                  return (
                    <div key={s.index} className="flex items-center justify-between bg-[#101f36]/40 border border-[#1c3350]/60 p-3 rounded-lg mb-2 text-sm text-[#6b84a0]">
                      <span className="flex-1 min-w-0 text-right truncate pr-2">{name(s.p1)}</span>
                      <span className="px-3 shrink-0 text-xs text-[#4d6480]">&ndash;</span>
                      <span className="flex-1 min-w-0 truncate pl-2">{name(s.p2)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
      {bracket.complete && <p className="text-xs text-[#4d6480] text-center">{t("bracket.done")}</p>}
    </div>
  );
}
