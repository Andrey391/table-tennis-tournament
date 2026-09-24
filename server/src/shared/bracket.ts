// Bracket formats, next to the default Swiss one (Tournament.format):
//
//   SWISS      nobody is eliminated; every round re-pairs the room by wins so far
//              (shared/scheduler.ts). The default, and what every event was before.
//   KNOCKOUT   "с выбыванием": lose once and you are out. Winners meet winners up to
//              the final, and the two semi-final losers play for 3rd place.
//   PLACEMENT  "без выбывания, все места": nobody leaves. Winners play winners and
//              losers play losers inside their own half, recursively, so after the
//              last round every place from 1st to last has been played for.
//
// Both brackets are drawn from the round-1 seeding (manual seeding, else rating),
// paired adjacent like the Swiss round 1: seed 1 v 2, 3 v 4, ... The bracket has
// the next power of two of places; the missing ones are empty seats, given to the
// top seeds, and an empty seat always loses without a match being played.
//
// Nothing about the bracket is stored except the matches themselves: a match's
// `round` and `matchIndex` (its position in that round) plus the seeds on the
// roster are enough to rebuild the whole tree, so this is a pure function of them
// and the server never holds a second copy that could drift.

export type TournamentFormat = "SWISS" | "KNOCKOUT" | "PLACEMENT";
export type BracketFormat = Exclude<TournamentFormat, "SWISS">;
export const isBracket = (f: string | null | undefined): f is BracketFormat => f === "KNOCKOUT" || f === "PLACEMENT";

export type BracketMatchInput = {
  id: string;
  round: number;
  matchIndex: number | null;
  player1Id: string | null;
  player2Id: string | null;
  status: string;
  setsWon1: number;
  setsWon2: number;
};

// A seat in a pairing: a player id, null for an empty seat (a bye), undefined while
// it waits on a match that has not been decided yet.
type Seat = string | null | undefined;

export type BracketSlot = {
  round: number;
  index: number;       // position in the round; the match's matchIndex
  from: number;        // the places this pairing is played for, e.g. 1-2 (final),
  to: number;          // 3-4 (third place) or 5-8
  p1: Seat;
  p2: Seat;
  matchId: string | null;
  winner: Seat;        // undefined until decided; null when nobody (two empty seats)
  loser: Seat;
};

export type Bracket = {
  format: BracketFormat;
  size: number;        // places in the bracket, a power of two
  rounds: number;
  slots: BracketSlot[];
  // What POST /pair should create next: the first round whose pairings are all
  // known and that still has matches to play. Null when there is nothing to pair.
  next: { round: number; pairs: { index: number; p1: string; p2: string }[]; byes: string[] } | null;
  complete: boolean;
  // Best place each player is known to be playing for: final once the bracket is
  // complete, a lower bound while it runs. Ties (the 5-8 group of a knockout) share one.
  place: Map<string, number>;
};

export function bracketSize(players: number): number {
  let size = 2;
  while (size < players) size *= 2;
  return size;
}

export function computeBracket(format: BracketFormat, seeded: string[], matches: BracketMatchInput[], withdrawn: Set<string> = new Set()): Bracket {
  const size = bracketSize(seeded.length);
  const rounds = Math.log2(size);
  const byPosition = new Map(matches.filter((m) => m.matchIndex != null).map((m) => [`${m.round}:${m.matchIndex}`, m]));
  const slots: BracketSlot[] = [];
  const place = new Map<string, number>();
  let next: Bracket["next"] = null;

  // Round 1: the top seeds take the empty seats, everyone else pairs adjacent.
  const byes = size - seeded.length;
  let seats: Seat[] = [];
  for (let k = 0; k < byes; k++) seats.push(seeded[k], null);
  seats.push(...seeded.slice(byes));
  // A block is a run of one round's pairings playing for one range of places.
  let blocks = [{ start: 0, count: size / 2, from: 1, to: size }];

  for (let round = 1; round <= rounds; round++) {
    const inRound: BracketSlot[] = [];
    for (const block of blocks) {
      for (let index = block.start; index < block.start + block.count; index++) {
        let p1 = seats[2 * index], p2 = seats[2 * index + 1];
        const match = byPosition.get(`${round}:${index}`);
        // A player dropped before this pairing was made is not there to play it,
        // and ranks as having lost it.
        const dropped: string[] = [];
        if (!match) {
          if (p1 && withdrawn.has(p1)) { dropped.push(p1); p1 = null; }
          if (p2 && withdrawn.has(p2)) { dropped.push(p2); p2 = null; }
        }
        let winner: Seat, loser: Seat;
        if (p1 === undefined || p2 === undefined) {
          // waits on an earlier match
        } else if (p1 && p2) {
          if (match && match.status === "COMPLETED" && match.setsWon1 !== match.setsWon2) {
            const firstWon = match.setsWon1 > match.setsWon2;
            winner = firstWon ? p1 : p2;
            loser = firstWon ? p2 : p1;
          }
        } else {
          winner = p1 ?? p2 ?? null;
          loser = null;
        }
        inRound.push({ round, index, from: block.from, to: block.to, p1, p2, matchId: match?.id ?? null, winner, loser });

        // A group of G pairings plays for `from`..`to`: its winners stay in the top
        // half of that range, its losers drop to the bottom half (a final: 1st/2nd).
        const loserPlace = block.count === 1 ? block.from + 1 : block.from + block.count;
        // Below everyone who actually played for this group's places.
        for (const p of dropped) place.set(p, block.to + 0.5);
        if (winner !== undefined) {
          if (winner) place.set(winner, block.from);
          if (loser) place.set(loser, loserPlace);
        } else {
          for (const p of [p1, p2]) if (p) place.set(p, block.from);
        }
      }
    }
    slots.push(...inRound);

    const known = inRound.every((s) => s.p1 !== undefined && s.p2 !== undefined);
    const toPlay = inRound.filter((s) => s.p1 && s.p2 && !s.matchId);
    if (!next && known && toPlay.length) {
      next = {
        round,
        pairs: toPlay.map((s) => ({ index: s.index, p1: s.p1 as string, p2: s.p2 as string })),
        byes: inRound.filter((s) => !s.matchId && (s.p1 ? !s.p2 : !!s.p2)).map((s) => (s.p1 ?? s.p2) as string),
      };
    }
    if (round === rounds) break;

    // The next round: in each group, winners of pairings 2j and 2j+1 meet, and so
    // do their losers. A knockout keeps only the winners, except that the losers
    // of the semi-finals play on for 3rd place.
    const nextSeats: Seat[] = [];
    const nextBlocks: typeof blocks = [];
    for (const block of blocks) {
      if (block.count < 2) continue;
      const group = inRound.filter((s) => s.index >= block.start && s.index < block.start + block.count);
      const half = block.count / 2;
      nextBlocks.push({ start: nextSeats.length / 2, count: half, from: block.from, to: block.from + block.count - 1 });
      nextSeats.push(...group.map((s) => s.winner));
      if (format === "PLACEMENT" || (block.count === 2 && block.from === 1)) {
        nextBlocks.push({ start: nextSeats.length / 2, count: half, from: block.from + block.count, to: block.to });
        nextSeats.push(...group.map((s) => s.loser));
      }
    }
    seats = nextSeats;
    blocks = nextBlocks;
  }

  const complete = slots.every((s) => s.winner !== undefined);
  return { format, size, rounds, slots, next, complete, place };
}

// The bracket of an event, from its roster and matches. Seeds are fixed at round
// 1; a player who later withdrew still holds their seat in the rounds already
// played and is simply absent from the ones after.
export function bracketOf(event: {
  format: string;
  players: { userId: string; seed: number | null; status: string }[];
  matches: BracketMatchInput[];
}): Bracket | null {
  if (!isBracket(event.format)) return null;
  const seeded = event.players
    .filter((p) => p.seed != null && (p.status === "REGISTERED" || p.status === "WITHDRAWN"))
    .sort((a, b) => a.seed! - b.seed!)
    .map((p) => p.userId);
  if (seeded.length < 2) return null;
  const withdrawn = new Set(event.players.filter((p) => p.status === "WITHDRAWN").map((p) => p.userId));
  return computeBracket(event.format, seeded, event.matches, withdrawn);
}

// What the client draws. An undecided seat is left out of the JSON (undefined),
// an empty seat is null.
export function bracketView(b: Bracket) {
  return {
    format: b.format, size: b.size, rounds: b.rounds, complete: b.complete,
    slots: b.slots.map((s) => ({ round: s.round, index: s.index, from: s.from, to: s.to, p1: s.p1, p2: s.p2, matchId: s.matchId, winner: s.winner })),
  };
}
