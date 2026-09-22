-- Backfills Tournament.startTime for events created before a date was required
-- on the create/booking forms (see CreateTournamentSchema / CreateBookingSchema
-- in server/src/shared/schemas.ts). Each such row gets a random timestamp
-- uniformly distributed between 2026-01-01 00:00 and 2026-08-31 23:59:59 UTC.
--
-- Run it by hand against the real database (this sandbox cannot reach Postgres).
-- Idempotent: only rows with "startTime" IS NULL are touched, so re-running after
-- new events already have a date does nothing.

UPDATE "Tournament"
SET "startTime" = timestamp '2026-01-01 00:00:00'
  + random() * (timestamp '2026-09-01 00:00:00' - timestamp '2026-01-01 00:00:00')
WHERE "startTime" IS NULL;
