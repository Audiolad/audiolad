-- Isolated RLS + set_practice_rating RPC smoke.
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  user_c uuid := '33333333-3333-4333-8333-333333333333';
  v_practice uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_other uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  cnt integer;
  raised boolean;
  policy_write integer;
  policy_select integer;
  v_stars smallint;
  v_bound integer;
  v_created timestamptz;
  v_updated timestamptz;
  v_changed boolean;
  v_id uuid;
  first_created timestamptz;
  first_updated timestamptz;
  t0 timestamptz := timestamptz '2026-09-21 00:00:00+00';
  t1 timestamptz := timestamptz '2026-09-21 00:01:00+00';
  t2 timestamptz := timestamptz '2026-09-21 00:02:00+00';
  total_stars bigint;
  rating_count bigint;
  old_s smallint;
  new_s smallint;
BEGIN
  SELECT count(*) INTO policy_select
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'practice_ratings'
    AND policyname = 'Users select own practice ratings'
    AND cmd = 'SELECT';
  IF policy_select <> 1 THEN
    RAISE EXCEPTION 'SELECT-own policy missing';
  END IF;

  SELECT count(*) INTO policy_write
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'practice_ratings'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  IF policy_write <> 0 THEN
    RAISE EXCEPTION 'no write policies allowed on practice_ratings, got %', policy_write;
  END IF;

  SELECT count(*) INTO policy_write
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'practice_rating_events';
  IF policy_write <> 0 THEN
    RAISE EXCEPTION 'no client policies allowed on practice_rating_events, got %', policy_write;
  END IF;

  EXECUTE 'SET ROLE service_role';

  -- First rating: one row, created_at, event NULL→4
  SELECT id, stars, created_at, updated_at, changed
  INTO v_id, v_stars, v_created, v_updated, v_changed
  FROM public.set_practice_rating(user_a, v_practice, 4, 'v1:ip-a', 'v1:dev-a', t0);

  IF v_stars <> 4 OR v_changed IS NOT TRUE THEN
    RAISE EXCEPTION 'first rating should insert 4 changed=true';
  END IF;
  IF v_created <> t0 OR v_updated <> t0 THEN
    RAISE EXCEPTION 'first rating timestamps should be t0';
  END IF;

  first_created := v_created;
  first_updated := v_updated;

  SELECT count(*) INTO cnt
  FROM public.practice_ratings
  WHERE user_id = user_a AND practice_id = v_practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'first rating must be one active row, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_rating_events
  WHERE user_id = user_a AND practice_id = v_practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'first rating must write one event, got %', cnt;
  END IF;

  SELECT old_stars, new_stars INTO old_s, new_s
  FROM public.practice_rating_events
  WHERE user_id = user_a AND practice_id = v_practice;
  IF old_s IS NOT NULL OR new_s <> 4 THEN
    RAISE EXCEPTION 'first event must be NULL→4, got % → %', old_s, new_s;
  END IF;

  -- Change 4→5: same row, created_at immutable, updated_at changes, event 4→5
  SELECT id, stars, created_at, updated_at, changed
  INTO v_id, v_stars, v_created, v_updated, v_changed
  FROM public.set_practice_rating(user_a, v_practice, 5, 'v1:ip-ignored', 'v1:dev-ignored', t1);

  IF v_stars <> 5 OR v_changed IS NOT TRUE THEN
    RAISE EXCEPTION 'change should set 5 changed=true';
  END IF;
  IF v_created <> first_created THEN
    RAISE EXCEPTION 'created_at must stay immutable, got % expected %', v_created, first_created;
  END IF;
  IF v_updated <> t1 OR v_updated = first_updated THEN
    RAISE EXCEPTION 'updated_at must change on edit';
  END IF;

  SELECT count(*) INTO cnt FROM public.practice_ratings
  WHERE user_id = user_a AND practice_id = v_practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'edit must not create a second active row';
  END IF;

  SELECT count(*) INTO cnt FROM public.practice_rating_events
  WHERE user_id = user_a AND practice_id = v_practice;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'edit must append one event, got %', cnt;
  END IF;

  SELECT old_stars, new_stars INTO old_s, new_s
  FROM public.practice_rating_events
  WHERE user_id = user_a AND practice_id = v_practice
  ORDER BY occurred_at DESC
  LIMIT 1;
  IF old_s <> 4 OR new_s <> 5 THEN
    RAISE EXCEPTION 'change event must be 4→5, got % → %', old_s, new_s;
  END IF;

  -- Same 5→5: no new event, updated_at untouched
  SELECT stars, created_at, updated_at, changed
  INTO v_stars, v_created, v_updated, v_changed
  FROM public.set_practice_rating(user_a, v_practice, 5, NULL, NULL, t2);

  IF v_changed IS NOT FALSE OR v_stars <> 5 THEN
    RAISE EXCEPTION 'identical resubmit must be no-op';
  END IF;
  IF v_created <> first_created THEN
    RAISE EXCEPTION 'identical resubmit must keep created_at';
  END IF;
  IF v_updated <> t1 THEN
    RAISE EXCEPTION 'identical resubmit must not bump updated_at, got %', v_updated;
  END IF;

  SELECT count(*) INTO cnt FROM public.practice_rating_events
  WHERE user_id = user_a AND practice_id = v_practice;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'identical resubmit must not write an event, got %', cnt;
  END IF;

  -- Bounds rejected
  FOREACH v_bound IN ARRAY ARRAY[0, 6, -1] LOOP
    raised := false;
    BEGIN
      PERFORM public.set_practice_rating(user_a, v_practice, v_bound, NULL, NULL, t2);
    EXCEPTION WHEN others THEN
      raised := true;
    END;
    IF NOT raised THEN
      RAISE EXCEPTION 'stars % must be rejected', v_bound;
    END IF;
  END LOOP;

  -- Concurrency: two first-ratings for user_b → one active row
  PERFORM public.set_practice_rating(user_b, v_practice, 3, NULL, NULL, t0);
  PERFORM public.set_practice_rating(user_b, v_practice, 3, NULL, NULL, t0);
  SELECT count(*) INTO cnt FROM public.practice_ratings
  WHERE user_id = user_b AND practice_id = v_practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'concurrent first ratings must collapse to one row, got %', cnt;
  END IF;
  SELECT count(*) INTO cnt FROM public.practice_rating_events
  WHERE user_id = user_b AND practice_id = v_practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'duplicate first 3★ must not add a second event, got %', cnt;
  END IF;

  -- Rapid changes: 3→4→4→2 → one valid final + consistent events
  PERFORM public.set_practice_rating(user_b, v_practice, 4, NULL, NULL, t1);
  PERFORM public.set_practice_rating(user_b, v_practice, 4, NULL, NULL, t1);
  SELECT stars, created_at INTO v_stars, v_created
  FROM public.set_practice_rating(user_b, v_practice, 2, NULL, NULL, t2);
  IF v_stars <> 2 OR v_created <> t0 THEN
    RAISE EXCEPTION 'rapid changes must end at 2 with first created_at';
  END IF;
  SELECT count(*) INTO cnt FROM public.practice_rating_events
  WHERE user_id = user_b AND practice_id = v_practice;
  IF cnt <> 3 THEN
    RAISE EXCEPTION 'events should be NULL→3, 3→4, 4→2 (no 4→4), got %', cnt;
  END IF;

  -- Aggregate: A=5, B=2, C=4 → 11 / 3; exclude C → 7 / 2; no double count
  PERFORM public.set_practice_rating(user_c, v_other, 4, NULL, NULL, t0);
  SELECT COALESCE(SUM(stars), 0), COUNT(*)
  INTO total_stars, rating_count
  FROM public.practice_ratings
  WHERE practice_id = v_practice
    AND excluded_at IS NULL;
  IF total_stars <> 7 OR rating_count <> 2 THEN
    RAISE EXCEPTION 'aggregate A5+B2 should be 7/2, got % / %', total_stars, rating_count;
  END IF;

  UPDATE public.practice_ratings
  SET excluded_at = t2, excluded_reason = 'test'
  WHERE user_id = user_b AND practice_id = v_practice;

  SELECT COALESCE(SUM(stars), 0), COUNT(*)
  INTO total_stars, rating_count
  FROM public.practice_ratings
  WHERE practice_id = v_practice
    AND excluded_at IS NULL;
  IF total_stars <> 5 OR rating_count <> 1 THEN
    RAISE EXCEPTION 'excluded row must drop from aggregate, got % / %', total_stars, rating_count;
  END IF;

  -- HMAC metadata stored on first insert only
  IF NOT EXISTS (
    SELECT 1 FROM public.practice_ratings
    WHERE user_id = user_a
      AND vote_ip_hmac = 'v1:ip-a'
      AND device_id_hmac = 'v1:dev-a'
  ) THEN
    RAISE EXCEPTION 'first-vote HMAC metadata should be kept';
  END IF;

  EXECUTE 'RESET ROLE';

  -- Authenticated: SELECT own PASS, writes DENY, events DENY, RPC DENY
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO cnt
  FROM public.practice_ratings
  WHERE user_id = user_a;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'A: SELECT own ratings should PASS, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_ratings
  WHERE user_id = user_b;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'A: SELECT other ratings should be empty, got %', cnt;
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.practice_ratings (user_id, practice_id, stars)
    VALUES (user_a, v_other, 5);
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: direct INSERT must DENY';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.practice_ratings SET stars = 1 WHERE user_id = user_a;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: direct UPDATE must DENY';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.practice_ratings WHERE user_id = user_a;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: direct DELETE must DENY';
  END IF;

  raised := false;
  BEGIN
    PERFORM count(*) FROM public.practice_rating_events;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: events SELECT must DENY';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.practice_rating_events (
      user_id, practice_id, old_stars, new_stars
    ) VALUES (user_a, v_practice, 5, 1);
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: events INSERT must DENY';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.set_practice_rating(user_a, v_practice, 1, NULL, NULL, now());
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: authenticated must not EXECUTE set_practice_rating';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT stars INTO v_stars
  FROM public.practice_ratings
  WHERE user_id = user_a AND practice_id = v_practice;
  IF v_stars <> 5 THEN
    RAISE EXCEPTION 'denied writes must not change user A stars';
  END IF;

  -- Anon: no access
  EXECUTE 'SET ROLE anon';

  raised := false;
  BEGIN
    PERFORM count(*) FROM public.practice_ratings;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon SELECT ratings must DENY';
  END IF;

  raised := false;
  BEGIN
    PERFORM count(*) FROM public.practice_rating_events;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon SELECT events must DENY';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.practice_ratings (user_id, practice_id, stars)
    VALUES (user_a, v_practice, 1);
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon INSERT must DENY';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.set_practice_rating(user_a, v_practice, 1, NULL, NULL, now());
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon must not EXECUTE set_practice_rating';
  END IF;

  EXECUTE 'RESET ROLE';

  DELETE FROM auth.users WHERE id = user_c;
  SELECT count(*) INTO cnt
  FROM public.practice_ratings
  WHERE user_id = user_c;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'auth.users delete must CASCADE ratings';
  END IF;
  SELECT count(*) INTO cnt
  FROM public.practice_rating_events
  WHERE user_id = user_c;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'auth.users delete must CASCADE rating events';
  END IF;
END;
$$;
