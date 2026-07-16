-- PR3.2 playlist detail / item delete smoke — isolated test DB only.
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d audiolad_playlists_pr3_test \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_pr3_2_detail_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_owner_id uuid := '11111111-1111-1111-1111-111111111111';
  v_other_id uuid := '22222222-2222-2222-2222-222222222222';
  v_author_id uuid;
  free_id uuid;
  paid_id uuid;
  pl_id uuid;
  foreign_pl uuid;
  cnt integer;
  pos1 integer;
  pos2 integer;
  ua_before timestamptz;
  ua_after timestamptz;
  up_before integer;
  up_after integer;
BEGIN
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
      'authenticated', 'authenticated', 'pr32.owner@example.com',
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
      'authenticated', 'authenticated', 'pr32.other@example.com',
      crypt('x', gen_salt('bf')), now(), now(), now(), '', '', '', ''
    );
  END IF;

  DELETE FROM public.playlist_items
  WHERE playlist_id IN (
    SELECT id FROM public.playlists
    WHERE user_id IN (v_owner_id, v_other_id) AND title LIKE 'PR32%'
  );
  DELETE FROM public.playlists
  WHERE user_id IN (v_owner_id, v_other_id) AND title LIKE 'PR32%';
  DELETE FROM public.user_practices
  WHERE user_id = v_owner_id
    AND practice_id IN (SELECT id FROM public.practices WHERE slug LIKE 'pr32-%');
  DELETE FROM public.practices WHERE slug LIKE 'pr32-%';

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES (
    v_author_id, 'PR32 free', 'pr32-free', 'published', true, 0, true
  ) RETURNING id INTO free_id;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES (
    v_author_id, 'PR32 paid', 'pr32-paid', 'published', false, 500, true
  ) RETURNING id INTO paid_id;

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_owner_id, paid_id, 'purchase');

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR32 detail', 'private')
  RETURNING id INTO pl_id;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_other_id, 'PR32 foreign', 'private')
  RETURNING id INTO foreign_pl;

  INSERT INTO public.playlist_items (playlist_id, practice_id, position)
  VALUES (pl_id, paid_id, 1), (pl_id, free_id, 2);

  SELECT position INTO pos1 FROM public.playlist_items
  WHERE playlist_id = pl_id AND practice_id = paid_id;
  SELECT position INTO pos2 FROM public.playlist_items
  WHERE playlist_id = pl_id AND practice_id = free_id;
  IF pos1 <> 1 OR pos2 <> 2 THEN
    RAISE EXCEPTION 'position order broken';
  END IF;

  -- owner can see own items
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = pl_id;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'owner should see 2 items, got %', cnt;
  END IF;

  -- other cannot see private playlist items via ownership policy
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_other_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO cnt
  FROM public.playlists
  WHERE id = pl_id AND user_id = v_other_id;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'other should not own playlist';
  END IF;

  -- delete item as owner; updated_at advances; user_practices unchanged
  RESET ROLE;
  SELECT updated_at INTO ua_before FROM public.playlists WHERE id = pl_id;
  SELECT count(*) INTO up_before
  FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = paid_id;

  PERFORM pg_sleep(1.05);

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  DELETE FROM public.playlist_items
  WHERE playlist_id = pl_id AND practice_id = paid_id;

  UPDATE public.playlists
  SET updated_at = clock_timestamp()
  WHERE id = pl_id AND user_id = v_owner_id;

  SELECT count(*) INTO cnt
  FROM public.playlist_items WHERE playlist_id = pl_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'expected 1 item after delete, got %', cnt;
  END IF;

  -- remaining free item keeps position 2 (gaps allowed)
  SELECT position INTO pos2 FROM public.playlist_items
  WHERE playlist_id = pl_id AND practice_id = free_id;
  IF pos2 <> 2 THEN
    RAISE EXCEPTION 'remaining position should stay 2, got %', pos2;
  END IF;

  SELECT updated_at INTO ua_after FROM public.playlists WHERE id = pl_id;
  IF ua_after <= ua_before THEN
    RAISE EXCEPTION 'updated_at must advance on delete';
  END IF;

  SELECT count(*) INTO up_after
  FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = paid_id;
  IF up_after <> up_before THEN
    RAISE EXCEPTION 'delete must not change user_practices';
  END IF;

  -- other cannot delete owner's items
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_other_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  DELETE FROM public.playlist_items
  WHERE playlist_id = pl_id AND practice_id = free_id;

  RESET ROLE;
  SELECT count(*) INTO cnt
  FROM public.playlist_items WHERE playlist_id = pl_id AND practice_id = free_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'other must not delete owner items';
  END IF;

  -- cleanup
  RESET ROLE;
  DELETE FROM public.playlist_items WHERE playlist_id IN (pl_id, foreign_pl);
  DELETE FROM public.playlists WHERE id IN (pl_id, foreign_pl);
  DELETE FROM public.user_practices WHERE user_id = v_owner_id AND practice_id IN (free_id, paid_id);
  DELETE FROM public.practices WHERE id IN (free_id, paid_id);

  RAISE NOTICE 'PR32_DETAIL_SMOKE_PASS';
END;
$$;
