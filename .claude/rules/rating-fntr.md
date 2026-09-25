---
paths:
  - "server/src/shared/scoring.ts"
  - "server/src/routes/matches.ts"
  - "server/src/shared/standings.ts"
  - "server/src/shared/stats.ts"
  - "server/prisma/recalc-fntr.sql"
  - "client/src/lib/format.ts"
  - "client/src/pages/RatingPage.tsx"
  - "client/src/pages/ResultsPage.tsx"
---

# Rating: FNTR formula, starts at 100

`User.rating` is global and a `Float`. New accounts get 100. It sorts round-1 seeding and later tiebreaks. It is the app's own rating computed with the ФНТР formula, not the official ФНТР rating, and the rating list says so (`rating.how*` i18n keys). **Keep that text in step with the formula.**

## Formula (`computeFntrDelta` / `computeFntrMatchDelta` in `shared/scoring.ts`)
- The formula rates a **set**. The set winner gains `(100 - (Rw - Rl)) / 10 * KT`, and the loser gives up **half** of that.
- If `Rw - Rl > 100`, that set's exchange is 0 for both. Without this the winner would lose points.
- A **match** is the sum over every set played. Each set is priced against the same pair of ratings: `computeFntrDelta` runs once in each direction and is multiplied by each side's set count. A player can net a gain while losing the match.
- **KT** = `Tournament.ratingWeight`, 0.1-1, default 0.5. It is set on the create form and edit panel, and accepted by `POST`/`PUT /tournaments`.
- **Input ratings are those at the start of the event**: `TournamentUser.ratingStart` is written at the player's first settled match in that event and read afterwards. The change still goes into `User.rating` immediately, so only the inputs are pinned. A player added after round 1 gets `ratingStart` at their own first settled match.
- Values are rounded with `round2`. Each side is floored at 0 independently. The client shows ratings with `formatRating` and deltas with `formatDelta`.

## Where it is applied
- `applyRatingUpdate(tournament, p1, p2, setsWon1, setsWon2)` in `routes/matches.ts`, called by `/end`. It **returns immediately for a `GAME`**: that check is the single gate that keeps games unrated. Don't route around it, and don't call the delta helpers anywhere that doesn't have the event kind. Walkovers are unrated too.
- Not zero-sum, so both changes are stored: `Match.eloDelta` belongs to the match winner (by set tally), `Match.eloDeltaLoser` to the match loser. **Neither sign is guaranteed**. Every consumer (`standings.ts`, `stats.ts`, `matchDelta` in `lib/format.ts`) reads `eloDeltaLoser`. **Never reintroduce `-eloDelta`**, and never assume `eloDeltaLoser <= 0`. The column names are historical.
- Undo hands back the stored deltas rather than recomputing (`revertRatingUpdate`).

## Recalculation (`server/prisma/recalc-fntr.sql`)
- Run by hand after `migration.sql`. It is one `DO` block (works through the pooler, all or nothing) and a **dry run** by default: it prints NOTICEs, and `apply_changes = true` writes.
- It replays rated matches (completed, `TOURNAMENT`, distinct winner, with `eloDelta`) in `endedAt` order from 100 (demo accounts from their first match snapshot; winners without `eloDelta`, i.e. walkovers and old rows, are counted and skipped) and rewrites `User.rating`, both deltas, `rating1Before/2Before` and `ratingStart`. It is idempotent.
- **The formula lives in two places**: `computeFntrMatchDelta` and this file. Change both. Rounding can differ by 0.01 on half-cent boundaries.
- Never run it against the real database from here.

## Decided by the app, not the published sources
Starting rating 100, walkovers unrated, floor at 0. Only the formulas on ttsport.ru / ttw.ru were consulted, not the official Положение.
