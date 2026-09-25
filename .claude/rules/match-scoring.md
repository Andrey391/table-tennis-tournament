---
paths:
  - "server/src/routes/matches.ts"
  - "server/src/shared/scoring.ts"
  - "client/src/pages/MatchPage.tsx"
  - "client/src/pages/LiveScore.tsx"
  - "client/src/components/SetsToWinPicker.tsx"
---

# Match scoring (sets, not points)

## Who may do what (`loadScorableMatch` returns the match plus `isManager`)
- **Manager or either player**: change `setsToWin` while `NOT_STARTED`, `/start`, `/score`, `/undo` on an unfinished match, `/end`.
- **Manager only**: `/forfeit`, reopening a `COMPLETED` match via `/undo`, and changing table or judge (`PUT /matches/:id`).
- `/start` refuses a `COMPLETED` match: that would reopen it without handing the rating back.

## Recording
- `/start` just opens the match. No set is created up front.
- `/score { side, score1?, score2? }` appends one `MatchSet` (`index`, `winner`, `status: COMPLETED`) and increments `setsWon1`/`setsWon2`. The rally score is optional and for the record only: both or neither, it must agree with `side`, and 0:0 means "not entered" (`checkSetScore`). Nothing derives the winner from it.
- `/undo` deletes the last set row and decrements its tally. One step back, no deeper history.
- There is no rally-by-rally board, deuce, service rotation or end-swapping. Asking for one is a new feature. The unmapped DB columns `serverSide`/`lastScorer`/`prevServerSide`/`letCount`/`pointsToWin` are leftovers; nothing reads them.
- `setsToWin` (default 3, any number >= 1, edited with `SetsToWinPicker`) is a **prompt, not a cap**. Reaching it highlights "Завершить" and says playing on is fine. Ending earlier asks with a different confirm text.

## Settling (`/end`, `/forfeit` -> `finishMatch`)
- Nothing ends a match on its own. Only `COMPLETED` matches count in standings, stats and rating, and an open match blocks the round.
- **No draws**: `/end` refuses an equal tally or a match with no sets (400, `checkCanEnd`). `MatchPage` disables the button with the reason.
- **One settler**: `/end` and `/forfeit` first `claimMatch` (a conditional write of `endedAt` on a non-`COMPLETED` match, taken over after a minute). Anyone else gets 409. The tally is then re-read. Without this, parallel taps each moved the rating.
- **Rating first**: `finishMatch` calls `applyRatingUpdate` (single-statement writes, no `$transaction`, because the pooler drops multi-statement transactions). Only then does it mark the match `COMPLETED`, in one write that also stores `eloDelta`/`eloDeltaLoser`/`rating1Before`/`rating2Before`. If that write fails, the rating is reverted. After the match is settled, housekeeping failures (cancel open sets, notify, `maybeCompleteTournament`) are logged, never returned.
- **Walkover**: `POST /matches/:id/forfeit { loserSide }` works from any non-`COMPLETED` state, including `NOT_STARTED`. It records one set for whoever turned up and is **unrated** (`finishMatch(match, false)`).
- **Reopen**: `/undo` on a `COMPLETED` match uses `updateMany where status COMPLETED` (so only one caller wins). It sets `IN_PROGRESS` and clears `endedAt`, hands back exactly the stored deltas (`revertRatingUpdate`), and flips the event back to `ACTIVE`. For brackets it is refused once a later round exists.

## MatchPage and LiveScore
- Big set tally, two "set to side N" buttons, one undo, and "Завершить" as the full-width primary action. A chip per set shows who took it. The manager sees "Вернуть матч в игру" on a finished match. Head-to-head is shown compact before the start.
- Both screens poll every 2s. **Every mutation on `MatchPage` goes through `write()`**: it tracks in-flight writes and a generation counter, skips polls during a write, and drops a poll response whose generation changed. Otherwise a poll overlapping `/score` rolls the tally back and the judge taps twice.
- After a failed `/end`, `MatchPage` re-reads the match and leaves for the event if it is in fact `COMPLETED`.
- Every irreversible action (end, walkover, undo, reopen) goes through `useConfirm()`.
