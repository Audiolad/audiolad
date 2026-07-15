-- PR3.1 membership RPC smoke — isolated test DB only (never production `postgres`).
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d audiolad_playlists_pr3_test \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_pr3_membership_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_owner_id uuid := '11111111-1111-1111-1111-111111111111';
  v_other_id uuid := '22222222-2222-2222-2222-222222222222';
  v_author_id uuid;
  free_practice uuid;
  paid_practice uuid;
  unpublished_practice uuid;
  unlisted_practice uuid;
  author_practice uuid;
  filler_id uuid;
  private_a uuid;
  private_b uuid;
  public_pl uuid;
  foreign_pl uuid;
  result jsonb;
  cnt integer;
  pos integer;
  raised boolean;
  up_before integer;
  up_after integer;
  i integer;
BEGIN
  IF to_regprocedure('public.set_practice_playlist_membership(uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'RPC set_practice_playlist_membership missing — apply PR3.1 migration first';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_owner_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'pr3.owner@example.com',
      crypt('test-password', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_other_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_other_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'pr3.other@example.com',
      crypt('test-password', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  SELECT id INTO v_author_id FROM public.authors ORDER BY id LIMIT 1;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'test requires at least one author';
  END IF;

  DELETE FROM public.playlist_items
  WHERE playlist_id IN (
    SELECT id FROM public.playlists
    WHERE user_id IN (v_owner_id, v_other_id)
      AND (title LIKE 'PR3 smoke%' OR slug LIKE 'pr3-smoke%')
  );

  DELETE FROM public.playlists
  WHERE user_id IN (v_owner_id, v_other_id)
    AND (title LIKE 'PR3 smoke%' OR slug LIKE 'pr3-smoke%');

  DELETE FROM public.user_practices
  WHERE user_id = v_owner_id
    AND practice_id IN (SELECT id FROM public.practices WHERE slug LIKE 'pr3-smoke-%');

  DELETE FROM public.practices WHERE slug LIKE 'pr3-smoke-%';

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES (
    v_author_id, 'PR3 free', 'pr3-smoke-free', 'published', true, 0, true
  ) RETURNING id INTO free_practice;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES (
    v_author_id, 'PR3 paid', 'pr3-smoke-paid', 'published', false, 990, true
  ) RETURNING id INTO paid_practice;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES (
    v_author_id, 'PR3 unpublished', 'pr3-smoke-unpublished', 'unpublished', true, 0, true
  ) RETURNING id INTO unpublished_practice;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES (
    v_author_id, 'PR3 unlisted', 'pr3-smoke-unlisted', 'published', true, 0, false
  ) RETURNING id INTO unlisted_practice;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES (
    v_author_id, 'PR3 author practice', 'pr3-smoke-author-practice', 'published', false, 500, true
  ) RETURNING id INTO author_practice;

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_owner_id, paid_practice, 'purchase')
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, v_owner_id, 'owner')
  ON CONFLICT (author_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR3 smoke private A', 'private')
  RETURNING id INTO private_a;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR3 smoke private B', 'private')
  RETURNING id INTO private_b;

  INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
  VALUES (v_owner_id, 'PR3 smoke public', 'public', 'pr3-smoke-public', now())
  RETURNING id INTO public_pl;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_other_id, 'PR3 smoke foreign', 'private')
  RETURNING id INTO foreign_pl;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- entitled add to private
  result := public.set_practice_playlist_membership(paid_practice, ARRAY[private_a]);
  IF (result->>'added')::int <> 1 THEN
    RAISE EXCEPTION 'entitled private add failed: %', result;
  END IF;

  SELECT position INTO pos
  FROM public.playlist_items
  WHERE playlist_id = private_a AND practice_id = paid_practice;
  IF pos <> 1 THEN
    RAISE EXCEPTION 'first position expected 1, got %', pos;
  END IF;

  -- idempotent
  result := public.set_practice_playlist_membership(paid_practice, ARRAY[private_a]);
  IF (result->>'added')::int <> 0 OR COALESCE((result->>'changed')::boolean, true) THEN
    RAISE EXCEPTION 'idempotent failed: %', result;
  END IF;

  -- multi-add free across private+public
  result := public.set_practice_playlist_membership(
    free_practice,
    ARRAY[private_a, private_b, public_pl]
  );
  IF (result->>'added')::int <> 3 THEN
    RAISE EXCEPTION 'multi-add expected 3: %', result;
  END IF;

  SELECT position INTO pos
  FROM public.playlist_items
  WHERE playlist_id = private_a AND practice_id = free_practice;
  IF pos <> 2 THEN
    RAISE EXCEPTION 'append position expected 2, got %', pos;
  END IF;

  -- paid → public rejected
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(paid_practice, ARRAY[public_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%public_content_invalid%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'paid→public should fail'; END IF;

  -- unpublished / unlisted → public rejected
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(unpublished_practice, ARRAY[public_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%public_content_invalid%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'unpublished→public should fail'; END IF;

  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(unlisted_practice, ARRAY[public_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%public_content_invalid%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'unlisted→public should fail'; END IF;

  -- author can add own practice to private
  result := public.set_practice_playlist_membership(author_practice, ARRAY[private_b]);
  IF (result->>'added')::int <> 1 THEN
    RAISE EXCEPTION 'author private add failed: %', result;
  END IF;

  -- foreign playlist rejected (atomic)
  SELECT count(*) INTO cnt FROM public.playlist_items WHERE practice_id = free_practice;
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(free_practice, ARRAY[foreign_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%playlist_not_found%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'foreign playlist should fail'; END IF;
  IF (SELECT count(*) FROM public.playlist_items WHERE practice_id = free_practice) <> cnt THEN
    RAISE EXCEPTION 'foreign failure mutated membership';
  END IF;

  -- owned + foreign rejected atomically
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(
      free_practice, ARRAY[private_a, foreign_pl]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%playlist_not_found%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'mixed foreign should fail'; END IF;

  -- duplicate ids
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(
      free_practice, ARRAY[private_a, private_a]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%duplicate_playlist_ids%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'duplicate ids should fail'; END IF;

  -- empty array removes from all owner playlists; entitlement untouched
  SELECT count(*) INTO up_before
  FROM public.user_practices
  WHERE user_id = v_owner_id AND practice_id = paid_practice;

  result := public.set_practice_playlist_membership(paid_practice, ARRAY[]::uuid[]);
  IF (result->>'removed')::int < 1 THEN
    RAISE EXCEPTION 'empty array should remove: %', result;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.playlist_items pi
    JOIN public.playlists pl ON pl.id = pi.playlist_id
    WHERE pl.user_id = v_owner_id AND pi.practice_id = paid_practice
  ) THEN
    RAISE EXCEPTION 'paid still in owner playlists after clear';
  END IF;

  SELECT count(*) INTO up_after
  FROM public.user_practices
  WHERE user_id = v_owner_id AND practice_id = paid_practice;
  IF up_after <> up_before THEN
    RAISE EXCEPTION 'playlist membership must not change user_practices';
  END IF;

  -- no entitlement → private reject (mutate fixtures as postgres)
  RESET ROLE;
  DELETE FROM public.user_practices
  WHERE user_id = v_owner_id AND practice_id = paid_practice;
  DELETE FROM public.author_members AS am
  WHERE am.user_id = v_owner_id AND am.author_id = v_author_id;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(paid_practice, ARRAY[private_b]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%entitlement_required%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'no entitlement private add should fail'; END IF;

  -- restore entitlement for limit test
  RESET ROLE;
  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_owner_id, paid_practice, 'purchase');

  DELETE FROM public.playlist_items WHERE playlist_id = private_a;

  FOR i IN 1..100 LOOP
    INSERT INTO public.practices (
      author_id, title, slug, status, is_free, price, is_catalog_listed
    ) VALUES (
      v_author_id,
      'PR3 filler ' || i,
      'pr3-smoke-filler-' || i,
      'published',
      true,
      0,
      true
    )
    RETURNING id INTO filler_id;

    INSERT INTO public.playlist_items (playlist_id, practice_id, position)
    VALUES (private_a, filler_id, i);
  END LOOP;

  SELECT count(*) INTO cnt FROM public.playlist_items WHERE playlist_id = private_a;
  IF cnt <> 100 THEN
    RAISE EXCEPTION 'expected 100 fillers, got %', cnt;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(paid_practice, ARRAY[private_a]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%items_limit_reached%' THEN raised := true; ELSE RAISE; END IF;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'limit 100 should reject'; END IF;

  -- anon cannot execute
  RESET ROLE;
  EXECUTE 'SET LOCAL ROLE anon';
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(free_practice, ARRAY[private_b]);
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%denied%' THEN
        raised := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'anon must not execute RPC';
  END IF;

  RAISE NOTICE 'PR3_MEMBERSHIP_SMOKE_PASS';
END;
$$;

-- ---------------------------------------------------------------------------
-- Review scenarios: public remove after product drift, updated_at, atomicity
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_owner_id uuid := '11111111-1111-1111-1111-111111111111';
  v_author_id uuid;
  free_practice uuid;
  paid_practice uuid;
  private_old uuid;
  private_new uuid;
  public_pl uuid;
  result jsonb;
  raised boolean;
  cnt integer;
  ua_before timestamptz;
  ub_before timestamptz;
  up_before timestamptz;
  ua_after timestamptz;
  ub_after timestamptz;
  up_after timestamptz;
  ua_idemp timestamptz;
BEGIN
  SELECT id INTO v_author_id FROM public.authors ORDER BY id LIMIT 1;

  SELECT id INTO free_practice FROM public.practices WHERE slug = 'pr3-smoke-free';
  SELECT id INTO paid_practice FROM public.practices WHERE slug = 'pr3-smoke-paid';

  IF free_practice IS NULL OR paid_practice IS NULL THEN
    RAISE EXCEPTION 'review smoke requires fixtures from main PR3 smoke';
  END IF;

  RESET ROLE;

  -- Restore free practice to public-eligible state
  UPDATE public.practices
  SET status = 'published', is_free = true, price = 0, is_catalog_listed = true
  WHERE id = free_practice;

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_owner_id, paid_practice, 'purchase')
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  DELETE FROM public.playlist_items
  WHERE playlist_id IN (
    SELECT id FROM public.playlists
    WHERE user_id = v_owner_id AND title LIKE 'PR3 smoke%'
  );

  DELETE FROM public.playlists
  WHERE user_id = v_owner_id
    AND title IN (
      'PR3 smoke private A',
      'PR3 smoke private B',
      'PR3 smoke public',
      'PR3 review private old',
      'PR3 review private new',
      'PR3 review public'
    );

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR3 review private old', 'private')
  RETURNING id INTO private_old;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR3 review private new', 'private')
  RETURNING id INTO private_new;

  INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
  VALUES (v_owner_id, 'PR3 review public', 'public', 'pr3-review-public', now())
  RETURNING id INTO public_pl;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 2.1 add free → public, then make product ineligible, then remove
  result := public.set_practice_playlist_membership(free_practice, ARRAY[public_pl]);
  IF (result->>'added')::int <> 1 THEN
    RAISE EXCEPTION '2.1 initial public add failed: %', result;
  END IF;

  RESET ROLE;
  UPDATE public.practices
  SET is_free = false, price = 1990, is_catalog_listed = false, status = 'unpublished'
  WHERE id = free_practice;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  result := public.set_practice_playlist_membership(free_practice, ARRAY[]::uuid[]);
  IF (result->>'removed')::int <> 1 THEN
    RAISE EXCEPTION '2.1 remove after public drift failed: %', result;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = public_pl AND practice_id = free_practice;
  IF cnt <> 0 THEN
    RAISE EXCEPTION '2.1 item should be removed from public after drift';
  END IF;

  -- restore free practice
  RESET ROLE;
  UPDATE public.practices
  SET status = 'published', is_free = true, price = 0, is_catalog_listed = true
  WHERE id = free_practice;

  -- 2.2 updated_at behaviour
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  result := public.set_practice_playlist_membership(paid_practice, ARRAY[private_old]);
  IF (result->>'added')::int <> 1 THEN
    RAISE EXCEPTION '2.2 seed add failed: %', result;
  END IF;

  SELECT updated_at INTO ua_before FROM public.playlists WHERE id = private_old;
  SELECT updated_at INTO ub_before FROM public.playlists WHERE id = private_new;
  SELECT updated_at INTO up_before FROM public.playlists WHERE id = public_pl;

  PERFORM pg_sleep(1.1);

  -- identical membership: no updated_at change
  result := public.set_practice_playlist_membership(paid_practice, ARRAY[private_old]);
  IF COALESCE((result->>'changed')::boolean, true) THEN
    RAISE EXCEPTION '2.2 idempotent should not change: %', result;
  END IF;

  SELECT updated_at INTO ua_idemp FROM public.playlists WHERE id = private_old;
  IF ua_idemp IS DISTINCT FROM ua_before THEN
    RAISE EXCEPTION '2.2 idempotent must not bump updated_at';
  END IF;

  SELECT updated_at INTO ub_after FROM public.playlists WHERE id = private_new;
  SELECT updated_at INTO up_after FROM public.playlists WHERE id = public_pl;
  IF ub_after IS DISTINCT FROM ub_before OR up_after IS DISTINCT FROM up_before THEN
    RAISE EXCEPTION '2.2 untouched playlists must keep updated_at';
  END IF;

  PERFORM pg_sleep(1.1);

  -- move paid: remove old, add new → only those two bump
  result := public.set_practice_playlist_membership(paid_practice, ARRAY[private_new]);
  IF (result->>'added')::int <> 1 OR (result->>'removed')::int <> 1 THEN
    RAISE EXCEPTION '2.2 move failed: %', result;
  END IF;

  SELECT updated_at INTO ua_after FROM public.playlists WHERE id = private_old;
  SELECT updated_at INTO ub_after FROM public.playlists WHERE id = private_new;
  SELECT updated_at INTO up_after FROM public.playlists WHERE id = public_pl;

  IF ua_after <= ua_before THEN
    RAISE EXCEPTION '2.2 removed playlist updated_at must advance';
  END IF;
  IF ub_after <= ub_before THEN
    RAISE EXCEPTION '2.2 added playlist updated_at must advance';
  END IF;
  IF up_after IS DISTINCT FROM up_before THEN
    RAISE EXCEPTION '2.2 unrelated public updated_at must stay';
  END IF;

  -- 2.3 atomicity: drop old private, add new private, add invalid public → full rollback
  RESET ROLE;
  -- ensure paid is only in private_new
  DELETE FROM public.playlist_items
  WHERE practice_id = paid_practice AND playlist_id = private_old;

  SELECT updated_at INTO ua_before FROM public.playlists WHERE id = private_old;
  SELECT updated_at INTO ub_before FROM public.playlists WHERE id = private_new;
  SELECT updated_at INTO up_before FROM public.playlists WHERE id = public_pl;

  PERFORM pg_sleep(1.1);

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  raised := false;
  BEGIN
    -- omit private_new (would remove), include private_old (add ok), include public (paid → fail)
    PERFORM public.set_practice_playlist_membership(
      paid_practice,
      ARRAY[private_old, public_pl]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%public_content_invalid%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION '2.3 mixed invalid public should fail';
  END IF;

  -- old membership on private_new must remain
  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = private_new AND practice_id = paid_practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION '2.3 old membership must remain after rollback';
  END IF;

  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = private_old AND practice_id = paid_practice;
  IF cnt <> 0 THEN
    RAISE EXCEPTION '2.3 new private must not appear after rollback';
  END IF;

  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = public_pl AND practice_id = paid_practice;
  IF cnt <> 0 THEN
    RAISE EXCEPTION '2.3 public must not gain paid item';
  END IF;

  SELECT updated_at INTO ua_after FROM public.playlists WHERE id = private_old;
  SELECT updated_at INTO ub_after FROM public.playlists WHERE id = private_new;
  SELECT updated_at INTO up_after FROM public.playlists WHERE id = public_pl;

  IF ua_after IS DISTINCT FROM ua_before
     OR ub_after IS DISTINCT FROM ub_before
     OR up_after IS DISTINCT FROM up_before THEN
    RAISE EXCEPTION '2.3 rollback must not change any updated_at';
  END IF;

  -- cleanup review rows
  RESET ROLE;
  DELETE FROM public.playlist_items
  WHERE playlist_id IN (private_old, private_new, public_pl);
  DELETE FROM public.playlists
  WHERE id IN (private_old, private_new, public_pl);

  UPDATE public.practices
  SET status = 'published', is_free = true, price = 0, is_catalog_listed = true
  WHERE id = free_practice;

  RAISE NOTICE 'PR3_MEMBERSHIP_REVIEW_SMOKE_PASS';
END;
$$;
