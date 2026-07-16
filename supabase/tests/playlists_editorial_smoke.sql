-- Editorial playlist RPC smoke — isolated test DB only (never production `postgres`).
--
-- Prerequisites:
--   1. Core schema + playlists migrations through 20260716160000_editorial_playlists.sql
--   2. At least one row in public.authors
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d audiolad_playlists_editorial_test \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_editorial_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_admin_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_listener_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_author_id uuid;
  v_editorial_pl uuid;
  v_private_pl uuid;
  free_practice uuid;
  paid_practice uuid;
  draft_practice uuid;
  unpublished_practice uuid;
  second_free uuid;
  result jsonb;
  cnt integer;
  pos integer;
  raised boolean;
  v_role text;
BEGIN
  IF to_regprocedure('public.add_editorial_playlist_practices(uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'RPC add_editorial_playlist_practices missing — apply editorial migration first';
  END IF;

  IF to_regprocedure('public.set_practice_playlist_membership(uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'RPC set_practice_playlist_membership missing — apply playlists PR3 migration first';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'editorial.admin@example.com',
      crypt('test-password', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_listener_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_listener_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'editorial.listener@example.com',
      crypt('test-password', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  INSERT INTO public.profiles (id, email, role)
  VALUES (v_admin_id, 'editorial.admin@example.com', 'platform_admin')
  ON CONFLICT (id) DO UPDATE
  SET role = 'platform_admin';

  INSERT INTO public.profiles (id, email, role)
  VALUES (v_listener_id, 'editorial.listener@example.com', 'listener')
  ON CONFLICT (id) DO UPDATE
  SET role = 'listener';

  SELECT id INTO v_author_id FROM public.authors ORDER BY id LIMIT 1;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'test requires at least one author';
  END IF;

  DELETE FROM public.playlist_items
  WHERE playlist_id IN (
    SELECT id FROM public.playlists
    WHERE user_id IN (v_admin_id, v_listener_id)
      AND (title LIKE 'Editorial smoke%' OR slug LIKE 'editorial-smoke-%')
  );

  DELETE FROM public.playlists
  WHERE user_id IN (v_admin_id, v_listener_id)
    AND (title LIKE 'Editorial smoke%' OR slug LIKE 'editorial-smoke-%');

  DELETE FROM public.user_practices
  WHERE user_id = v_admin_id
    AND practice_id IN (SELECT id FROM public.practices WHERE slug LIKE 'editorial-smoke-%');

  DELETE FROM public.audio_items
  WHERE practice_id IN (SELECT id FROM public.practices WHERE slug LIKE 'editorial-smoke-%');

  DELETE FROM public.practices WHERE slug LIKE 'editorial-smoke-%';

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, audio_url
  ) VALUES (
    v_author_id, 'Editorial smoke free', 'editorial-smoke-free', 'published', true, 0, true, 'https://example.com/free.mp3'
  ) RETURNING id INTO free_practice;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, audio_url
  ) VALUES (
    v_author_id, 'Editorial smoke paid', 'editorial-smoke-paid', 'published', false, 990, true, 'https://example.com/paid.mp3'
  ) RETURNING id INTO paid_practice;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES (
    v_author_id, 'Editorial smoke draft', 'editorial-smoke-draft', 'draft', true, 0, true
  ) RETURNING id INTO draft_practice;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES (
    v_author_id, 'Editorial smoke unpublished', 'editorial-smoke-unpublished', 'unpublished', true, 0, true
  ) RETURNING id INTO unpublished_practice;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, audio_url
  ) VALUES (
    v_author_id, 'Editorial smoke free B', 'editorial-smoke-free-b', 'published', true, 0, true, 'https://example.com/free-b.mp3'
  ) RETURNING id INTO second_free;

  INSERT INTO public.playlists (
    user_id, title, visibility, slug, published_at, is_editorial
  ) VALUES (
    v_admin_id, 'Editorial smoke playlist', 'public', 'editorial-smoke-public', now(), true
  ) RETURNING id INTO v_editorial_pl;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_listener_id, 'Editorial smoke private', 'private')
  RETURNING id INTO v_private_pl;

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_listener_id, free_practice, 'starter')
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  -- 1. Unauthenticated call is rejected.
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  raised := false;
  BEGIN
    PERFORM public.add_editorial_playlist_practices(v_editorial_pl, ARRAY[free_practice]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not_authenticated%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'unauthenticated editorial add should fail';
  END IF;

  -- 2. Listener cannot modify editorial playlist.
  PERFORM set_config('request.jwt.claim.sub', v_listener_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_listener_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM public.add_editorial_playlist_practices(v_editorial_pl, ARRAY[free_practice]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%forbidden%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'listener editorial add should fail with forbidden';
  END IF;

  -- 3. platform_admin can add published catalog practice.
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text,
    true
  );
  result := public.add_editorial_playlist_practices(
    v_editorial_pl,
    ARRAY[free_practice]
  );
  IF (result->>'added')::int <> 1 THEN
    RAISE EXCEPTION 'admin add published free failed: %', result;
  END IF;

  SELECT position INTO pos
  FROM public.playlist_items
  WHERE playlist_id = v_editorial_pl AND practice_id = free_practice;
  IF pos <> 1 THEN
    RAISE EXCEPTION 'expected position 1, got %', pos;
  END IF;

  -- 4. Draft / unpublished are rejected.
  raised := false;
  BEGIN
    PERFORM public.add_editorial_playlist_practices(v_editorial_pl, ARRAY[draft_practice]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%practice_not_publishable%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'draft practice should be rejected';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.add_editorial_playlist_practices(v_editorial_pl, ARRAY[unpublished_practice]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%practice_not_publishable%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'unpublished practice should be rejected';
  END IF;

  -- 5. Duplicate in request is skipped without extra row.
  result := public.add_editorial_playlist_practices(
    v_editorial_pl,
    ARRAY[free_practice, second_free]
  );
  IF (result->>'added')::int <> 1 OR (result->>'skipped')::int <> 1 THEN
    RAISE EXCEPTION 'duplicate skip failed: %', result;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = v_editorial_pl AND practice_id = free_practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'duplicate free practice created extra row';
  END IF;

  -- 6. Bulk add preserves request order at end of playlist.
  result := public.add_editorial_playlist_practices(
    v_editorial_pl,
    ARRAY[paid_practice, second_free]
  );
  IF (result->>'added')::int <> 1 OR (result->>'skipped')::int <> 1 THEN
    RAISE EXCEPTION 'ordered bulk add failed: %', result;
  END IF;

  SELECT position INTO pos
  FROM public.playlist_items
  WHERE playlist_id = v_editorial_pl AND practice_id = paid_practice;
  IF pos <> 3 THEN
    RAISE EXCEPTION 'paid practice expected position 3, got %', pos;
  END IF;

  -- 7. Paid editorial add does not grant entitlement.
  SELECT count(*) INTO cnt
  FROM public.user_practices
  WHERE user_id = v_admin_id AND practice_id = paid_practice;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'editorial paid add must not create user_practices row';
  END IF;

  -- 8. Personal playlist membership still works for listener.
  PERFORM set_config('request.jwt.claim.sub', v_listener_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_listener_id::text, 'role', 'authenticated')::text,
    true
  );
  result := public.set_practice_playlist_membership(
    free_practice,
    ARRAY[v_private_pl]
  );
  IF (result->>'added')::int <> 1 THEN
    RAISE EXCEPTION 'listener private membership failed: %', result;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = v_private_pl AND practice_id = free_practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'listener private playlist item missing';
  END IF;

  -- 9. Authenticated client cannot self-elevate profiles.role.
  UPDATE public.profiles
  SET role = 'platform_admin'
  WHERE id = v_listener_id;
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_listener_id;
  IF v_role <> 'listener' THEN
    RAISE EXCEPTION 'listener must not self-assign platform_admin via JWT update';
  END IF;

  RESET ROLE;

  DELETE FROM public.playlist_items
  WHERE playlist_id IN (v_editorial_pl, v_private_pl);
  DELETE FROM public.playlists
  WHERE id IN (v_editorial_pl, v_private_pl);
  DELETE FROM public.user_practices
  WHERE user_id = v_listener_id AND practice_id = free_practice;
  DELETE FROM public.practices WHERE slug LIKE 'editorial-smoke-%';

  RAISE NOTICE 'PLAYLISTS_EDITORIAL_SMOKE_PASS';
END;
$$;
