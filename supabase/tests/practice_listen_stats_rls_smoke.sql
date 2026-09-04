-- Isolated RLS + MEDIA-TIME RPC smoke for practice_listen_stats.
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  v_practice uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  audio_a uuid := 'a1111111-1111-4111-8111-111111111111';
  audio_b uuid := 'a2222222-2222-4222-8222-222222222222';
  cnt integer;
  raised boolean;
  policy_write integer;
  policy_select integer;
  listened bigint;
  eligible timestamptz;
  accepted bigint;
  t0 timestamptz := timestamptz '2026-09-20 00:00:00+00';
BEGIN
  SELECT count(*) INTO policy_select
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'practice_listen_stats'
    AND policyname = 'Users select own practice listen stats'
    AND cmd = 'SELECT';
  IF policy_select <> 1 THEN
    RAISE EXCEPTION 'SELECT-own policy missing';
  END IF;

  SELECT count(*) INTO policy_write
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'practice_listen_stats'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  IF policy_write <> 0 THEN
    RAISE EXCEPTION 'no write policies allowed, got %', policy_write;
  END IF;

  -- -------------------------------------------------------------------------
  -- service_role RPC: accumulate across tracks, eligible at 30s
  -- -------------------------------------------------------------------------
  EXECUTE 'SET ROLE service_role';

  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_a, 0, true, NULL, 1, t0
  );
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_a, 10000, true, NULL, 1, t0 + interval '10 seconds'
  );
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_a, 15000, true, NULL, 1, t0 + interval '15 seconds'
  );
  -- track change +0
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_b, 2000, true, NULL, 1, t0 + interval '1 day'
  );
  SELECT real_listened_ms, accepted_ms, rating_eligible_at
  INTO listened, accepted, eligible
  FROM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_b, 17000, true, NULL, 1, t0 + interval '1 day 15 seconds'
  );
  IF listened <> 30000 THEN
    RAISE EXCEPTION 'accumulate across tracks should be 30000, got %', listened;
  END IF;
  IF eligible IS NULL THEN
    RAISE EXCEPTION 'should become eligible at 30000';
  END IF;

  -- continue after 30s
  SELECT real_listened_ms, rating_eligible_at
  INTO listened, eligible
  FROM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_b, 20000, true, NULL, 1, t0 + interval '1 day 18 seconds'
  );
  IF listened <> 33000 THEN
    RAISE EXCEPTION 'should keep accumulating after eligibility, got %', listened;
  END IF;

  -- seek jump +0 then continue
  SELECT accepted_ms, real_listened_ms
  INTO accepted, listened
  FROM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_b, 20000 + 21000, true, NULL, 1, t0 + interval '1 day 19 seconds'
  );
  IF accepted <> 0 THEN
    RAISE EXCEPTION 'seek jump must be +0, got %', accepted;
  END IF;

  SELECT accepted_ms INTO accepted
  FROM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_b, 20000 + 21000 + 4000, true, NULL, 1,
    t0 + interval '1 day 23 seconds'
  );
  IF accepted <> 4000 THEN
    RAISE EXCEPTION 'continue after seek should accept 4000, got %', accepted;
  END IF;

  -- pause +0
  SELECT accepted_ms INTO accepted
  FROM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_b, 45000, true, NULL, 1, t0 + interval '1 day 30 seconds'
  );
  IF accepted <> 0 THEN
    RAISE EXCEPTION 'pause must be +0, got %', accepted;
  END IF;

  -- rewind +0 then re-listen
  SELECT accepted_ms INTO accepted
  FROM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_b, 5000, true, NULL, 1, t0 + interval '1 day 31 seconds'
  );
  IF accepted <> 0 THEN
    RAISE EXCEPTION 'rewind jump must be +0, got %', accepted;
  END IF;
  SELECT accepted_ms INTO accepted
  FROM public.apply_practice_listen_stats_heartbeat(
    user_a, v_practice, audio_b, 9000, true, NULL, 1, t0 + interval '1 day 35 seconds'
  );
  IF accepted <> 4000 THEN
    RAISE EXCEPTION 're-listen after rewind should count, got %', accepted;
  END IF;

  -- author: accrue but no eligibility
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 0, false, NULL, 1, t0
  );
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 15000, false, NULL, 1, t0 + interval '15 seconds'
  );
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 30000, false, NULL, 1, t0 + interval '30 seconds'
  );
  SELECT real_listened_ms, rating_eligible_at
  INTO listened, eligible
  FROM public.practice_listen_stats
  WHERE user_id = user_b AND practice_id = v_practice;
  IF listened < 15000 THEN
    RAISE EXCEPTION 'author should accrue media-time, got %', listened;
  END IF;
  IF eligible IS NOT NULL THEN
    RAISE EXCEPTION 'author must not become eligible';
  END IF;

  -- 1.5x media-time: 20s wall / 30s media
  DELETE FROM public.practice_listen_stats WHERE user_id = user_b;
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 0, true, NULL, 1.5, t0
  );
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 15000, true, NULL, 1.5, t0 + interval '10 seconds'
  );
  SELECT real_listened_ms, rating_eligible_at
  INTO listened, eligible
  FROM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 30000, true, NULL, 1.5, t0 + interval '20 seconds'
  );
  IF listened <> 30000 THEN
    RAISE EXCEPTION '1.5x should reach 30000 media in 20s wall, got %', listened;
  END IF;
  IF eligible IS NULL THEN
    RAISE EXCEPTION '1.5x should be eligible';
  END IF;

  -- 0.75x: 40s wall / 30s media
  DELETE FROM public.practice_listen_stats WHERE user_id = user_b;
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 0, true, NULL, 0.75, t0
  );
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 15000, true, NULL, 0.75, t0 + interval '20 seconds'
  );
  SELECT real_listened_ms, rating_eligible_at
  INTO listened, eligible
  FROM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 30000, true, NULL, 0.75, t0 + interval '40 seconds'
  );
  IF listened <> 30000 THEN
    RAISE EXCEPTION '0.75x should reach 30000 media in 40s wall, got %', listened;
  END IF;
  IF eligible IS NULL THEN
    RAISE EXCEPTION '0.75x should be eligible';
  END IF;

  -- race: overlapping ticks serialize, no double
  DELETE FROM public.practice_listen_stats WHERE user_id = user_b;
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 10000, true, NULL, 1, t0
  );
  PERFORM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 15000, true, NULL, 1, t0 + interval '5 seconds'
  );
  SELECT real_listened_ms, accepted_ms
  INTO listened, accepted
  FROM public.apply_practice_listen_stats_heartbeat(
    user_b, v_practice, audio_a, 16000, true, NULL, 1, t0 + interval '5 seconds 100 milliseconds'
  );
  IF listened > 6000 THEN
    RAISE EXCEPTION 'serialized race must not double-count, got %', listened;
  END IF;
  IF listened < 5000 THEN
    RAISE EXCEPTION 'serialized race must not lose first 5s, got %', listened;
  END IF;

  EXECUTE 'RESET ROLE';

  -- -------------------------------------------------------------------------
  -- Authenticated: SELECT own PASS, writes DENY, RPC EXECUTE DENY
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO cnt
  FROM public.practice_listen_stats
  WHERE user_id = user_a;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'A: SELECT own should PASS, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_listen_stats
  WHERE user_id = user_b;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'A: SELECT other should be empty, got %', cnt;
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.practice_listen_stats (
      user_id, practice_id, real_listened_ms
    ) VALUES (
      user_a, v_practice, 30000
    );
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: direct INSERT own must DENY';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.practice_listen_stats
    SET real_listened_ms = 30000, rating_eligible_at = now()
    WHERE user_id = user_a;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: direct UPDATE eligibility must DENY';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.practice_listen_stats WHERE user_id = user_a;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: direct DELETE own must DENY';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.apply_practice_listen_stats_heartbeat(
      user_a, v_practice, audio_a, 99999, true, 30000, 1, now()
    );
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: authenticated must not EXECUTE heartbeat RPC';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT real_listened_ms INTO listened
  FROM public.practice_listen_stats
  WHERE user_id = user_a;
  IF listened < 30000 THEN
    RAISE EXCEPTION 'denied writes must not change user A row';
  END IF;

  -- -------------------------------------------------------------------------
  -- Anon: no access
  -- -------------------------------------------------------------------------
  EXECUTE 'SET ROLE anon';

  raised := false;
  BEGIN
    PERFORM count(*) FROM public.practice_listen_stats;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon SELECT must DENY';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.practice_listen_stats (
      user_id, practice_id, real_listened_ms
    ) VALUES (
      user_a, v_practice, 1
    );
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon INSERT must DENY';
  END IF;

  EXECUTE 'RESET ROLE';

  -- auth.users delete cascades
  DELETE FROM auth.users WHERE id = user_b;
  SELECT count(*) INTO cnt
  FROM public.practice_listen_stats
  WHERE user_id = user_b;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'auth.users delete must CASCADE listen_stats';
  END IF;
END;
$$;
