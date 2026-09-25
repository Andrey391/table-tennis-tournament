---
paths:
  - "server/src/shared/bracket.ts"
  - "server/src/shared/standings.ts"
  - "server/src/routes/tournaments.ts"
  - "client/src/components/BracketView.tsx"
  - "client/src/components/FormatPicker.tsx"
---

# Bracket formats (`Tournament.format`: `SWISS` | `KNOCKOUT` | `PLACEMENT`)

- **`KNOCKOUT`** ("с выбыванием"): one loss and the player is out. The two semi-final losers always play for 3rd place.
- **`PLACEMENT`** ("без выбывания, все места"): nobody leaves. Winners play winners and losers play losers inside their half, recursively, so every place from 1st to last is played for.
- **Round 1** is drawn like Swiss: manual seeding if set, else rating, adjacent pairs. The bracket size is the next power of two. Empty seats go to the top seeds, and an empty seat always loses without a match ("проходит без игры", notified as `ROUND_BYE`). After round 1 the tree is fixed: pairings `2j` and `2j+1` of a group feed the next round.
- **Nothing about the bracket is stored** except matches. `Match.matchIndex` (position in its round), `round` and the roster's `seed`s rebuild the tree. `computeBracket`/`bracketOf` is a pure function of them. It returns every slot with the places it is played for, the `next` round to pair, `complete`, and each player's `place`. It is the only copy of the logic:
  - `/pair` creates `next`.
  - `GET /tournaments/:id` returns `bracket` (`bracketView`: an undecided seat is absent, an empty seat is `null`).
  - `BracketView.tsx` draws it round under round, with no horizontal scrolling.
  - `eventStandings` ranks by `place` (ties share one, e.g. 5th-8th) and uses the Swiss order only within a tie.
- **Roster fixed from round 1** (`rosterFixed` in `tournaments.ts`): join, add and approve answer 400. Removing a player always marks them `WITHDRAWN`, even with no match played, because deleting the row would shift every later seat. They become an empty seat and rank last in the group they left. A match already paired against them needs a walkover.
- **Completion**: only when `bracketOf(...).complete`. After that, `/pair` answers 400. `/undo` of a finished match is refused once a later round exists, because that round was drawn from its result.
- Format is chosen with `FormatPicker.tsx` (create form and edit panel), and can change only in `DRAFT`.
- **Testing a change to the tree logic**: for every size from 2 to 17 players in both formats, play random results until `next` is null. Then check `complete`, and for `PLACEMENT` that places come out as 1..N.
