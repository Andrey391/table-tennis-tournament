# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A table tennis club-night pairing app: maintain a player roster, add participants to a tournament, lock the roster and split it into rating-seeded pairs, then run live courtside scoring (race to 11 or 21, deuce/server-switch rules) and a public live/results view. React + Vite client, Express + Prisma/PostgreSQL server.

**Primary target device is the smartphone.** The scoring screen (`MatchPage`) is used courtside on a phone by a judge during a live match, and `PublicTournament`/`LiveScore` are meant to be checked on a phone by players and spectators. Every client screen is single-column and phone-first (bottom tab bar, no tables, no horizontal scrolling) — desktop is not specifically designed for, just not broken.

## Tournament flow (the whole "system")

There is no round robin / group / bracket / best-of-N system anymore — it was deliberately replaced with a Swiss-style, round-based flow. Nobody is ever eliminated between rounds.

1. **DRAFT** — anyone creates a tournament (name + table count) and automatically becomes its **manager** (`Tournament.organizerId`). Any other signed-in user can request to join (`POST /tournaments/:id/join`, creates a `TournamentUser` with `status: PENDING`); the manager approves (`POST /tournaments/:id/players/:userId/approve` → `REGISTERED`) or rejects/removes (`DELETE /tournaments/:id/players/:userId`, works on both pending and approved rows). The manager can also add already-known players directly, pre-approved (`POST /tournaments/:id/players`). Only `REGISTERED` players count toward pairing.
2. **Pairing / rounds** — `POST /tournaments/:id/pair` (manager only) generates the next round and flips the tournament to **ACTIVE**:
   - **Round 1** (tournament is `DRAFT`): seeds every `REGISTERED` player by `User.rating` (highest first), pairs adjacent ranks (1v2, 3v4, ...).
   - **Round 2+** (tournament already has matches): only callable once every match in the current round is `COMPLETED` (checked server-side — "Finish every match in the current round before starting a new one" otherwise). Re-ranks the same `REGISTERED` players by wins-so-far (rating breaks ties) and pairs the same way, with a best-effort pass in `generateRoundPairings` (`server/src/shared/scheduler.ts`, duplicated inline in `api/index.ts`) to avoid immediately repeating an earlier pairing.
   - **Odd headcount**: whoever has played the *most* matches so far (rating breaks ties, lowest first) sits out that round with no match and no stat change. This must be "most", not "fewest" — picking whoever has the fewest matches played would hand the bye to the same person every round, since sitting out is exactly what keeps their count the lowest; ranking by "most played" is what actually rotates it.
   - Table numbers are assigned round-robin across `tablesCount` within each round; `Match.round` records which round a match belongs to.
3. **ACTIVE** — each `Match` is scored independently, and only by the tournament's manager (see Authorization below). Before a match starts, the manager can set its point target to 11 or 21 (`PUT /matches/:id` with `pointsToWin`, only allowed while `NOT_STARTED`); this is a per-match choice, not a tournament-wide setting. Scoring, deuce, and server-rotation logic live in `server/src/shared/scoring.ts` (`isDeuce`, `getMatchWinner`, `nextServerSide`), duplicated inline in `api/index.ts`.
   - **No-shows**: `POST /matches/:id/forfeit { loserSide: 1 | 2 }` (manager only) completes a match by walkover from *any* non-`COMPLETED` state (including `NOT_STARTED`) — this exists specifically because the old `/end` endpoint only made sense on an already-started match, so a player who never showed up could leave a match stuck forever and block the round from finishing. Forfeit scores the winner `pointsToWin`–`0`.
4. **Completion is automatic, not a button**: after any action that resolves a match to `COMPLETED` (`/score` reaching the target, `/end`, `/forfeit`), the route calls `maybeCompleteTournament(tournamentId)`, which flips `Tournament.status` to `COMPLETED` the moment no `NOT_STARTED`/`IN_PROGRESS` matches remain. This is **not final** — `POST /tournaments/:id/pair` works on a `COMPLETED` tournament too (it just checks "is there an unresolved match in the *current* round", not "is the tournament COMPLETED"), so the manager can start another round any time, which flips it back to `ACTIVE`.
5. **Event feed**: `GET /tournaments` takes optional `city` (matches `club.city`), `clubId`, `status` (comma-separated), `from`/`to` (against `startTime`) and `q` (name search) filters, ordered by `startTime` ascending with undated tournaments last. `GET /tournaments/mine` returns everything the caller organises or takes part in, each row carrying `myStatus` and `isOrganizer`.
6. Standings (`GET /tournaments/:id/standings`) are a flat win/loss/points-for/points-against table computed directly from completed matches (all rounds) among `REGISTERED` players — there are no groups. `TournamentPage.tsx` groups matches by `round` (newest first) and shows a "Start round N" button gated on `canStartNextRound` (client-side mirror of the same "current round fully resolved" check).

**Capacity**: `Tournament.maxPlayers` is optional. When set, it caps `REGISTERED` participants and is enforced on all three paths that can fill a roster — self-join, the manager adding players directly, and the manager approving a pending request (requests can outnumber the places, so the approve route re-checks). `PENDING` rows don't count toward it, which is what makes the "9/9 players" figure on the event feed count approved participants only (`_count: { players: { where: { status: "REGISTERED" } } }`).

**A booking always books the table _for_ something.** `POST /bookings` takes `eventType: "GAME" | "TOURNAMENT"` (plus an optional `eventTitle`, falling back to the club's name, and `pointsToWin` for a game) and creates the booking and its event in one transaction — a table held for nothing, or an event nobody has a table for, is never a state worth persisting. `Booking.gameId`/`Booking.tournamentId` record which one it made; both are nullable and `ON DELETE SET NULL`, so cancelling a booking leaves the event alone (people may already have joined) and deleting an event just detaches it. The event inherits the booking's club, table and start time (`bookingStartsAt`/`bookingEndsAt` in `server/src/shared/booking.ts` combine the stored day and "HH:MM"); a tournament also gets `endTime` from the duration. There is currently no way to book a table without creating an event.

**Booking conflicts**: `POST /bookings` refuses (409) when the requested table already has an overlapping booking that day. Overlap is computed in minutes-since-midnight (`server/src/shared/booking.ts`: `timeToMinutes`, `bookingsOverlap`, `startOfUtcDay`, duplicated inline in `api/index.ts`), and `date` is normalised to UTC midnight so "same day" doesn't depend on the submitter's timezone. A booking with no `tableId` is just a note that someone's coming, so it can never clash. `GET /clubs/:id/availability?date=` returns each table's busy intervals so the booking screen can show them before submitting.

**Rating-gated tournaments**: `Tournament.minRating`/`maxRating` are optional (set at creation in `CreateTournament.tsx`, or via `PUT /tournaments/:id`). If either is set, `POST /tournaments/:id/join` checks the caller's `User.rating` against the range and returns 403 with the range and the caller's rating in the message if they don't qualify — this is enforced only at join time, not retroactively (a player already `REGISTERED` before the range was tightened, or whose rating later drifted out of range via Elo, stays in). There's no separate "level" concept (no letter grades) — it's the same raw Elo number everywhere.

### Rating: Elo, starts at 100

`User.rating` is a persistent, global Elo rating (not scoped to one tournament) — it's what round-1 seeding and later rounds' tiebreaks sort by. New accounts default to `100` (schema default; was `300`, and `1000` before that). After any match resolves to `COMPLETED` with a distinct winner — via `/score` reaching the target, `/end` (only if the score isn't tied), or `/forfeit` — `applyEloUpdate(winnerId, loserId)` (`server/src/routes/matches.ts`, mirrored inline in `api/index.ts`) updates both players' `User.rating` using standard Elo (`computeEloDelta` in `server/src/shared/scoring.ts`, K=32, loser's rating floored at 0). This happens immediately, mid-tournament — a player's rating (and therefore their seeding for the *next* round) can shift after every match, not just between tournaments.

**Only tournament matches are rated.** Casual `Game` rows never call `applyEloUpdate` and must never start doing so — being unrated is the entire reason they are a separate table instead of a `Match` without a tournament. If you add a scoring path to `server/src/routes/games.ts` (or its mirror in `api/index.ts`), do not copy the Elo call across from `matches.ts`.

When asked for "bracket," "group," or "best of N" features, treat that as a new feature request against this simplified model, not a restoration of removed code — the old `Group`/`Bracket`/`Team`/`Game` Prisma models, `BracketPage.tsx`, and the round-robin/olympic/double-elimination generators are gone.

## Games: casual, unrated play

A `Game` is a standalone match between two players that exists outside any tournament, and **it never moves anyone's rating**. It carries the same scored fields as `Match` (`pointsToWin` 11 or 21, `score1`/`score2`, `serverSide`, `letCount`, `lastScorer`/`prevServerSide` for undo) and reuses the same helpers from `server/src/shared/scoring.ts`, so deuce and server rotation behave identically — the only deliberate difference is that no Elo update runs and there is no tournament to complete.

- `POST /games` creates one; the creator takes the `player1` slot. `POST /games/:id/join` fills the first free slot while the game is still `NOT_STARTED`, `POST /games/:id/leave` frees the caller's slot. `GET /games` takes the same `city`/`clubId`/`status`/`from`/`to` filters as the tournament feed; `GET /games/mine` returns everything the caller created or plays in.
- `/start`, `/score`, `/undo`, `/let`, `/end` and `/forfeit` mirror the match routes. `/start` refuses until both slots are filled.
- **Authorization differs from matches**: a game is scored by anyone actually involved — its `organizerId` *or* either player (`loadPlayableGame` in `server/src/routes/games.ts`, mirrored inline in `api/index.ts`). There's no judge and no manager-only gate, because a casual game is two people at a table. Only the creator can delete it.
- Client: `GamesPage.tsx` (list, create, join — reached from a `Dashboard` tile, not the bottom bar) and `GamePage.tsx` (courtside scoring, same layout as `MatchPage`, polled every 2s).

### Authorization: per-tournament ownership, not global roles

There is no role-gating (`ADMIN`/`ORGANIZER`/`JUDGE`) on tournament or match actions — `User.role` still exists on the schema but nothing in the tournament/match routes checks it anymore. Instead, every write action on a tournament or its matches is gated by **"are you `Tournament.organizerId`?"**:

- `server/src/routes/tournaments.ts` has a `loadOwnedTournament(res, tournamentId, userId)` helper; `server/src/routes/matches.ts` has `loadOwnedMatch(res, matchId, userId)` (fetches the match with `tournament: { select: { organizerId: true } }` and compares). Both return `null` and already sent a 404/403 response when the caller isn't the manager — every gated route does `const x = await loadOwned...(...); if (!x) return;` right after `authMiddleware`. `api/index.ts` duplicates both helpers inline (same names) since it can't import from `server/`.
- Any signed-in user can: create a tournament (becomes its manager), request to join a `DRAFT` tournament, view anything (tournament/match GETs, standings, live, public pages are unauthenticated).
- Only the tournament's manager can: approve/reject join requests, add players directly, remove players, pair, and change/start/score/undo/let/end any match in that tournament.
- Client-side mirror of this check: `TournamentPage.tsx` computes `isManager = tournament.organizerId === user?.id` and `MatchPage.tsx` computes `canManage = match.tournament?.organizerId === user?.id` (the match fetch includes `tournament.organizerId` for exactly this). These only control what UI renders — the server is the actual enforcement point, always re-check there when adding new mutations.

## Data model (`server/prisma/schema.prisma`)

`User` (login account, also the tournament participant — `Match.player1`/`player2` reference `User` directly, not a separate `Player` model; `city` is the player's home city, used by the event feed's city filter, and the free-text `club` string is only a display-level "home club" note), `Club` (a venue: `name`+`city` unique, optional `address`/`phone`, `createdById` is its manager — same "creator owns it" rule as tournaments), `ClubTable` (a table at a club: `number` unique per club, `indoor`), `Tournament` (`organizerId` is its manager; `minRating`/`maxRating` optional join gate; optional `clubId` venue, `startTime`/`endTime`, `description`, and `maxPlayers` capacity), `TournamentUser` (roster join table with `seed` — set once, at round 1, and never updated again even though standings shift — and `status: PENDING | REGISTERED | WITHDRAWN | DISQUALIFIED` — `PENDING` is a self-join request awaiting the manager's approval; `DISQUALIFIED`/`WITHDRAWN` exist on the enum but nothing currently sets them), `Match` (holds `round` (which Swiss round it belongs to), `pointsToWin`, `score1`/`score2`, `serverSide`, `letCount`, `lastScorer`/`prevServerSide` for undo, `tableNumber` — one match is one game to the target score, and it is always part of a tournament), `Game` (a casual, **unrated** game between two players outside any tournament — same scored fields as `Match` plus an optional `club`/`table`/`startTime`; see "Games" above. Note this is a new model that happens to reuse the name of the long-removed round-robin `Game` table, which stored sets within a match — they have nothing to do with each other), `AuditLog`, `Session`, `Booking` (a table reservation — `clubId`/optional `tableId`/`date`/`startTime` ("HH:MM")/`durationHours`, owned by `userId`, plus `gameId`/`tournamentId` pointing at the event it created; **no payment processing**, it's just a record), `Subscription` ("follow a club" — `userId`+`clubId` unique pair, no billing), `ChatMessage` (per-tournament message board, `tournamentId`+`userId`+`text`).

**Undo**: a match stores `lastScorer` (which side scored last) and `prevServerSide` (server before that point) so `POST /matches/:id/undo` can reverse exactly one point deterministically. There is no multi-point undo history.

**Bookings/Subscriptions/Chat are intentionally minimal** — they exist because a reference app's design was cloned feature-for-feature *except* payments (explicitly out of scope: "оплата не нужна"). `Booking` has no price/status/payment field at all. `ChatMessage` is polled (`GET /tournaments/:id/chat` every 3s in `TournamentChatPage.tsx`), not real-time, consistent with the rest of the app (see Socket.IO note below) — access is gated to the tournament's manager or its `REGISTERED` participants (`assertCanUseChat` in `tournaments.ts`, mirrored in `api/index.ts`). Don't expand these into a real booking/payment/messaging platform without being asked — they're deliberately just enough to match the reference app's screens.

**Profile stats** (`GET /profile/stats`, `server/src/routes/profile.ts`, mirrored in `api/index.ts`): computes `tournaments` (count of `TournamentUser` rows with `status: REGISTERED`), `matches`/`wins`/`losses` (from `COMPLETED` matches), `games`/`gameWins`/`gameLosses` (from `COMPLETED` casual games), and `byTarget` — the same rows split into short (11) and long (21) buckets, separately for `matches` and `games`, each as `{ played, wins }`. All of it is computed live from the database, never cached or denormalized onto `User`. `ProfilePage.tsx` renders tournament matches and casual games as two separate cards precisely because one kind moves the rating and the other doesn't.

## Style conventions (client)

Dark **navy** theme (not black) with a lime-green accent — this was changed from an earlier blue/near-black palette, so don't reintroduce `#0a0a0f`/`#12121a`/`#1e1e2e`/`#3b82f6` accents if you see them in old notes or examples. Current tokens: `#0a1628` page background, `#101f36` card background, `#16283f` avatar-circle fill, `#1c3350` border/secondary surface, `#142a44`→`#0a1628` gradient (Dashboard hero card), `#ccff00` accent (buttons, active nav, badges — text is `#0a1628` on top of it for contrast), `#6b84a0`/`#93a8c2`/`#4d6480` muted text tones (light→dark), player-1/player-2 colors stay `#3b82f6`/`#ef4444` (semantic, not part of the neutral palette). `rounded-lg`/`rounded-2xl` cards, `text-xs uppercase tracking-wider` section labels, outline-style SVG icons (stroke, not fill) for nav/tiles. No emoji anywhere in UI copy or code comments.

`client/src/components/Layout.tsx` provides a fixed bottom tab bar — **5 items**: Home, Play (`/bookings`), Rating, Results, Profile (`/players` is no longer a bottom-tab destination; it's a quick-action tile on `Dashboard.tsx` instead) — plus a slim sticky top header showing the current user's `Avatar` (links to `/profile`) and a logout button. This is the app's only navigation chrome; new authenticated pages should render inside `<Layout>`. Unauthenticated/full-screen pages (`MatchPage`, `LiveScore`, `PublicTournament`, `Login`, `Register`, `TournamentChatPage`) render standalone without `Layout`.

`client/src/components/Avatar.tsx` (initials circle + a `#ccff00` rating-number badge overlapping the bottom-right corner, `size: "sm" | "md" | "lg"`) is the standard way to represent a player anywhere in the UI — used in `Layout`'s header, `PlayersPage`, `RatingPage`, `ProfilePage`, and participant/standings rows in `TournamentPage`. Reach for it instead of a bare name string when a player is shown in a list. `client/src/components/Logo.tsx` (`as: "link" | "plain"`, `size: "sm" | "lg"`) is the other shared visual atom, used in `Layout`'s header and the `Login`/`Register` hero.

**All UI copy goes through i18n** (`client/src/i18n/index.tsx`): `const { t, lang, setLang } = useT()` and `t("some.key")`, never a hard-coded string in JSX. The dictionary is a flat `key -> string` map with `ru` and `en` sides; `ru` is the default and the product language, `en` is the fallback for any key missing from `ru`. `{placeholder}` interpolation is supported (`t("tournament.round", { n: 3 })`). The chosen language persists in `localStorage` under `lang` and is switched from the card at the bottom of `ProfilePage`. Dates go through `client/src/lib/format.ts` (`formatEventDay`, `formatTimeRange`, `formatSlot`), which takes `lang` and uses `Intl` — don't format dates inline.

**Player names always carry the surname's initial**: render them through `playerName(p)` from `client/src/lib/format.ts`, which produces `"Иван П."`. Scoreboards, match rows and results used to print the bare `firstName`, which made two players with the same first name indistinguishable. Roster and participant lists that show the full `firstName lastName` are left as-is — the surname is already there. Don't inline `p.firstName` in new UI.

When adding screens, reuse the existing hex values/spacing and the terse one-line JSX style already used in `pages/*.tsx` (inline conditional rendering, no per-row sub-components) rather than introducing new patterns.

## Repo layout — two deployment targets, read this before touching backend code

This repo contains **two independent copies of the API**, kept manually in sync:

- **`server/`** — the real, modular Express app (`server/src/index.ts`, `routes/`, `middleware/`, `models/`, `socket.ts`). `routes/players.ts` (players + rating), `routes/public.ts` (`/api/live/:tournamentId` and the public tournament pages), `routes/clubs.ts` and `routes/games.ts` exist so this copy serves the same surface as `api/index.ts` — before they were added, those endpoints were reachable only on the Vercel deployment. This is the source of truth for backend logic and is what runs locally (`npm run dev`) and on Render (see `render.yaml`).
- **`api/index.ts`** — a single-file duplicate of the same routes, written as one Express app exported for Vercel's serverless function runtime. It has its own inline `authMiddleware`/`requireRole`, its own copy of the scoring/standings logic, and an `/api/setup` endpoint that raw-SQL-creates tables (`CREATE TABLE IF NOT EXISTS ...`) as a substitute for running Prisma migrations on Vercel. Used only when deploying to Vercel (see `vercel.json`).

When asked to add or fix an API endpoint, mirror the change in **both** `server/src/routes/*.ts` and `api/index.ts`, and keep **both** hand-maintained SQL files in sync with `schema.prisma` if you change the schema. Neither is a real Prisma migration:

- **`server/prisma/migration.sql` — the one to run.** Additive and idempotent: it only creates tables/columns/indexes/foreign keys that are missing, each guarded by `IF NOT EXISTS` or an `EXCEPTION WHEN duplicate_object` block, so re-running it is harmless and **no data is lost**. It brings a database up to date from any earlier point. The single exception is the legacy free-text `Booking.club`/`Subscription.club` columns, which it migrates onto real `Club` rows before dropping — and that whole branch is skipped on a database that never had them. When you add a table or column, add it here as `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- **`server/prisma/migration-reset.sql` — deliberate clean slate.** Drops every application table and recreates them empty. Running it always costs all existing data, so only reach for it when that is the actual intent. Add new tables/columns to its `CREATE TABLE` statements rather than appending `ALTER TABLE` sections.

After a reset, creating the first account needs `npx tsx server/prisma/seed.ts`, because `server/`'s `POST /auth/register` requires an already-authenticated `ADMIN`/`ORGANIZER` and an empty database has neither. If unsure which target the user cares about, ask.

- `client/` — React 18 + Vite + Tailwind v4 + React Router SPA.
- `shared/` and `server/src/services/` (`tournamentService.ts`, `bracketService.ts`) and `server/src/shared/standings.ts` are **dead code**: emptied out (`export {}`) rather than deleted because file deletion is blocked in this environment's sandbox. `client/src/pages/BracketPage.tsx` is dead for the same reason. None of these are imported anywhere — safe to delete for real next time file deletion is available, otherwise leave them empty. `server/src/shared/scheduler.ts` was one of these emptied files but is now live again — it holds `generateRoundPairings` (the Swiss pairing/bye logic used by `POST /tournaments/:id/pair`), duplicated inline in `api/index.ts` as usual.
- `public/` — pre-built static client assets committed for the Vercel static output fallback; not source, don't hand-edit.

## Commands

Run from the repo root (npm workspaces: `client`, `server`).

```bash
npm run dev              # runs server (tsx watch) and client (vite) concurrently
npm run build             # builds client only (npm run build -w client)
npm run db:push           # prisma db push against server/prisma/schema.prisma
```

Per-workspace (run with `-w server` / `-w client`, or `cd` into the folder):

```bash
npm run dev -w server      # tsx watch src/index.ts (port 3000)
npm run build -w server    # tsc -> server/dist
npm run dev -w client       # vite dev server (port 5173, proxies /api and /socket.io to :3000)
npm run build -w client     # vite build -> client/dist
```

Prisma (schema lives at `server/prisma/schema.prisma`):

```bash
npx prisma generate --schema=server/prisma/schema.prisma
npx prisma db push --schema=server/prisma/schema.prisma
npx tsx server/prisma/seed.ts     # seeds admin@localhost / organizer@localhost / sample players (all password: admin123)
```

There is no test suite and no linter configured in this repo. `server/.env` holds `DATABASE_URL`/`JWT_SECRET` for local runs — it's gitignored; check it exists before assuming `npm run dev -w server` or `db:push` will work, and note that **this sandboxed environment cannot reach outbound Postgres ports (5432)** even when a valid `DATABASE_URL` is configured — `prisma db push`/`db:connect` will hang or fail here regardless of credentials. That's an environment limitation, not a schema or credentials problem; it has to be run from a machine/CI with real network egress.

### Local DB via Docker

`docker-compose.yml` brings up Postgres (`tttournament` db, `postgres`/`postgres`) plus the app itself built from the root `Dockerfile` (multi-stage: builds `server` and `client` separately, then runs `node dist/index.js` serving the compiled server with the client build copied alongside).

### Deployment

- **Vercel** (`vercel.json`): builds via `prisma generate && npm run build -w client`, serves `client/dist` as static output, rewrites `/api/*` to the `api/index.ts` serverless function.
- **Render** (`render.yaml`): builds and runs the real `server/` (`tsc` then `node server/dist/index.js`), frankfurt region, expects `DATABASE_URL` set manually in the dashboard, generates `JWT_SECRET`.

## Architecture notes

**Auth**: JWT (`jsonwebtoken`), bearer token in `Authorization` header, secret from `JWT_SECRET` env var. `server/src/middleware/auth.ts` exports `authMiddleware` (required auth) and `roleMiddleware(...roles)` (RBAC gate) — `roleMiddleware` is now only used by `server/src/routes/auth.ts`'s `POST /auth/register` (requires an already-authenticated `ADMIN`/`ORGANIZER`, so on the Render deployment it's effectively an admin "add player to the roster" form, not public self-signup); `api/index.ts`'s registration is open self-signup instead (see Authorization above for why tournament/match routes don't use role checks at all). Roles: `ADMIN`, `ORGANIZER`, `JUDGE`, `PLAYER`, `VIEWER`. Passwords hashed with bcryptjs.

**Real-time updates**: `server/src/socket.ts` sets up a full Socket.IO server (`join-tournament`, `join-match`, `score-update`, `match-end`, `game-update` events), initialized in `server/src/index.ts`. The **client does not use Socket.IO** — `client/src/context/SocketContext.tsx` (despite the filename) implements a `PollingProvider`/`usePoll` hook, and `MatchPage`/`LiveScore` poll their REST endpoints on a 2s interval instead. Treat the server's Socket.IO layer as unused by the current client unless wiring up real socket consumption.

**Client routing** (`client/src/App.tsx`): most routes are behind `RequireAuth` (redirects to `/login` if no token in `AuthContext`). `/public/tournament/:id` and `/live/:tournamentId` are intentionally public/unauthenticated. `client/src/services/api.ts` centralizes all REST calls through an `apiService` object backed by an axios instance that auto-attaches the JWT from `localStorage`.

**Validation**: Zod schemas for request bodies live in `server/src/shared/schemas.ts` (used by `server/src/routes/*`) — the top-level `shared/schemas.ts` package is a separate, unused leftover (see dead-code note above).
