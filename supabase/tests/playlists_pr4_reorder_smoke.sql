-- PR4 playlist item reorder (move up/down) smoke — isolated test DB only.
-- Never run against production `postgres`.
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d audiolad_playlists_pr4_test \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_pr4_reorder_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_owner_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_other_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_author_id uuid;
  pl_id uuid;
  foreign_pl uuid;
  p1 uuid;
  p2 uuid;
  p3 uuid;
  p4 uuid;
  p5 uuid;
  paid_id uuid;
  unavailable_id uuid;
  gap_a uuid;
  gap_b uuid;
  gap_c uuid;
  single_id uuid;
  single_pl uuid;
  move_row record;
  ua_before timestamptz;
  ua_after timestamptz;
  up_before integer;
  up_after integer;
  ai_pos_before integer;
  ai_pos_after integer;
  ai_id uuid;
  order_ids uuid[];
  mosaic_urls text[];
  pos_list integer[];
  cover_path_before text;
  cover_ua_before timestamptz;
  raised boolean;
  err text;
BEGIN
  IF to_regprocedure('public.move_playlist_item(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'move_playlist_item missing — apply PR4 migration first';
  END IF;

  SELECT id INTO v_author_id FROM public.authors ORDER BY id LIMIT 1;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'need author';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_owner_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'pr4.owner@example.com',
      crypt('x', gen_salt('bf')), now(), now(), now(), '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_other_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_other_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'pr4.other@example.com',
      crypt('x', gen_salt('bf')), now(), now(), now(), '', '', '', ''
    );
  END IF;

  DELETE FROM public.playlist_items
  WHERE playlist_id IN (
    SELECT id FROM public.playlists
    WHERE user_id IN (v_owner_id, v_other_id) AND title LIKE 'PR4%'
  );
  DELETE FROM public.playlists
  WHERE user_id IN (v_owner_id, v_other_id) AND title LIKE 'PR4%';
  DELETE FROM public.user_practices
  WHERE user_id = v_owner_id
    AND practice_id IN (SELECT id FROM public.practices WHERE slug LIKE 'pr4-%');
  DELETE FROM public.practices WHERE slug LIKE 'pr4-%';

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, cover_url
  ) VALUES
    (v_author_id, 'PR4 p1', 'pr4-p1', 'published', true, 0, true, 'https://example.com/pr4-1.jpg')
  RETURNING id INTO p1;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, cover_url
  ) VALUES
    (v_author_id, 'PR4 p2', 'pr4-p2', 'published', true, 0, true, 'https://example.com/pr4-2.jpg')
  RETURNING id INTO p2;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, cover_url
  ) VALUES
    (v_author_id, 'PR4 p3', 'pr4-p3', 'published', true, 0, true, 'https://example.com/pr4-3.jpg')
  RETURNING id INTO p3;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, cover_url
  ) VALUES
    (v_author_id, 'PR4 p4', 'pr4-p4', 'published', true, 0, true, 'https://example.com/pr4-4.jpg')
  RETURNING id INTO p4;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, cover_url
  ) VALUES
    (v_author_id, 'PR4 p5', 'pr4-p5', 'published', true, 0, true, 'https://example.com/pr4-5.jpg')
  RETURNING id INTO p5;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, cover_url
  ) VALUES
    (v_author_id, 'PR4 paid', 'pr4-paid', 'published', false, 500, true, 'https://example.com/pr4-paid.jpg')
  RETURNING id INTO paid_id;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, cover_url
  ) VALUES
    (v_author_id, 'PR4 unavailable', 'pr4-unavail', 'archived', true, 0, false, 'https://example.com/pr4-u.jpg')
  RETURNING id INTO unavailable_id;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES
    (v_author_id, 'PR4 gap a', 'pr4-gap-a', 'published', true, 0, true)
  RETURNING id INTO gap_a;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES
    (v_author_id, 'PR4 gap b', 'pr4-gap-b', 'published', true, 0, true)
  RETURNING id INTO gap_b;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES
    (v_author_id, 'PR4 gap c', 'pr4-gap-c', 'published', true, 0, true)
  RETURNING id INTO gap_c;
  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES
    (v_author_id, 'PR4 single', 'pr4-single', 'published', true, 0, true)
  RETURNING id INTO single_id;

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_owner_id, paid_id, 'purchase');

  INSERT INTO public.audio_items (practice_id, title, position, status)
  VALUES (p1, 'PR4 track', 1, 'published')
  RETURNING id, position INTO ai_id, ai_pos_before;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR4 main', 'private')
  RETURNING id INTO pl_id;

  -- custom cover fields must survive reorder
  UPDATE public.playlists
  SET
    cover_path = v_owner_id::text || '/' || pl_id::text || '/fixture.webp',
    cover_updated_at = timestamptz '2026-01-01 00:00:00+00'
  WHERE id = pl_id;

  SELECT cover_path, cover_updated_at
  INTO cover_path_before, cover_ua_before
  FROM public.playlists WHERE id = pl_id;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_other_id, 'PR4 foreign', 'private')
  RETURNING id INTO foreign_pl;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR4 single pl', 'private')
  RETURNING id INTO single_pl;

  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (pl_id, p1, 1),
    (pl_id, p2, 2),
    (pl_id, p3, 3),
    (pl_id, p4, 4),
    (pl_id, p5, 5),
    (pl_id, paid_id, 6),
    (pl_id, unavailable_id, 7);

  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (single_pl, single_id, 1);

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- first up → no-op
  SELECT updated_at INTO ua_before FROM public.playlists WHERE id = pl_id;
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, p1, 'up');
  IF move_row.moved IS DISTINCT FROM false
     OR move_row.from_position IS DISTINCT FROM 1
     OR move_row.to_position IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'first up should be no-op, got %', move_row;
  END IF;
  SELECT updated_at INTO ua_after FROM public.playlists WHERE id = pl_id;
  IF ua_after IS DISTINCT FROM ua_before THEN
    RAISE EXCEPTION 'first up must not bump updated_at';
  END IF;

  -- last down → no-op (unavailable is last at 7)
  SELECT updated_at INTO ua_before FROM public.playlists WHERE id = pl_id;
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, unavailable_id, 'down');
  IF move_row.moved IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'last down should be no-op';
  END IF;
  SELECT updated_at INTO ua_after FROM public.playlists WHERE id = pl_id;
  IF ua_after IS DISTINCT FROM ua_before THEN
    RAISE EXCEPTION 'last down must not bump updated_at';
  END IF;

  -- single item both directions
  SELECT * INTO move_row FROM public.move_playlist_item(single_pl, single_id, 'up');
  IF move_row.moved IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'single up must be no-op';
  END IF;
  SELECT * INTO move_row FROM public.move_playlist_item(single_pl, single_id, 'down');
  IF move_row.moved IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'single down must be no-op';
  END IF;

  -- move down p1 <-> p2
  SELECT count(*) INTO up_before
  FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = paid_id;
  SELECT updated_at INTO ua_before FROM public.playlists WHERE id = pl_id;
  PERFORM pg_sleep(1.05);

  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, p1, 'down');
  IF move_row.moved IS DISTINCT FROM true
     OR move_row.from_position <> 1
     OR move_row.to_position <> 2 THEN
    RAISE EXCEPTION 'move down failed: %', move_row;
  END IF;

  SELECT array_agg(practice_id ORDER BY position)
  INTO order_ids
  FROM public.playlist_items WHERE playlist_id = pl_id AND practice_id IN (p1, p2, p3, p4, p5);

  IF order_ids[1] IS DISTINCT FROM p2 OR order_ids[2] IS DISTINCT FROM p1 THEN
    RAISE EXCEPTION 'after down order wrong: %', order_ids;
  END IF;

  SELECT updated_at INTO ua_after FROM public.playlists WHERE id = pl_id;
  IF ua_after <= ua_before THEN
    RAISE EXCEPTION 'updated_at must advance on real move';
  END IF;

  SELECT count(*) INTO up_after
  FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = paid_id;
  IF up_after <> up_before THEN
    RAISE EXCEPTION 'user_practices changed on reorder';
  END IF;

  RESET ROLE;
  SELECT position INTO ai_pos_after FROM public.audio_items WHERE id = ai_id;
  IF ai_pos_after <> ai_pos_before THEN
    RAISE EXCEPTION 'audio_items.position must not change';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- move up restores
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, p1, 'up');
  IF move_row.moved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'move up failed';
  END IF;

  SELECT array_agg(practice_id ORDER BY position)
  INTO order_ids
  FROM public.playlist_items WHERE playlist_id = pl_id AND practice_id IN (p1, p2, p3, p4, p5);
  IF order_ids[1] IS DISTINCT FROM p1 OR order_ids[2] IS DISTINCT FROM p2 THEN
    RAISE EXCEPTION 'after up order wrong: %', order_ids;
  END IF;

  -- unavailable can move
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, unavailable_id, 'up');
  IF move_row.moved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'unavailable item must be movable';
  END IF;

  -- gaps: rebuild small set 1,3,7
  DELETE FROM public.playlist_items WHERE playlist_id = pl_id;
  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (pl_id, gap_a, 1),
    (pl_id, gap_b, 3),
    (pl_id, gap_c, 7);

  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, gap_c, 'up');
  IF move_row.moved IS DISTINCT FROM true
     OR move_row.from_position <> 7
     OR move_row.to_position <> 3 THEN
    RAISE EXCEPTION 'gap move up failed: %', move_row;
  END IF;

  -- swap positions: gap_c should now be 3, gap_b 7; sort ASC = a,c,b
  SELECT array_agg(practice_id ORDER BY position)
  INTO order_ids
  FROM public.playlist_items WHERE playlist_id = pl_id;
  IF order_ids IS DISTINCT FROM ARRAY[gap_a, gap_c, gap_b] THEN
    RAISE EXCEPTION 'gap swap order wrong: %', order_ids;
  END IF;

  -- UNIQUE still holds
  IF (
    SELECT count(*) FROM (
      SELECT position FROM public.playlist_items WHERE playlist_id = pl_id GROUP BY position HAVING count(*) > 1
    ) d
  ) <> 0 THEN
    RAISE EXCEPTION 'UNIQUE position violated after swap';
  END IF;

  -- reverse gap move
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, gap_c, 'down');
  IF move_row.moved IS DISTINCT FROM true
     OR move_row.from_position <> 3
     OR move_row.to_position <> 7 THEN
    RAISE EXCEPTION 'gap move down restore failed: %', move_row;
  END IF;

  -- gaps 10, 100, 10000
  DELETE FROM public.playlist_items WHERE playlist_id = pl_id;
  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (pl_id, gap_a, 10),
    (pl_id, gap_b, 100),
    (pl_id, gap_c, 10000);

  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, gap_c, 'up');
  IF move_row.moved IS DISTINCT FROM true
     OR move_row.from_position <> 10000
     OR move_row.to_position <> 100 THEN
    RAISE EXCEPTION 'large gap move up failed: %', move_row;
  END IF;

  SELECT array_agg(practice_id ORDER BY position)
  INTO order_ids
  FROM public.playlist_items WHERE playlist_id = pl_id;
  IF order_ids IS DISTINCT FROM ARRAY[gap_a, gap_c, gap_b] THEN
    RAISE EXCEPTION 'large gap order wrong: %', order_ids;
  END IF;

  -- positions near former fixed-offset range must not collide with temp=max+1
  DELETE FROM public.playlist_items WHERE playlist_id = pl_id;
  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (pl_id, gap_a, 1000000000),
    (pl_id, gap_b, 1000000001),
    (pl_id, gap_c, 1000000002);

  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, gap_c, 'up');
  IF move_row.moved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'near-1e9 move failed: %', move_row;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.playlist_items
    WHERE playlist_id = pl_id AND position > 1000000002
  ) THEN
    RAISE EXCEPTION 'temp position leaked after swap near 1e9';
  END IF;

  SELECT array_agg(practice_id ORDER BY position)
  INTO order_ids
  FROM public.playlist_items WHERE playlist_id = pl_id;
  IF order_ids IS DISTINCT FROM ARRAY[gap_a, gap_c, gap_b] THEN
    RAISE EXCEPTION 'near-1e9 order wrong: %', order_ids;
  END IF;

  -- integer overflow at max int: conflict, no partial change
  DELETE FROM public.playlist_items WHERE playlist_id = pl_id;
  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (pl_id, gap_a, 2147483646),
    (pl_id, gap_b, 2147483647);

  SELECT updated_at INTO ua_before FROM public.playlists WHERE id = pl_id;
  raised := false;
  BEGIN
    PERFORM public.move_playlist_item(pl_id, gap_b, 'up');
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      raised := true;
      GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
      IF err IS DISTINCT FROM 'reorder_conflict' THEN
        RAISE EXCEPTION 'overflow must raise reorder_conflict, got %', err;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'max-int overflow must fail';
  END IF;

  SELECT array_agg(practice_id ORDER BY position), array_agg(position ORDER BY position)
  INTO order_ids, pos_list
  FROM public.playlist_items WHERE playlist_id = pl_id;
  IF order_ids IS DISTINCT FROM ARRAY[gap_a, gap_b]
     OR pos_list IS DISTINCT FROM ARRAY[2147483646, 2147483647] THEN
    RAISE EXCEPTION 'overflow must leave order unchanged: % %', order_ids, pos_list;
  END IF;
  SELECT updated_at INTO ua_after FROM public.playlists WHERE id = pl_id;
  IF ua_after IS DISTINCT FROM ua_before THEN
    RAISE EXCEPTION 'overflow must not bump updated_at';
  END IF;

  -- mosaic top-4 after moving p5 into top
  DELETE FROM public.playlist_items WHERE playlist_id = pl_id;
  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (pl_id, p1, 1),
    (pl_id, p2, 2),
    (pl_id, p3, 3),
    (pl_id, p4, 4),
    (pl_id, p5, 5);

  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, p5, 'up'); -- 4
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, p5, 'up'); -- 3
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, p5, 'up'); -- 2
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, p5, 'up'); -- 1
  IF move_row.moved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'p5 should reach first';
  END IF;

  SELECT array_agg(practice_id ORDER BY position)
  INTO order_ids
  FROM public.playlist_items WHERE playlist_id = pl_id;
  IF order_ids[1] IS DISTINCT FROM p5 THEN
    RAISE EXCEPTION 'p5 not first after moves: %', order_ids;
  END IF;

  IF to_regprocedure('public.get_owned_playlist_mosaic_covers()') IS NOT NULL THEN
    SELECT array_agg(cover_url ORDER BY item_position)
    INTO mosaic_urls
    FROM public.get_owned_playlist_mosaic_covers()
    WHERE playlist_id = pl_id;

    IF mosaic_urls IS NULL OR array_length(mosaic_urls, 1) < 4 THEN
      RAISE EXCEPTION 'mosaic should return 4 urls, got %', mosaic_urls;
    END IF;
    IF mosaic_urls[1] IS DISTINCT FROM 'https://example.com/pr4-5.jpg' THEN
      RAISE EXCEPTION 'mosaic first cover should be p5, got %', mosaic_urls;
    END IF;
  END IF;

  IF (
    SELECT cover_path FROM public.playlists WHERE id = pl_id
  ) IS DISTINCT FROM cover_path_before
  OR (
    SELECT cover_updated_at FROM public.playlists WHERE id = pl_id
  ) IS DISTINCT FROM cover_ua_before THEN
    RAISE EXCEPTION 'custom cover fields must not change on reorder';
  END IF;

  -- foreign playlist
  raised := false;
  BEGIN
    PERFORM public.move_playlist_item(foreign_pl, p1, 'up');
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      raised := true;
      GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
      IF err IS DISTINCT FROM 'playlist_or_item_not_found' THEN
        RAISE EXCEPTION 'foreign playlist error text leak/wrong: %', err;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'foreign playlist must fail neutrally';
  END IF;

  -- missing item
  raised := false;
  BEGIN
    PERFORM public.move_playlist_item(pl_id, foreign_pl, 'up'); -- random uuid not in items
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'missing item must fail';
  END IF;

  -- item in other playlist cannot be moved via this playlist id
  RESET ROLE;
  INSERT INTO public.playlist_items (playlist_id, practice_id, position)
  VALUES (foreign_pl, gap_a, 1)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  raised := false;
  BEGIN
    PERFORM public.move_playlist_item(pl_id, gap_a, 'up');
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'item from other playlist must fail';
  END IF;

  -- invalid direction
  raised := false;
  BEGIN
    PERFORM public.move_playlist_item(pl_id, p5, 'sideways');
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'invalid direction must fail';
  END IF;

  -- move after delete neighbour: 1,2,3 delete middle, move last up
  DELETE FROM public.playlist_items WHERE playlist_id = pl_id;
  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (pl_id, p1, 1),
    (pl_id, p2, 2),
    (pl_id, p3, 3);
  DELETE FROM public.playlist_items WHERE playlist_id = pl_id AND practice_id = p2;
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, p3, 'up');
  IF move_row.moved IS DISTINCT FROM true
     OR move_row.from_position <> 3
     OR move_row.to_position <> 1 THEN
    RAISE EXCEPTION 'move after delete neighbour failed: %', move_row;
  END IF;

  -- race-ish: sequential double-submit at boundary stays consistent
  SELECT * INTO move_row FROM public.move_playlist_item(pl_id, p3, 'up');
  IF move_row.moved IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'second up at boundary must be no-op';
  END IF;

  -- other user cannot move owner playlist
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_other_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  raised := false;
  BEGIN
    PERFORM public.move_playlist_item(pl_id, p3, 'down');
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'other user must not move owner playlist';
  END IF;

  -- anon EXECUTE denied
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';

  raised := false;
  BEGIN
    PERFORM public.move_playlist_item(pl_id, p3, 'down');
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon must not EXECUTE move_playlist_item';
  END IF;

  RESET ROLE;
  DELETE FROM public.playlist_items
  WHERE playlist_id IN (pl_id, foreign_pl, single_pl);
  DELETE FROM public.playlists WHERE id IN (pl_id, foreign_pl, single_pl);
  DELETE FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = paid_id;
  DELETE FROM public.practices
  WHERE id IN (
    p1, p2, p3, p4, p5, paid_id, unavailable_id,
    gap_a, gap_b, gap_c, single_id
  );

  RAISE NOTICE 'PR4_REORDER_SMOKE_PASS';
END;
$$;

-- Lock-order note (not true parallel workers):
-- move_playlist_item: playlists FOR UPDATE → current item → neighbour.
-- membership RPC: locks owned playlists ORDER BY id FOR UPDATE first.
-- cover CAS: playlist FOR UPDATE.
-- delete item API: does NOT take parent FOR UPDATE before DELETE; concurrent
-- delete vs move may wait or deadlock (40P01) — API maps to 409 reorder_conflict.
-- Sequential sims covered above: delete neighbour then move; double move at boundary.

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.move_playlist_item(uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon must not EXECUTE move_playlist_item';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.move_playlist_item(uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must EXECUTE move_playlist_item';
  END IF;

  RAISE NOTICE 'PR4_REORDER_GRANTS_SMOKE_PASS';
END;
$$;
