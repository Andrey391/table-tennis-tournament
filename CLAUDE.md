# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A table tennis club-night pairing app: maintain a player roster, add participants to a tournament, lock the roster and split it into rating-seeded pairs, then run live courtside scoring (race to 11 or 21, deuce/server-switch rules) and a public live/results view. React + Vite client, Express + Prisma/PostgreSQL server.

**Primary target device is the smartphone.** The scoring screen (`MatchPage`) is used courtside on a phone by a judge during a live match, and `PublicTournament`/`LiveScore` are meant to be checked on a phone by players and spectators. Every client screen is single-column and phone-first (bottom tab bar, no tables, no horizontal scrolling) — desktop is not specifically designed for, just not broken.

## Tournament flow (the whole "system")

There is no round robin / group / bracket / best-of-N system anymore — it was deliberately replaced with a single flat flow:

1. **DRAFT** — anyone creates a tournament (name + table count) and automatically becomes its **manager** (`Tournament.organizerId`). Any other signed-in user can request to join (`POST /tournaments/:id/join`, creates a `TournamentUser` with `status: PENDING`); the manager approves (`POST /tournaments/:id/players/:userId/approve` → `REGISTERED`) or rejects/removes (`DELETE /tournaments/:id/players/:userId`, works on both pending and approved rows). The manager can also add already-known players directly, pre-approved (`POST /tournaments/:id/players`). Only `REGISTERED` players count toward pairing.
2. **Pairing** — `POST /tournaments/:id/pair` (manager only) locks the roster, seeds every `REGISTERED` player by `User.rating` (highest first), pairs adjacent ranks (1v2, 3v4, ...; an odd player out gets a bye and no match), assigns table numbers round-robin across `tablesCount`, and flips the tournament to **ACTIVE**. This is a one-shot operation — there is no re-pairing or additional rounds built in.
3. **ACTIVE** — each `Match` is scored independently, and only by the tournament's manager (see Authorization below). Before a match starts, the manager can set its point target to 11 or 21 (`PUT /matches/:id` with `pointsToWin`, only allowed while `NOT_STARTED`); this is a per-match choice, not a tournament-wide setting. Scoring, deuce, and server-rotation logic live in `server/src/shared/scoring.ts` (`isDeuce`, `getMatchWinner`, `nextServerSide`), duplicated inline in `api/index.ts` for the Vercel deployment.
4. Standings (`GET /tournaments/:id/standings`) are a flat win/loss/points-for/points-against table computed directly from completed matches among `REGISTERED` players — there are no groups.

When asked for "bracket," "group," or "best of N" features, treat that as a new feature request against this simplified model, not a restoration of removed code — the old `Group`/`Bracket`/`Team`/`Game` Prisma models, `BracketPage.tsx`, and the round-robin/olympic/double-elimination generators are gone.

### Authorization: per-tournament ownership, not global roles

There is no role-gating (`ADMIN`/`ORGANIZER`/`JUDGE`) on tournament or match actions — `User.role` still exists on the schema but nothing in the tournament/match routes checks it anymore. Instead, every write action on a tournament or its matches is gated by **"are you `Tournament.organizerId`?"**:

- `server/src/routes/tournaments.ts` has a `loadOwnedTournament(res, tournamentId, userId)` helper; `server/src/routes/matches.ts` has `loadOwnedMatch(res, matchId, userId)` (fetches the match with `tournament: { select: { organizerId: true } }` and compares). Both return `null` and already sent a 404/403 response when the caller isn't the manager — every gated route does `const x = await loadOwned...(...); if (!x) return;` right after `authMiddleware`. `api/index.ts` duplicates both helpers inline (same names) since it can't import from `server/`.
- Any signed-in user can: create a tournament (becomes its manager), request to join a `DRAFT` tournament, view anything (tournament/match GETs, standings, live, public pages are unauthenticated).
- Only the tournament's manager can: approve/reject join requests, add players directly, remove players, pair, and change/start/score/undo/let/end any match in that tournament.
- Client-side mirror of this check: `TournamentPage.tsx` computes `isManager = tournament.organizerId === user?.id` and `MatchPage.tsx` computes `canManage = match.tournament?.organizerId === user?.id` (the match fetch includes `tournament.organizerId` for exactly this). These only control what UI renders — the server is the actual enforcement point, always re-check there when adding new mutations.

## Data model (`server/prisma/schema.prisma`)

`User` (login account, also the tournament participant — `Match.player1`/`player2` reference `User` directly, not a separate `Player` model), `Tournament` (`organizerId` is its manager), `TournamentUser` (roster join table with `seed` and `status: PENDING | REGISTERED | WITHDRAWN | DISQUALIFIED` — `PENDING` is a self-join request awaiting the manager's approval; `DISQUALIFIED`/`WITHDRAWN` exist on the enum but nothing currently sets them), `Match` (holds `pointsToWin`, `score1`/`score2`, `serverSide`, `letCount`, `lastScorer`/`prevServerSide` for undo, `tableNumber` — one match is one game to the target score, no nested `Game` rows), `AuditLog`, `Session`.

**Undo**: a match stores `lastScorer` (which side scored last) and `prevServerSide` (server before that point) so `POST /matches/:id/undo` can reverse exactly one point deterministically. There is no multi-point undo history.

## Style conventions (client)

Dark theme, inline Tailwind utility classes with hard-coded hex colors (`#0a0a0f` background, `#12121a` card, `#1e1e2e` border, `#3b82f6` primary/player-1 blue, `#ef4444` player-2 red, `#666680`/`#8888a0`/`#555566` muted text tones), `rounded-lg` cards, `text-xs uppercase tracking-wider` section labels. No emoji anywhere in UI copy or code comments. `client/src/components/Layout.tsx` provides a fixed bottom tab bar (Home/Players/Results/Rating) plus a slim sticky top header — this is the app's only navigation chrome; new authenticated pages should render inside `<Layout>`. Unauthenticated pages (`MatchPage`, `LiveScore`, `PublicTournament`, `Login`, `Register`) render standalone full-screen without `Layout`. When adding screens, reuse the existing hex values/spacing and the terse one-line JSX style already used in `pages/*.tsx` (inline conditional rendering, no per-row sub-components) rather than introducing new patterns.

## Repo layout — two deployment targets, read this before touching backend code

This repo contains **two independent copies of the API**, kept manually in sync:

- **`server/`** — the real, modular Express app (`server/src/index.ts`, `routes/`, `middleware/`, `models/`, `socket.ts`). This is the source of truth for backend logic and is what runs locally (`npm run dev`) and on Render (see `render.yaml`).
- **`api/index.ts`** — a single-file duplicate of the same routes, written as one Express app exported for Vercel's serverless function runtime. It has its own inline `authMiddleware`/`requireRole`, its own copy of the scoring/standings logic, and an `/api/setup` endpoint that raw-SQL-creates tables (`CREATE TABLE IF NOT EXISTS ...`) as a substitute for running Prisma migrations on Vercel. Used only when deploying to Vercel (see `vercel.json`).

When asked to add or fix an API endpoint, mirror the change in **both** `server/src/routes/*.ts` and `api/index.ts`, and keep `server/prisma/migration.sql` (a hand-maintained snapshot, not a real Prisma migration) in sync with `schema.prisma` if you change the schema. If unsure which target the user cares about, ask.

- `client/` — React 18 + Vite + Tailwind v4 + React Router SPA.
- `shared/` and `server/src/services/` (`tournamentService.ts`, `bracketService.ts`) and `server/src/shared/scheduler.ts`/`standings.ts` are **dead code**: emptied out (`export {}`) rather than deleted because file deletion is blocked in this environment's sandbox. `client/src/pages/BracketPage.tsx` is dead for the same reason. None of these are imported anywhere — safe to delete for real next time file deletion is available, otherwise leave them empty.
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
