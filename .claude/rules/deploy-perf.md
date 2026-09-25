---
paths:
  - "api/**"
  - "server/src/app.ts"
  - "server/src/index.ts"
  - "server/src/socket.ts"
  - "server/src/middleware/rateLimits.ts"
  - "vercel.json"
  - "render.yaml"
  - "Dockerfile"
  - "docker-compose.yml"
  - "tsconfig.json"
  - "scripts/**"
  - "client/src/lib/usePolling.ts"
  - "client/src/context/SocketContext.tsx"
---

# Runtimes, deployment, performance

## One API, two entry points
- `server/src/app.ts` `createApp({ defaultClientUrl? })` builds everything: helmet, CORS, body limit, rate limits, routers under `/api`, `/api/health`, and the error handler. **Change routes and middleware here and in `routes/`, once.**
- `server/src/index.ts` is the standalone process: loads `.env`, checks `JWT_SECRET` and the DB, calls `listen()`. It runs locally, on Render and in Docker. Default CORS origin `http://localhost:5173`. Anything needed at boot goes here, not in `app.ts`.
- `api/index.ts` is the Vercel function: `export default createApp()` and nothing else. Same origin, so with no `CLIENT_URL` no cross-origin callers are allowed. Never put logic in it.
- Nothing may read env or open a connection at import time in a way that differs between hosts. The root `tsconfig.json` type-checks `api/` on Vercel and must stay `strict: true`.
- `index.ts` logs a stray `unhandledRejection` instead of dying.

## Deployment
- **Vercel** (`vercel.json`): `prisma generate && npm run build -w client`, static `client/dist`, `/api/*` -> `api/index.ts`. The region is pinned to `dub1`, next to the Supabase DB in eu-west-1.
- **Render** (`render.yaml`): `tsc` then `node server/dist/index.js`, Frankfurt region. `DATABASE_URL` is set in the dashboard; `JWT_SECRET` is generated.
- **Docker**: `docker-compose.yml` runs Postgres (`tttournament`, `postgres`/`postgres`) plus the app from the multi-stage root `Dockerfile`.
- `public/` holds pre-built client assets for Vercel's static fallback. It is not source; don't edit it.

## Performance: count database round trips
- `schema.prisma` enables the `relationJoins` preview, so a nested `include` is one SQL statement. Keep it. Use `relationLoadStrategy: "query"` per call if needed.
- Independent writes go out together (`Promise.all`/`allSettled`) but are **awaited**: a serverless function is frozen after answering, so fire-and-forget writes get lost.
- The pooled Postgres drops multi-statement transactions (`P1017`). Rating writes and demo creation deliberately avoid `$transaction`.
- Indexes exist for every per-player lookup, the leaders window (`Match(status, endedAt)`), the feed (`Tournament(isPublic, startTime)`) and chat. A new filter column needs an index (see `data-model.md`).
- Polling goes through `lib/usePolling.ts` (see `client-ui.md`).
- **Load test**: `node scripts/loadtest.mjs` (env `BASE`, `VIEWERS`, `PLAYERS`, `DURATION`) prints p50/p95 per endpoint. It refuses hosted URLs. Run it only against a throwaway local DB.

## Socket.IO
`server/src/socket.ts` exists but is **not initialized**: its events changed matches with no authentication. Wiring it back up requires token auth and the `loadScorableMatch` checks first. The client uses only polling.
