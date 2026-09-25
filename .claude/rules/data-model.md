---
paths:
  - "server/prisma/**"
  - "server/src/routes/setup.ts"
  - "server/src/shared/queries.ts"
---

# Data model (`server/prisma/schema.prisma`)

- `User`: the login account and also the participant (`Match.player1`/`player2` reference `User`).
  - `rating` is a Float (FNTR). `city` is shown under names and used by city filters. `role` is not checked by tournament/match routes.
  - Other fields: `isDemo`/`demoOwnerId`/`demoExpiresAt`, `publicProfile`, `consentAt`/`consentVersion`, `deletedAt`.
  - A player's only link to a club is `Subscription` (follow). The legacy `User.club` column is unmapped.
- `Club`: `name`+`city` unique, optional `address`/`phone`, `createdById` is its manager. A club with no manager is editable by an `ADMIN` only, with the role read from the DB.
- `ClubTable`: `number` unique per club, `indoor`, price.
- `Tournament`:
  - `kind` is `TOURNAMENT` | `GAME`; `format` is `SWISS` | `KNOCKOUT` | `PLACEMENT`; `organizerId` is the manager.
  - Settings: `setsToWin`, `ratingWeight` (KT), `isPublic`, `archivedAt`, optional `minRating`/`maxRating`, `maxPlayers`, `clubId`, `startTime`/`endTime`, `description`, `tablesCount`.
- `TournamentUser`: roster, with `seed` (set once at round 1) and `ratingStart`.
  - `status`: `PENDING` (join request) | `REGISTERED` | `WITHDRAWN` (dropped after playing, or any removal in a bracket) | `DISQUALIFIED` (nothing sets it).
- `RoundBye`: who sat a round out, `tournamentId`+`round` unique.
- `Match`:
  - Placement: `round`, `matchIndex` (bracket position), `tableNumber`.
  - Score: `setsToWin`, `setsWon1`/`setsWon2`, `sets`.
  - Rating: `eloDelta`/`eloDeltaLoser` (FNTR changes, see `rating-fntr.md`), `rating1Before`/`rating2Before` (snapshots, null on old matches).
- `MatchSet`: `index`, `winner`, `status`, and optional `score1`/`score2` (0:0 = not entered).
- `Booking`: `clubId`, optional `tableId`, `date` (UTC midnight), `startTime` "HH:MM", `durationHours`, `userId`, `gameId`/`tournamentId` (nullable, `ON DELETE SET NULL`). No price or payment fields.
- `Subscription` (follow a club), `ChatMessage`, `Notification`, `PushSubscription`, `PasswordReset`, `AuditLog`, `Session`.
- Removed for good: `Group`/`Bracket`/`Team`/`Game` models and the round-robin/olympic generators. Brackets are rebuilt from matches (`shared/bracket.ts`).
- Unmapped columns still in the DB: `serverSide`, `lastScorer`, `prevServerSide`, `letCount`, `pointsToWin`, `User.club`. Nothing reads them.

## Schema changes: three files, always
- `schema.prisma`, plus **both** hand-written SQL files (neither is a Prisma migration):
  - `migration.sql` is the one to run. It is additive and idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `EXCEPTION WHEN duplicate_object`) and brings any older DB up to date with no data loss. Its only destructive branch migrates the legacy free-text `Booking.club`/`Subscription.club` onto `Club` rows, and it is skipped when those columns are absent.
  - `migration-reset.sql` drops everything and recreates it empty. Add new columns to its `CREATE TABLE` statements, not as `ALTER`s.
- A new query filtering on another column needs its **index** in all three.
- `routes/setup.ts` (`GET /api/setup`, 404 unless `SETUP_KEY`) is old partial DDL for Vercel. It is not the schema of record.
- Seed: `npx tsx server/prisma/seed.ts` (admin@localhost / organizer@localhost / sample players, password `admin123`). Optional, since `/auth/register` is open.
- If unsure which database the user means, ask.

## Shared queries
Selects, includes and filters used by more than one route live in `server/src/shared/queries.ts` (`playerSelect`, `matchInclude`, `feedInclude`, `standingsInclude`, `inCity`, ...). Add to it rather than declaring a local copy.
