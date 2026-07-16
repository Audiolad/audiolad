-- Playlists PR3.3 mosaic RPC security smoke (owner-only, first 4 by position).
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_owner_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_other_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_author_id uuid;
  pl1 uuid;
  pl_foreign uuid;
  p1 uuid;
  p2 uuid;
  p3 uuid;
  p4 uuid;
  p5 uuid;
  cnt int;
  pos_list int[];
BEGIN
  IF to_regprocedure('public.get_owned_playlist_mosaic_covers()') IS NULL THEN
    RAISE EXCEPTION 'get_owned_playlist_mosaic_covers missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_owner_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'pr33.mosaic.owner@example.com',
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
      'authenticated', 'authenticated', 'pr33.mosaic.other@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  SELECT id INTO v_author_id FROM public.authors ORDER BY id LIMIT 1;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'test requires at least one author';
  END IF;

  DELETE FROM public.playlists
  WHERE user_id IN (v_owner_id, v_other_id)
    AND title LIKE 'PR33 mosaic%';

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, is_catalog_listed, cover_url, price
  ) VALUES
    (v_author_id, 'PR33 M1', 'pr33-m1-' || substr(gen_random_uuid()::text, 1, 8), 'published', true, true, 'https://example.com/1.jpg', 0)
  RETURNING id INTO p1;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, is_catalog_listed, cover_url, price
  ) VALUES
    (v_author_id, 'PR33 M2', 'pr33-m2-' || substr(gen_random_uuid()::text, 1, 8), 'published', true, true, 'https://example.com/2.jpg', 0)
  RETURNING id INTO p2;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, is_catalog_listed, cover_url, price
  ) VALUES
    (v_author_id, 'PR33 M3', 'pr33-m3-' || substr(gen_random_uuid()::text, 1, 8), 'published', true, true, 'https://example.com/3.jpg', 0)
  RETURNING id INTO p3;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, is_catalog_listed, cover_url, price
  ) VALUES
    (v_author_id, 'PR33 M4', 'pr33-m4-' || substr(gen_random_uuid()::text, 1, 8), 'published', true, true, 'https://example.com/4.jpg', 0)
  RETURNING id INTO p4;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, is_catalog_listed, cover_url, price
  ) VALUES
    (v_author_id, 'PR33 M5', 'pr33-m5-' || substr(gen_random_uuid()::text, 1, 8), 'published', true, true, 'https://example.com/5.jpg', 0)
  RETURNING id INTO p5;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR33 mosaic owner', 'private')
  RETURNING id INTO pl1;

  INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
  VALUES (
    v_other_id,
    'PR33 mosaic foreign public',
    'public',
    'pr33-mosaic-foreign-' || substr(gen_random_uuid()::text, 1, 8),
    now()
  )
  RETURNING id INTO pl_foreign;

  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (pl1, p1, 1),
    (pl1, p2, 2),
    (pl1, p3, 3),
    (pl1, p4, 4),
    (pl1, p5, 5),
    (pl_foreign, p1, 1);

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*), array_agg(item_position ORDER BY item_position)
  INTO cnt, pos_list
  FROM public.get_owned_playlist_mosaic_covers()
  WHERE playlist_id = pl1;

  IF cnt <> 4 OR pos_list <> ARRAY[1, 2, 3, 4] THEN
    RAISE EXCEPTION 'owner mosaic expected 4 positions 1..4 got % %', cnt, pos_list;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_owned_playlist_mosaic_covers()
    WHERE playlist_id = pl_foreign
  ) THEN
    RAISE EXCEPTION 'owner must not see foreign playlist mosaic (public visibility irrelevant)';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_other_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  IF EXISTS (
    SELECT 1 FROM public.get_owned_playlist_mosaic_covers()
    WHERE playlist_id = pl1
  ) THEN
    RAISE EXCEPTION 'foreign user must not see owner mosaic';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';

  BEGIN
    PERFORM 1 FROM public.get_owned_playlist_mosaic_covers();
    RAISE EXCEPTION 'anon must not EXECUTE mosaic RPC';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- expected
  END;

  RESET ROLE;
  DELETE FROM public.playlists WHERE id IN (pl1, pl_foreign);
  DELETE FROM public.practices WHERE id IN (p1, p2, p3, p4, p5);

  RAISE NOTICE 'PR33_MOSAIC_RPC_SECURITY_SMOKE_PASS';
END;
$$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_owned_playlist_mosaic_covers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not EXECUTE get_owned_playlist_mosaic_covers';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_owned_playlist_mosaic_covers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must EXECUTE get_owned_playlist_mosaic_covers';
  END IF;

  RAISE NOTICE 'PR33_MOSAIC_RPC_GRANTS_SMOKE_PASS';
END;
$$;
