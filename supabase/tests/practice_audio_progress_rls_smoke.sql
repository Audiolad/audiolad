-- Isolated RLS smoke for practice_audio_progress after security hardening.
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  practice_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  audio_a uuid := 'a1111111-1111-4111-8111-111111111111';
  extra_audio uuid := 'a3333333-3333-4333-8333-333333333333';
  cnt integer;
  raised boolean;
  policy_write integer;
  policy_select integer;
  position_a integer;
BEGIN
  INSERT INTO public.audio_items (id, practice_id)
  VALUES (extra_audio, practice_id);

  SELECT count(*) INTO cnt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'practice_audio_progress'
    AND policyname = 'Users manage own practice audio progress';
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'old FOR ALL policy must be dropped';
  END IF;

  SELECT count(*) INTO policy_select
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'practice_audio_progress'
    AND policyname = 'Users select own practice audio progress'
    AND cmd = 'SELECT';
  IF policy_select <> 1 THEN
    RAISE EXCEPTION 'SELECT-own policy missing';
  END IF;

  SELECT count(*) INTO policy_write
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'practice_audio_progress'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  IF policy_write <> 0 THEN
    RAISE EXCEPTION 'no write policies allowed, got %', policy_write;
  END IF;

  -- Seed inserted before hardening must survive.
  SELECT count(*) INTO cnt FROM public.practice_audio_progress;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'hardening must not delete progress rows, got %', cnt;
  END IF;

  -- -------------------------------------------------------------------------
  -- Authenticated user A: SELECT own PASS, SELECT other DENY (empty)
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';

  SELECT count(*) INTO cnt
  FROM public.practice_audio_progress
  WHERE user_id = user_a;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'A: SELECT own should PASS, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.practice_audio_progress
  WHERE user_id = user_b;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'A: SELECT other should be empty, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt FROM public.practice_audio_progress;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'A: SELECT * should only see own row, got %', cnt;
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.practice_audio_progress (
      user_id, practice_id, audio_item_id, position_seconds, completed
    ) VALUES (
      user_a, practice_id, extra_audio, 3, false
    );
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: direct INSERT own must DENY';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.practice_audio_progress
    SET position_seconds = 99
    WHERE user_id = user_a AND audio_item_id = audio_a;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: direct UPDATE own must DENY';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.practice_audio_progress
    WHERE user_id = user_a AND audio_item_id = audio_a;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: direct DELETE own must DENY';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.practice_audio_progress (
      user_id, practice_id, audio_item_id, position_seconds, completed
    ) VALUES (
      user_b, practice_id, extra_audio, 1, false
    );
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'A: spoof user_id INSERT must DENY';
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT count(*) INTO cnt FROM public.practice_audio_progress;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'authenticated writes must not persist, got % rows', cnt;
  END IF;

  SELECT position_seconds INTO position_a
  FROM public.practice_audio_progress
  WHERE user_id = user_a AND audio_item_id = audio_a;
  IF position_a <> 12 THEN
    RAISE EXCEPTION 'own row must stay unchanged, got position %', position_a;
  END IF;

  -- -------------------------------------------------------------------------
  -- Anon: no access
  -- -------------------------------------------------------------------------
  EXECUTE 'SET ROLE anon';

  raised := false;
  BEGIN
    PERFORM count(*) FROM public.practice_audio_progress;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon SELECT must DENY';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.practice_audio_progress (
      user_id, practice_id, audio_item_id, position_seconds, completed
    ) VALUES (
      user_a, practice_id, extra_audio, 1, false
    );
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon INSERT must DENY';
  END IF;

  EXECUTE 'RESET ROLE';

  -- -------------------------------------------------------------------------
  -- service_role: mutation allowed (trusted server path)
  -- -------------------------------------------------------------------------
  EXECUTE 'SET ROLE service_role';

  INSERT INTO public.practice_audio_progress (
    user_id, practice_id, audio_item_id, position_seconds, completed
  ) VALUES (
    user_a, practice_id, extra_audio, 7, false
  );

  UPDATE public.practice_audio_progress
  SET position_seconds = 8, completed = true
  WHERE user_id = user_a AND audio_item_id = extra_audio;

  SELECT count(*) INTO cnt
  FROM public.practice_audio_progress
  WHERE user_id = user_a;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'service_role should see/write user A rows, got %', cnt;
  END IF;

  DELETE FROM public.practice_audio_progress
  WHERE user_id = user_a AND audio_item_id = extra_audio;

  SELECT count(*) INTO cnt
  FROM public.practice_audio_progress
  WHERE user_id = user_a;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'service_role reset/delete of extra row failed, got %', cnt;
  END IF;

  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO cnt FROM public.practice_audio_progress;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'original two resume rows must remain, got %', cnt;
  END IF;
END;
$$;
