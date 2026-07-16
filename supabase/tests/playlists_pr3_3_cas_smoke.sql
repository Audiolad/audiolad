-- Playlists PR3.3 CAS replace_playlist_cover_path smoke.
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_owner_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_other_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  pl uuid;
  path_a text;
  path_b text;
  path_c text;
  r record;
BEGIN
  IF to_regprocedure('public.replace_playlist_cover_path(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'replace_playlist_cover_path missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_owner_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'pr33.cas.owner@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_other_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_other_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'pr33.cas.other@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  DELETE FROM public.playlists
  WHERE user_id IN (v_owner_id, v_other_id) AND title LIKE 'PR33 CAS%';

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR33 CAS PL', 'private')
  RETURNING id INTO pl;

  path_a := v_owner_id::text || '/' || pl::text || '/' || gen_random_uuid()::text || '.webp';
  path_b := v_owner_id::text || '/' || pl::text || '/' || gen_random_uuid()::text || '.webp';
  path_c := v_owner_id::text || '/' || pl::text || '/' || gen_random_uuid()::text || '.webp';

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, NULL, path_a);
  IF r.status <> 'ok' OR r.cover_path <> path_a THEN
    RAISE EXCEPTION 'set A failed: % %', r.status, r.cover_path;
  END IF;

  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, NULL, path_b);
  IF r.status <> 'conflict' OR r.cover_path <> path_a THEN
    RAISE EXCEPTION 'stale expected must conflict, got % %', r.status, r.cover_path;
  END IF;

  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, path_a, path_b);
  IF r.status <> 'ok' OR r.previous_path <> path_a OR r.cover_path <> path_b THEN
    RAISE EXCEPTION 'A->B failed: % % %', r.status, r.previous_path, r.cover_path;
  END IF;

  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, path_a, path_c);
  IF r.status <> 'conflict' OR r.cover_path <> path_b THEN
    RAISE EXCEPTION 'loser CAS must conflict keeping B: % %', r.status, r.cover_path;
  END IF;

  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, path_b, NULL);
  IF r.status <> 'ok' OR r.cover_path IS NOT NULL OR r.cover_updated_at IS NOT NULL THEN
    RAISE EXCEPTION 'clear failed: % % %', r.status, r.cover_path, r.cover_updated_at;
  END IF;

  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, NULL, NULL);
  IF r.status <> 'ok' THEN
    RAISE EXCEPTION 'idempotent clear failed: %', r.status;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_other_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, NULL, path_a);
  IF r.status <> 'not_found' THEN
    RAISE EXCEPTION 'foreign user expected not_found got %', r.status;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';

  BEGIN
    PERFORM 1 FROM public.replace_playlist_cover_path(pl, NULL, path_a);
    RAISE EXCEPTION 'anon must not EXECUTE replace_playlist_cover_path';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- expected: EXECUTE revoked from anon
  END;

  RESET ROLE;
  IF has_function_privilege('anon', 'public.replace_playlist_cover_path(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not EXECUTE replace_playlist_cover_path';
  END IF;

  DELETE FROM public.playlists WHERE id = pl;

  RAISE NOTICE 'PR33_CAS_SMOKE_PASS';
END;
$$;
