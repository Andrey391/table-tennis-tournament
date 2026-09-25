# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Topic details live in `.claude/rules/*.md`. Each loads automatically when a file matching its `paths` is read; see the list at the end. When a question touches a topic without reading its files, read the rule file.

## Project overview

A table tennis club-night app. You keep a player roster, run events (Swiss rounds or a bracket), and do live courtside scoring: a judge or the players record who took each set. There are public live and results views, plus bookings, clubs, ratings and notifications around it.
React 18 + Vite + Tailwind v4 client (`client/`), Express + Prisma/PostgreSQL server (`server/`), npm workspaces.

**The smartphone is the primary device.** `MatchPage` is used courtside on a phone, and `PublicTournament`/`LiveScore` are read on phones. Every screen is single-column and phone-first: bottom tab bar, no tables, no horizontal scrolling. Desktop just must not break.

## Domain in one screen

- **Three levels: event -> match -> set.**
  - **Event**: a `Tournament` row, `kind` `TOURNAMENT` or `GAME`. Same container (roster, rounds, pairing, standings, chat); a `GAME` never moves rating. `GamesPage` is the feed filtered by `kind=GAME`.
  - **Match**: two players inside an event, with `setsWon1`/`setsWon2`.
  - **Set** (`MatchSet`, "партия"): the unit of scoring. It records who took it, plus an optional final rally score.
- **Formats** (`Tournament.format`):
  - `SWISS` (default): round-based, nobody eliminated.
  - `KNOCKOUT` and `PLACEMENT`: bracket formats, the tree rebuilt from matches (`shared/bracket.ts`).
- **Lifecycle**:
  - `DRAFT` -> `/pair` -> `ACTIVE` -> `COMPLETED` automatically when no open match remains.
  - For Swiss, `COMPLETED` is not final: another `/pair` reopens it.
  - A finished event can be archived (hidden from the feed) but not deleted.
- **Scoring is sets, not points**: no rally board, deuce or service rotation. `setsToWin` is a prompt, not a cap.
  - Nothing ends a match on its own: the judge settles it with `/end` (no draws) or `/forfeit` (walkover, unrated).
  - **Only `COMPLETED` matches count anywhere**: standings, stats and rating.
- **Rating** is the FNTR formula, per set, starting at 100, not zero-sum. Only `TOURNAMENT`-kind matches are rated.

## Authorization: per-tournament ownership, not roles

- Nothing in tournament or match routes checks `User.role`. The gate is "are you `Tournament.organizerId`?"
  - `loadOwnedTournament` (`routes/tournaments.ts`) and `loadOwnedMatch`/`loadScorableMatch` (`routes/matches.ts`) send the 404/403 themselves and return `null`.
  - Pattern: `const x = await loadOwned...(res, id, userId); if (!x) return;`
- **Manager only**:
  - Roster: approve/reject/add/remove players, seeding.
  - Rounds and matches: `/pair`, walkover, reopen a finished match, table/judge.
  - Event: edit, archive, delete.
- **Manager or either player of the match**: `setsToWin` before the start, start, record sets, undo the last set, end. Players at the table score their own match.
- **Any signed-in user**: create an event (and become its manager), request to join. All GETs of events, matches, standings and live boards are public.
- The client mirrors this (`isManager`, `canScore`) only to decide what to render. **The server is the enforcement point**; re-check there for every new mutation.

## Invariants: check before changing anything

- **Never `-eloDelta`** for the loser. Read `Match.eloDeltaLoser`; neither delta has a guaranteed sign.
- **Every list of players or matches** excludes demo accounts (`notDemo`). Every *public* list uses `listed` (`shared/privacy.ts`).
- **Settle a match only through `finishMatch`**: claim first, rating first, then `COMPLETED`. `applyRatingUpdate`'s `GAME` check is the only thing that keeps games unrated.
- Rating writes and demo creation avoid `$transaction`: the pooled Postgres drops multi-statement transactions (`P1017`).
- **Server code**:
  - Routers are `Router()` from `server/src/shared/router.ts`, never `express.Router()`. It forwards async rejections to the error handler.
  - Read query params only via `queryString`/`queryDate` (`shared/queries.ts`); `?x[not]=y` arrives as an object.
  - No `.js` suffix on relative imports in `server/src`.
  - Shared selects, includes and filters go in `shared/queries.ts`, Zod bodies in `server/src/shared/schemas.ts`, error text through `publicError`.
- **A schema change touches three files**: `schema.prisma`, `migration.sql`, `migration-reset.sql`. A new filter column also needs its index.
- **Client code**:
  - All copy through i18n (`t("key")`, `ru` + `en`).
  - Names through `playerName(p)`, dates through `lib/format.ts`, class strings from `lib/ui.ts`.
  - Irreversible actions through `useConfirm()`.
  - `MatchPage` mutations inside `write()`.
  - Polling through `usePolling`.
  - No emoji.
- A guest-readable screen must not fire a gated (auth-only) request.
- A new notification type needs i18n keys on both language sides; the text is never stored.

## Repo layout

- `server/src/app.ts` builds the whole Express app via `createApp()`. It is served by `server/src/index.ts` (local, Render, Docker) and by `api/index.ts` (Vercel, one line). There is one implementation of the API; never put logic in `api/`.
- `server/src/routes/*`: HTTP routes.
- `server/src/shared/*`: logic and helpers.
  - Game logic: `scoring.ts`, `standings.ts`, `bracket.ts`, `scheduler.ts`, `stats.ts`.
  - Features: `demo.ts`, `privacy.ts`, `notify.ts`, `push.ts`, `booking.ts`, `payments.ts`, `mail.ts`.
  - Plumbing: `queries.ts`, `schemas.ts`, `router.ts`, `errors.ts`.
- `server/prisma/`: `schema.prisma`, `migration.sql` (idempotent, the one to run), `migration-reset.sql` (drops everything), `recalc-fntr.sql`, `seed.ts`.
- `client/src/`:
  - Screens and building blocks: `pages/`, `components/`.
  - `lib/`: `ui.ts`, `format.ts`, `tour.ts`, `push.ts`, `usePolling.ts`, `legal.ts`, `notifications.ts`.
  - Everything else: `i18n/` (`dict.ts` has no React), `context/` (`AuthContext`, polling provider), `services/api.ts`, `sw.ts`.
- `public/`: pre-built client assets for Vercel. Not source; don't edit.
- `server/src/socket.ts`: unused and not initialized (see `deploy-perf.md`).

## Commands

Run from the repo root.

```bash
npm run dev              # server (tsx watch, :3000) + client (vite, :5173, proxies /api)
npm run build            # client only; server: npm run build -w server (tsc -> server/dist)
npm run db:push          # prisma db push against server/prisma/schema.prisma
npx prisma generate --schema=server/prisma/schema.prisma
npx tsx server/prisma/seed.ts   # admin@localhost / organizer@localhost / sample players, password admin123
node scripts/loadtest.mjs       # local throwaway DB only
```

- There is **no test suite and no linter**. Verify server changes with `npm run build -w server` and client changes with `npm run build -w client`.
- `server/.env` (gitignored) holds `DATABASE_URL`/`JWT_SECRET`; check it exists before assuming the server starts.
- **This sandbox cannot reach outbound Postgres (5432)**. `prisma db push` or connecting will hang regardless of credentials; that has to run from a machine with network egress.
- Never run SQL scripts or load tests against the production database from here. If unsure which database the user means, ask.

## Topic rules (`.claude/rules/`)

| File | Covers |
|---|---|
| `swiss-flow.md` | roster, join/approve/withdraw, capacity, rating gate, pairing and byes, completion, archive/delete, feed and city filter, standings and tiebreaks, quick game, chat |
| `brackets.md` | `KNOCKOUT`/`PLACEMENT`: seeding, empty seats, `computeBracket`, fixed roster, completion, how to test |
| `match-scoring.md` | `/start` `/score` `/undo` `/end` `/forfeit`, `claimMatch`, `finishMatch` order, no draws, reopen, `MatchPage` `write()` guard |
| `rating-fntr.md` | FNTR formula, KT, `ratingStart`, `eloDelta`/`eloDeltaLoser`, `recalc-fntr.sql` |
| `data-model.md` | Prisma models, the two SQL files, indexes, seed, `setup.ts` |
| `client-ui.md` | palette, `ui.ts`, shared components, i18n, navigation, confirm dialog, polling, guest mode |
| `demo-tour.md` | demo accounts, invitation seat, tour reset, claim, guided tour |
| `auth-privacy.md` | JWT, rate limits, register, forgot password, profile edit, 152-FZ consent, name masking, account deletion |
| `notifications-push.md` | inbox, `notify()`, Web Push, service worker |
| `bookings-clubs.md` | bookings that create events, conflicts, payments mode, club page, follows |
| `stats-results.md` | `/results`, `/leaders`, rating list, player stats, head-to-head, profile stats |
| `deploy-perf.md` | entry points, Vercel/Render/Docker, round-trip performance rules, Socket.IO status |
