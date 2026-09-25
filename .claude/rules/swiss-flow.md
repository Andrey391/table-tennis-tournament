---
paths:
  - "server/src/routes/tournaments.ts"
  - "server/src/shared/scheduler.ts"
  - "server/src/shared/standings.ts"
  - "client/src/pages/TournamentPage.tsx"
  - "client/src/pages/PublicTournament.tsx"
  - "client/src/pages/Dashboard.tsx"
  - "client/src/pages/GamesPage.tsx"
  - "client/src/pages/CreateTournament.tsx"
  - "client/src/pages/TournamentChatPage.tsx"
---

# Event lifecycle, Swiss pairing, standings

Swiss is the default format and what this file describes; `KNOCKOUT`/`PLACEMENT` differ where `.claude/rules/brackets.md` says so. There is no round robin, groups or best-of-N.

## Roster
- Anyone signed in creates an event and becomes its manager (`organizerId`).
- `POST /tournaments/:id/join` creates a `PENDING` row (an existing non-`REGISTERED` row goes back to `PENDING`). Only a `CANCELLED` event refuses joins.
- The manager approves (`POST /:id/players/:userId/approve` -> `REGISTERED`), or adds known players pre-approved (`POST /:id/players`). Adding **upserts**: `PENDING`/`WITHDRAWN` is promoted to `REGISTERED`.
- `DELETE /:id/players/:userId` deletes the row only while the player has played no match. After that it sets `WITHDRAWN`. Standings read `REGISTERED` + `WITHDRAWN`, pairing reads `REGISTERED` only.
- The Swiss roster is **never locked**: joining, adding and removing all work while `ACTIVE`. A latecomer enters the next round with no wins.
- `maxPlayers` (optional) caps `REGISTERED` rows on all three fill paths: join, add, approve. The approve path re-checks, because requests can outnumber places. The feed's player count is `_count: { players: { where: { status: "REGISTERED" } } }`.
- `minRating`/`maxRating` (optional) are checked against `User.rating` at join time only. A failed check returns 403 with the range. Players already `REGISTERED` stay in.

## Pairing (`POST /:id/pair`, manager only; `generateRoundPairings` in `shared/scheduler.ts`)
- **Round 1** (`DRAFT` -> `ACTIVE`): order by manual seeding (`PUT /:id/seeding { userIds }`, DRAFT only; up/down arrows on `TournamentPage`), else by `User.rating` desc. Pair adjacent: 1v2, 3v4, and so on. `TournamentUser.seed` is set once, here.
- **Round 2+**: allowed only once every match of the current round is `COMPLETED`. Re-rank by wins (rating breaks ties), pair adjacent, and make a best-effort pass to avoid repeat pairings.
- **Odd headcount**: the player with the **most** matches played sits out (rating breaks ties, lowest first). "Fewest" would give the bye to the same person every round. The bye is stored in `RoundBye` (tournament+round unique) and returned as `byes` on `GET /tournaments/:id`. Never infer it from "not in this round's matches", because that also flags latecomers.
- Tables are assigned round-robin over `tablesCount`. `Match.round` and `Match.setsToWin` are stamped from the event.
- `TournamentPage` gates "Start round N" on `canStartNextRound`, the client mirror of the server check. It shows the manager which matches the round is still waiting on.

## Status after pairing
- **Completion is automatic**: `maybeCompleteTournament` (in `routes/matches.ts`) runs after a match is settled (`finishMatch`: `/end`, `/forfeit`). It sets `COMPLETED` when no `NOT_STARTED`/`IN_PROGRESS` match remains. `/score` never completes anything.
- This is **not final** for Swiss: `/pair` works on a `COMPLETED` event and flips it back to `ACTIVE`. Reopening a match (`/undo`) also flips it back.
- **Archive**: `POST /:id/archive` (manager, `COMPLETED` only) sets `archivedAt`, which hides the event from `GET /tournaments`. The event page, `/mine` and `/results` still show it. `POST /:id/unarchive` clears it.
- **Delete**: `DELETE /:id` (manager) is refused for a `COMPLETED` event, which has already moved ratings; archive it instead. Otherwise it removes matches (sets cascade), roster, byes and chat in one batch transaction, and nulls `Booking.tournamentId`. It clears the event's notifications, then sends `EVENT_DELETED`.

## Feed and visibility
- `GET /tournaments`: `isPublic: true`, `archivedAt: null`. Filters: `city`, `clubId`, `kind`, `status` (comma-separated), `from`/`to` (on `startTime`), `q`. Sorted by `startTime` asc with undated events last, so `Dashboard` re-splits the list into upcoming and "Past" (newest first).
- The city filter matches `{ OR: [{ club: { city } }, { clubId: null, organizer: { city } }] }` (`inCity` in `shared/queries.ts`). `Dashboard` seeds the city from `User.city` unless the viewer picked one by hand (stored in `localStorage` under `city`).
- `isPublic` exists because every booking creates an event. The event's own page, public page, live board and `/mine` ignore it. Set it from booking, the edit panel or `PUT /:id`.
- `GET /tournaments/mine` returns everything the caller organises or plays in, with `myStatus` and `isOrganizer`. The All/Mine switch is `ScopeToggle`.
- `format` can change only while `DRAFT` (`PUT /:id`).

## Standings (`computeStandings` / `eventStandings` in `shared/standings.ts`)
- Rank: matches won, then a tiebreak, then set difference. The tiebreak is Buchholz by default (sum of opponents' wins, `buchholz`). `GET /:id/standings?tiebreak=sonnebornberger` switches to Sonneborn-Berger (sum of wins of the opponents beaten, `sonnebornBerger`).
- Computed from completed matches of all rounds. Rows carry `ratingChange`.
- Bracket formats rank by `place` first (see `brackets.md`). The standings route, public board, results podium and placings all go through `eventStandings`.

## Other event routes
- **Quick game**: `POST /tournaments/quick-game { opponentId, setsWon1, setsWon2, clubId?, name? }` creates a completed private `GAME` with one completed match. It is the "Записать результат" form on `GamesPage`.
- **Participant view**: `GET /matches/mine` returns the caller's open matches in `ACTIVE` events. They appear as "Твой матч" cards on `Dashboard` (10s poll, skipped for guests) and on top of `TournamentPage` ("ты отдыхаешь" on a bye). A new round shows a notice and calls `navigator.vibrate`.
- **Chat**: `GET/POST /:id/chat`, open to the manager and `REGISTERED` players only (`assertCanUseChat`). Polled with `?after=`. Kept minimal on purpose.
