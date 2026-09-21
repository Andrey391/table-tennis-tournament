-- Replays every rated match under the FNTR rating rules and rewrites the ratings.
--
-- Run it by hand, after migration.sql (it needs the DOUBLE PRECISION rating columns
-- and "eloDeltaLoser" / "ratingWeight" / "ratingStart", and refuses to run without them).
-- It is ONE statement (a DO block), so it works through a connection pooler that does
-- not keep a session between statements, and it either applies completely or not at all.
--
--   1. Run it as it is: a DRY RUN. It changes nothing and prints, as NOTICE messages,
--      how many matches it replayed and the new rating of the top players.
--   2. Change  apply_changes  below to true and run it again to write the result.
--
-- What it does, in the order the matches were settled ("endedAt"):
--   - every non-demo player starts again from 100 (demo accounts start from the rating
--     in the snapshot of their first match, since they were created at 220 / 260);
--   - each match is rated with the FNTR formula, using each player's rating at the
--     START of that tournament (the rating they had before their first match in it)
--     and the tournament's "ratingWeight" (KT):
--         winner gains  (100 - (Rw - Rl)) / 10 * KT      (0 for both if Rw - Rl > 100)
--         loser  loses  half of that, and never drops below 0
--   - it then rewrites "User"."rating", "Match"."eloDelta" / "eloDeltaLoser" /
--     "rating1Before" / "rating2Before" and "TournamentUser"."ratingStart".
--
-- A match counts as rated when it is COMPLETED, in a TOURNAMENT-kind event, has a
-- distinct set winner and has an "eloDelta" (the old code only wrote one for a rated
-- result, never for a game or a walkover). Matches with a winner but no "eloDelta" are
-- counted in the output and left out: they are walkovers, or older than the column.
--
-- Idempotent: it derives everything from the matches, so a second run gives the same
-- answer. The formula is the same as computeFntrDelta in server/src/shared/scoring.ts;
-- change one and change the other. Rounding is to two decimals in both, done on exact
-- decimals here and on floats there, so a value sitting exactly on a half-cent boundary
-- can differ by 0.01 between the two.

DO $recalc$
DECLARE
  apply_changes boolean          := false;   -- <-- set to true to write
  start_rating  double precision := 100;
  cutoff        numeric          := 100;

  m             record;
  w_id text; l_id text;
  w_now numeric; l_now numeric;
  w_base numeric; l_base numeric;
  gap numeric; kt numeric;
  w_delta numeric; l_delta numeric; l_after numeric;
  replayed int := 0;
  skipped  int;
  changed  int;
  r        record;
BEGIN
  -- Refuse to run against a database that has not had migration.sql section 17.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'rating' AND data_type = 'double precision')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Match' AND column_name = 'eloDeltaLoser')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Tournament' AND column_name = 'ratingWeight')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TournamentUser' AND column_name = 'ratingStart') THEN
    RAISE EXCEPTION 'Run migration.sql first (section 17: FNTR rating columns).';
  END IF;

  CREATE TEMP TABLE fntr_rating (user_id text PRIMARY KEY, rating numeric NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE fntr_base   (tournament_id text, user_id text, rating numeric NOT NULL, PRIMARY KEY (tournament_id, user_id)) ON COMMIT DROP;
  CREATE TEMP TABLE fntr_match  (match_id text PRIMARY KEY, delta numeric NOT NULL, delta_loser numeric NOT NULL, r1 numeric NOT NULL, r2 numeric NOT NULL) ON COMMIT DROP;
  -- The matches that count, fixed once so the replay and the counts agree.
  CREATE TEMP TABLE fntr_rated ON COMMIT DROP AS
    SELECT ma."id", ma."tournamentId", ma."player1Id", ma."player2Id", ma."setsWon1", ma."setsWon2", ma."rating1Before", ma."rating2Before",
           COALESCE(ma."endedAt", ma."createdAt") AS played_at, t."ratingWeight"
    FROM "Match" ma JOIN "Tournament" t ON t."id" = ma."tournamentId"
    WHERE ma."status" = 'COMPLETED' AND t."kind" = 'TOURNAMENT'
      AND ma."player1Id" IS NOT NULL AND ma."player2Id" IS NOT NULL
      AND ma."setsWon1" <> ma."setsWon2" AND ma."eloDelta" IS NOT NULL;

  INSERT INTO fntr_rating SELECT "id", start_rating FROM "User" WHERE NOT "isDemo";
  -- Demo accounts: the rating in the snapshot of their first rated match, else what they have now.
  INSERT INTO fntr_rating
    SELECT u."id", COALESCE((
      SELECT CASE WHEN f."player1Id" = u."id" THEN f."rating1Before" ELSE f."rating2Before" END
      FROM fntr_rated f WHERE f."player1Id" = u."id" OR f."player2Id" = u."id"
      ORDER BY f.played_at, f."id" LIMIT 1), u."rating")
    FROM "User" u WHERE u."isDemo";

  FOR m IN SELECT * FROM fntr_rated ORDER BY played_at, "id" LOOP
    IF m."setsWon1" > m."setsWon2" THEN w_id := m."player1Id"; l_id := m."player2Id";
    ELSE w_id := m."player2Id"; l_id := m."player1Id"; END IF;

    SELECT rating INTO w_now FROM fntr_rating WHERE user_id = w_id;
    SELECT rating INTO l_now FROM fntr_rating WHERE user_id = l_id;
    w_now := COALESCE(w_now, start_rating);
    l_now := COALESCE(l_now, start_rating);

    -- What each player brought to this tournament: their rating before their first match in it.
    INSERT INTO fntr_base VALUES (m."tournamentId", w_id, w_now) ON CONFLICT DO NOTHING;
    INSERT INTO fntr_base VALUES (m."tournamentId", l_id, l_now) ON CONFLICT DO NOTHING;
    SELECT rating INTO w_base FROM fntr_base WHERE tournament_id = m."tournamentId" AND user_id = w_id;
    SELECT rating INTO l_base FROM fntr_base WHERE tournament_id = m."tournamentId" AND user_id = l_id;

    gap := w_base - l_base;
    kt  := m."ratingWeight";
    IF gap > cutoff THEN
      w_delta := 0; l_delta := 0;
    ELSE
      w_delta := round((cutoff - gap) / 10 * kt, 2);
      l_delta := -round(w_delta / 2, 2);
    END IF;

    l_after := GREATEST(0, round(l_now + l_delta, 2));
    UPDATE fntr_rating SET rating = round(w_now + w_delta, 2) WHERE user_id = w_id;
    UPDATE fntr_rating SET rating = l_after WHERE user_id = l_id;
    INSERT INTO fntr_match VALUES (
      m."id", w_delta, round(l_after - l_now, 2),
      CASE WHEN w_id = m."player1Id" THEN w_now ELSE l_now END,
      CASE WHEN w_id = m."player1Id" THEN l_now ELSE w_now END);
    replayed := replayed + 1;
  END LOOP;

  SELECT count(*) INTO skipped FROM "Match" ma JOIN "Tournament" t ON t."id" = ma."tournamentId"
    WHERE ma."status" = 'COMPLETED' AND t."kind" = 'TOURNAMENT' AND ma."player1Id" IS NOT NULL AND ma."player2Id" IS NOT NULL
      AND ma."setsWon1" <> ma."setsWon2" AND ma."eloDelta" IS NULL;
  SELECT count(*) INTO changed FROM fntr_rating fr JOIN "User" u ON u."id" = fr.user_id WHERE u."rating" IS DISTINCT FROM fr.rating::double precision;

  RAISE NOTICE '% rated matches replayed, % ratings change.', replayed, changed;
  IF skipped > 0 THEN
    RAISE NOTICE 'Left out: % completed match(es) with a winner but no eloDelta (walkovers, or older than the column).', skipped;
  END IF;
  FOR r IN
    SELECT u."firstName" || ' ' || u."lastName" AS name, u."rating" AS old_rating, fr.rating AS new_rating
    FROM fntr_rating fr JOIN "User" u ON u."id" = fr.user_id
    WHERE u."rating" IS DISTINCT FROM fr.rating::double precision
    ORDER BY fr.rating DESC LIMIT 40
  LOOP
    RAISE NOTICE '  % : % -> %', rpad(r.name, 28), lpad(r.old_rating::text, 8), lpad(r.new_rating::text, 8);
  END LOOP;

  IF NOT apply_changes THEN
    RAISE NOTICE 'Dry run: nothing written. Set apply_changes to true and run again to write it.';
    RETURN;
  END IF;

  UPDATE "User" u SET "rating" = fr.rating FROM fntr_rating fr
    WHERE u."id" = fr.user_id AND u."rating" IS DISTINCT FROM fr.rating::double precision;
  UPDATE "Match" ma SET "eloDelta" = f.delta, "eloDeltaLoser" = f.delta_loser, "rating1Before" = f.r1, "rating2Before" = f.r2
    FROM fntr_match f WHERE ma."id" = f.match_id;
  UPDATE "TournamentUser" tu SET "ratingStart" = b.rating FROM fntr_base b
    WHERE tu."tournamentId" = b.tournament_id AND tu."userId" = b.user_id;
  RAISE NOTICE 'Written: % ratings, % matches, % tournament starting ratings.', changed, replayed, (SELECT count(*) FROM fntr_base);
END
$recalc$;
