-- Production PR3.1 SQL smoke — temporary fixtures only, full cleanup.
--
-- WARNING: runs against the live Postgres database (production on this host).
-- Use only under explicit operator control. Never point at client accounts.
--
-- Safety:
--   - Creates disposable auth.users with random @example.com emails.
--   - Creates only practices/playlists/items with pr3-prod-* slugs/titles.
--   - Does not modify existing product rows except temporary smoke practices.
--   - Deletes all created users/playlists/practices/entitlements before exit.
--   - Contains no secrets, tokens, cookies, or service_role keys.
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_pr3_production_sql_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_owner_id uuid;
  v_other_id uuid;
  v_author_id uuid;
  free_id uuid;
  paid_id uuid;
  unpublished_id uuid;
  unlisted_id uuid;
  private_a uuid;
  private_b uuid;
  public_pl uuid;
  foreign_pl uuid;
  filler_id uuid;
  result jsonb;
  raised boolean;
  cnt integer;
  pos integer;
  up_before integer;
  up_after integer;
  ua_before timestamptz;
  ub_before timestamptz;
  up_ts_before timestamptz;
  ua_after timestamptz;
  ub_after timestamptz;
  up_ts_after timestamptz;
  i integer;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'pr3.prod.smoke.owner.' || substr(md5(random()::text), 1, 8) || '@example.com',
    crypt('tmp-smoke-pass', gen_salt('bf')),
    now(), now(), now(), '', '', '', ''
  ) RETURNING id INTO v_owner_id;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'pr3.prod.smoke.other.' || substr(md5(random()::text), 1, 8) || '@example.com',
    crypt('tmp-smoke-pass', gen_salt('bf')),
    now(), now(), now(), '', '', '', ''
  ) RETURNING id INTO v_other_id;

  SELECT id INTO v_author_id FROM public.authors ORDER BY id LIMIT 1;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'production smoke needs an author';
  END IF;

  INSERT INTO public.practices (author_id, title, slug, status, is_free, price, is_catalog_listed)
  VALUES (v_author_id, 'PR3 prod free', 'pr3-prod-smoke-free-' || substr(v_owner_id::text, 1, 8), 'published', true, 0, true)
  RETURNING id INTO free_id;

  INSERT INTO public.practices (author_id, title, slug, status, is_free, price, is_catalog_listed)
  VALUES (v_author_id, 'PR3 prod paid', 'pr3-prod-smoke-paid-' || substr(v_owner_id::text, 1, 8), 'published', false, 990, true)
  RETURNING id INTO paid_id;

  INSERT INTO public.practices (author_id, title, slug, status, is_free, price, is_catalog_listed)
  VALUES (v_author_id, 'PR3 prod unpublished', 'pr3-prod-smoke-unpub-' || substr(v_owner_id::text, 1, 8), 'unpublished', true, 0, true)
  RETURNING id INTO unpublished_id;

  INSERT INTO public.practices (author_id, title, slug, status, is_free, price, is_catalog_listed)
  VALUES (v_author_id, 'PR3 prod unlisted', 'pr3-prod-smoke-unlist-' || substr(v_owner_id::text, 1, 8), 'published', true, 0, false)
  RETURNING id INTO unlisted_id;

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_owner_id, paid_id, 'purchase');

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR3 prod private A', 'private') RETURNING id INTO private_a;
  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR3 prod private B', 'private') RETURNING id INTO private_b;
  INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
  VALUES (v_owner_id, 'PR3 prod public', 'public', 'pr3-prod-pub-' || substr(v_owner_id::text, 1, 8), now())
  RETURNING id INTO public_pl;
  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_other_id, 'PR3 prod foreign', 'private') RETURNING id INTO foreign_pl;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- private with entitlement
  result := public.set_practice_playlist_membership(paid_id, ARRAY[private_a, private_b]);
  IF (result->>'added')::int <> 2 THEN RAISE EXCEPTION 'entitled multi-add failed %', result; END IF;

  SELECT position INTO pos FROM public.playlist_items WHERE playlist_id = private_a AND practice_id = paid_id;
  IF pos <> 1 THEN RAISE EXCEPTION 'position expected 1 got %', pos; END IF;

  -- idempotent
  result := public.set_practice_playlist_membership(paid_id, ARRAY[private_a, private_b]);
  IF COALESCE((result->>'changed')::boolean, true) THEN RAISE EXCEPTION 'idempotent failed %', result; END IF;

  -- free → public
  result := public.set_practice_playlist_membership(free_id, ARRAY[public_pl]);
  IF (result->>'added')::int <> 1 THEN RAISE EXCEPTION 'free public add failed %', result; END IF;

  -- paid → public reject
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(paid_id, ARRAY[public_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%public_content_invalid%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'paid→public should fail'; END IF;

  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(unpublished_id, ARRAY[public_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%public_content_invalid%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'unpublished→public should fail'; END IF;

  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(unlisted_id, ARRAY[public_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%public_content_invalid%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'unlisted→public should fail'; END IF;

  -- foreign reject atomic
  SELECT count(*) INTO cnt FROM public.playlist_items WHERE practice_id = paid_id;
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(paid_id, ARRAY[foreign_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%playlist_not_found%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'foreign should fail'; END IF;
  IF (SELECT count(*) FROM public.playlist_items WHERE practice_id = paid_id) <> cnt THEN
    RAISE EXCEPTION 'foreign failure mutated membership';
  END IF;

  -- unknown uuid
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(
      paid_id,
      ARRAY['99999999-9999-4999-8999-999999999999'::uuid]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%playlist_not_found%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'unknown uuid should fail'; END IF;

  -- atomicity: remove A, keep B intent broken by invalid public
  SELECT updated_at INTO ua_before FROM public.playlists WHERE id = private_a;
  SELECT updated_at INTO ub_before FROM public.playlists WHERE id = private_b;
  SELECT updated_at INTO up_ts_before FROM public.playlists WHERE id = public_pl;
  PERFORM pg_sleep(1.05);
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(paid_id, ARRAY[private_b, public_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%public_content_invalid%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'atomic mixed should fail'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.playlist_items WHERE playlist_id = private_a AND practice_id = paid_id
  ) THEN RAISE EXCEPTION 'atomic: private_a membership lost'; END IF;
  SELECT updated_at INTO ua_after FROM public.playlists WHERE id = private_a;
  SELECT updated_at INTO ub_after FROM public.playlists WHERE id = private_b;
  SELECT updated_at INTO up_ts_after FROM public.playlists WHERE id = public_pl;
  IF ua_after IS DISTINCT FROM ua_before
     OR ub_after IS DISTINCT FROM ub_before
     OR up_ts_after IS DISTINCT FROM up_ts_before THEN
    RAISE EXCEPTION 'atomic rollback changed updated_at';
  END IF;

  -- remove after public drift
  result := public.set_practice_playlist_membership(free_id, ARRAY[public_pl]);
  RESET ROLE;
  UPDATE public.practices
  SET is_free = false, price = 500, is_catalog_listed = false, status = 'unpublished'
  WHERE id = free_id;
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  result := public.set_practice_playlist_membership(free_id, ARRAY[]::uuid[]);
  IF (result->>'removed')::int < 1 THEN RAISE EXCEPTION 'remove after drift failed %', result; END IF;

  -- remove after losing entitlement
  SELECT count(*) INTO up_before FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = paid_id;
  RESET ROLE;
  DELETE FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = paid_id;
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  result := public.set_practice_playlist_membership(paid_id, ARRAY[]::uuid[]);
  IF (result->>'removed')::int < 1 THEN RAISE EXCEPTION 'remove without entitlement failed %', result; END IF;
  SELECT count(*) INTO up_after FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = paid_id;
  IF up_after <> 0 THEN RAISE EXCEPTION 'unexpected user_practices leftover'; END IF;

  -- restore entitlement, test limit 100
  RESET ROLE;
  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_owner_id, paid_id, 'purchase');
  DELETE FROM public.playlist_items WHERE playlist_id = private_a;
  FOR i IN 1..100 LOOP
    INSERT INTO public.practices (author_id, title, slug, status, is_free, price, is_catalog_listed)
    VALUES (
      v_author_id,
      'PR3 prod filler ' || i,
      'pr3-prod-fill-' || substr(v_owner_id::text, 1, 8) || '-' || i,
      'published', true, 0, true
    ) RETURNING id INTO filler_id;
    INSERT INTO public.playlist_items (playlist_id, practice_id, position)
    VALUES (private_a, filler_id, i);
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(paid_id, ARRAY[private_a]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%items_limit_reached%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'limit 100 should reject'; END IF;

  -- entitlement isolation: free add must not create user_practices
  SELECT count(*) INTO up_before FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = free_id;
  -- restore free practice eligibility
  RESET ROLE;
  UPDATE public.practices
  SET status = 'published', is_free = true, price = 0, is_catalog_listed = true
  WHERE id = free_id;
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.set_practice_playlist_membership(free_id, ARRAY[private_b]);
  SELECT count(*) INTO up_after FROM public.user_practices WHERE user_id = v_owner_id AND practice_id = free_id;
  IF up_after <> up_before THEN
    RAISE EXCEPTION 'membership must not create user_practices';
  END IF;

  -- cleanup
  RESET ROLE;
  DELETE FROM public.playlist_items WHERE playlist_id IN (private_a, private_b, public_pl, foreign_pl);
  DELETE FROM public.playlists WHERE id IN (private_a, private_b, public_pl, foreign_pl);
  DELETE FROM public.user_practices WHERE user_id = v_owner_id;
  DELETE FROM public.practices WHERE slug LIKE 'pr3-prod-%' || substr(v_owner_id::text, 1, 8) || '%';
  DELETE FROM public.practices WHERE id IN (free_id, paid_id, unpublished_id, unlisted_id);
  DELETE FROM public.practices WHERE slug LIKE 'pr3-prod-fill-' || substr(v_owner_id::text, 1, 8) || '-%';
  DELETE FROM auth.users WHERE id IN (v_owner_id, v_other_id);

  IF EXISTS (
    SELECT 1 FROM public.playlists WHERE title LIKE 'PR3 prod%'
  ) THEN RAISE EXCEPTION 'leftover playlists'; END IF;

  RAISE NOTICE 'PR3_PROD_SQL_SMOKE_PASS owner=%', v_owner_id;
END;
$$;
