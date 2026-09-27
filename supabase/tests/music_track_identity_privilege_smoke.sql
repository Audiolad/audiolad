-- Privilege contract for music track identity.
-- Run on a disposable database after migrations, including
-- 20261203120000_music_track_identity_definer.sql.
-- No row writes. Author INSERT cleanup is unnecessary: a denied issuer
-- aborts the audio_items INSERT before a row exists.
BEGIN;

DO $$
DECLARE
  v_name text;
  v_definer boolean;
  v_issuer_definer boolean;
  v_config text[];
  v_owner_can boolean;
  v_denied boolean := false;
  v_names text[] := ARRAY[
    'ensure_music_track_identity',
    'backfill_music_track_identity_on_kind_change'
  ];
BEGIN
  SELECT p.prosecdef
  INTO v_issuer_definer
  FROM pg_proc AS p
  WHERE p.oid = 'public.next_music_track_code()'::regprocedure;

  IF v_issuer_definer IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'next_music_track_code must stay SECURITY INVOKER';
  END IF;

  IF has_function_privilege('anon', 'public.next_music_track_code()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.next_music_track_code()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.next_music_track_code()', 'EXECUTE') THEN
    RAISE EXCEPTION 'next_music_track_code grants are not service_role-only';
  END IF;

  FOREACH v_name IN ARRAY v_names LOOP
    SELECT p.prosecdef, p.proconfig, has_function_privilege(
      p.proowner,
      'public.next_music_track_code()'::regprocedure,
      'EXECUTE'
    )
    INTO v_definer, v_config, v_owner_can
    FROM pg_proc AS p
    WHERE p.oid = format('public.%I()', v_name)::regprocedure;

    IF v_definer IS DISTINCT FROM true THEN
      RAISE EXCEPTION '% must be SECURITY DEFINER', v_name;
    END IF;

    IF v_config IS NULL
      OR NOT (
        'search_path=public, pg_temp' = ANY (v_config)
        OR 'search_path=public,pg_temp' = ANY (v_config)
      )
    THEN
      RAISE EXCEPTION '% search_path must be public, pg_temp', v_name;
    END IF;

    IF v_owner_can IS DISTINCT FROM true THEN
      RAISE EXCEPTION '% owner cannot execute next_music_track_code', v_name;
    END IF;
  END LOOP;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'music track identity smoke must be able to SET ROLE authenticated';
  END;

  BEGIN
    PERFORM public.next_music_track_code();
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
  END;

  RESET ROLE;

  IF NOT v_denied THEN
    RAISE EXCEPTION 'authenticated must receive permission denied for function next_music_track_code';
  END IF;
END;
$$;

ROLLBACK;
