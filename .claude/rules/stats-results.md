---
paths:
  - "server/src/routes/stats.ts"
  - "server/src/shared/stats.ts"
  - "server/src/routes/players.ts"
  - "server/src/routes/profile.ts"
  - "client/src/components/PlayerStats.tsx"
  - "client/src/pages/ResultsPage.tsx"
  - "client/src/pages/PlayerPage.tsx"
  - "client/src/pages/ProfilePage.tsx"
  - "client/src/pages/RatingPage.tsx"
---

# Results, leaders, player statistics

Everything is computed live from completed matches. Nothing is cached or denormalized onto `User`. The public endpoints return the public player shape.

- `GET /results?kind=&city=&clubId=&q=&userId=`: `ACTIVE`/`COMPLETED` events, newest first. Each has a `podium` (top 3 of `eventStandings`, with `ratingChange` and set score), a player count and a live-match count. `userId` narrows to that player's events and then includes private ones. Backs the "Итоги" tab of `ResultsPage`.
- `GET /leaders?metric=rating|wins|played&period=month|year|all&city=`: "Лидеры" tab. `rating` = net change (`eloDelta` for wins, `eloDeltaLoser` for losses) over the window. Demo players are excluded and the output is filtered by `listed`.
- **Rating list**: `GET /rating?city=&clubId=`. `clubId` means followers of the club, or players with a `REGISTERED`/`WITHDRAWN` row in an event there. Uses `notDemo` + `listed`.
  - Its UI is the "Таблица" option of the Leaders tab in `ResultsPage` (no city filter there).
  - `RatingPage.tsx` (opens on the viewer's city, keeps a hand-picked one under `localStorage` `ratingCity`) is still routed at `/rating` and `/players` (`PlayersPage` re-exports it), but nothing links to it.
  - Both explain that this is the app's own FNTR-formula rating, not the official one.
- `GET /players/:id/stats`:
  - Rating history, walked backwards from today's rating through the stored deltas.
  - Form (last 10) and streaks.
  - Match, set and deciding-set rates. A decider = final tally one apart with the loser on at least one set.
  - Best win and the 100+ achievement use `rating1Before`/`rating2Before`, so old matches with nulls don't count.
  - Nemesis/favourite opponent (2+ meetings), placings in finished events of 3+ players, achievements (computed live, never stored).
  - Rendered by `PlayerStats.tsx` on `ProfilePage` and `PlayerPage`.
- `GET /players/:id/h2h/:otherId`: `HeadToHead` on `PlayerPage` (someone else, signed in) and compact on `MatchPage` before the start.
- `GET /players/:id` (unauthenticated, public shape): the last 25 completed matches with opponent, event and sets, plus win/loss. Backs `/player/:id` and the history on `ProfilePage`. **Every place a player is listed links to `/player/:id`.**
- `GET /profile/stats` (auth):
  - `events`: how many tournaments and games the caller is `REGISTERED` in.
  - A `matches` and a `sets` tally (played/wins/losses), split into `tournaments`, `games` and `total`.
  - `ProfilePage` shows tournaments and games as two cards, since only tournaments move the rating. `ProfilePage` calls `refreshUser()` on mount.
