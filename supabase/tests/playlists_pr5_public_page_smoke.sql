-- PR5 public playlist page query smoke — isolated test DB only.
-- Uses RLS + anon/authenticated reads (no new RPC required for PR5).
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d audiolad_playlists_pr5_test \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_pr5_public_page_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_owner_id uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_other_id uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_author_id uuid;
  public_pl uuid;
  private_pl uuid;
  unpublished_pl uuid;
  free_id uuid;
  paid_id uuid;
  unlisted_id uuid;
  archived_id uuid;
  cnt integer;
  pl_title text;
  vis text;
  pub_at timestamptz;
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
      'authenticated', 'authenticated', 'pr5.owner@example.com',
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
      'authenticated', 'authenticated', 'pr5.other@example.com',
      crypt('x', gen_salt('bf')), now(), now(), now(), '', '', '', ''
    );
  END IF;

  DELETE FROM public.playlist_items
  WHERE playlist_id IN (
    SELECT pl.id FROM public.playlists AS pl
    WHERE pl.user_id IN (v_owner_id, v_other_id) AND pl.title LIKE 'PR5%'
  );
  DELETE FROM public.playlists AS pl
  WHERE pl.user_id IN (v_owner_id, v_other_id) AND pl.title LIKE 'PR5%';
  DELETE FROM public.practices WHERE slug LIKE 'pr5-%';

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, cover_url
  ) VALUES
    (v_author_id, 'PR5 free', 'pr5-free', 'published', true, 0, true, 'https://example.com/pr5-free.jpg')
  RETURNING id INTO free_id;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES
    (v_author_id, 'PR5 paid', 'pr5-paid', 'published', false, 500, true)
  RETURNING id INTO paid_id;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES
    (v_author_id, 'PR5 unlisted', 'pr5-unlisted', 'published', true, 0, false)
  RETURNING id INTO unlisted_id;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed
  ) VALUES
    (v_author_id, 'PR5 archived', 'pr5-archived', 'archived', true, 0, true)
  RETURNING id INTO archived_id;

  INSERT INTO public.playlists (
    user_id, title, visibility, slug, published_at
  ) VALUES (
    v_owner_id, 'PR5 Public', 'public', 'pr5-public-demo', now()
  ) RETURNING id INTO public_pl;

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PR5 Private', 'private')
  RETURNING id INTO private_pl;

  -- public visibility but unpublished (published_at NULL) — should not be public page
  INSERT INTO public.playlists (
    user_id, title, visibility, slug, published_at
  ) VALUES (
    v_owner_id, 'PR5 Unpublished Public', 'public', 'pr5-unpublished', NULL
  ) RETURNING id INTO unpublished_pl;

  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (public_pl, free_id, 1),
    (public_pl, paid_id, 2),
    (public_pl, unlisted_id, 3),
    (public_pl, archived_id, 4),
    (private_pl, free_id, 1);

  -- anon can read public published playlist by slug
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT title, visibility, published_at
  INTO pl_title, vis, pub_at
  FROM public.playlists
  WHERE slug = 'pr5-public-demo'
    AND visibility = 'public'
    AND published_at IS NOT NULL;

  IF pl_title IS DISTINCT FROM 'PR5 Public' OR vis IS DISTINCT FROM 'public' OR pub_at IS NULL THEN
    RAISE EXCEPTION 'anon should read public published playlist';
  END IF;

  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = public_pl;
  IF cnt <> 4 THEN
    RAISE EXCEPTION 'anon should see 4 public playlist items, got %', cnt;
  END IF;

  -- private not visible to anon
  SELECT count(*) INTO cnt
  FROM public.playlists
  WHERE id = private_pl;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'anon must not see private playlist';
  END IF;

  -- unpublished public (published_at NULL) still visible via RLS visibility=public,
  -- but app gate requires published_at IS NOT NULL — document that here:
  SELECT count(*) INTO cnt
  FROM public.playlists
  WHERE slug = 'pr5-unpublished'
    AND visibility = 'public'
    AND published_at IS NOT NULL;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'unpublished public must fail published_at gate';
  END IF;

  -- wrong slug
  SELECT count(*) INTO cnt
  FROM public.playlists
  WHERE slug = 'does-not-exist-pr5'
    AND visibility = 'public';
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'wrong slug must be empty';
  END IF;

  -- paid published practice readable (status published) — app marks unavailable
  SELECT count(*) INTO cnt
  FROM public.practices
  WHERE id = paid_id AND status = 'published';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'paid published practice should be readable for metadata';
  END IF;

  -- archived not readable via published practice policy (RLS-hidden practice)
  SELECT count(*) INTO cnt
  FROM public.practices
  WHERE id = archived_id;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'archived practice must not be readable by anon';
  END IF;

  -- playlist_items row for RLS-hidden practice still exists for anon
  -- (app maps missing embed to unavailable placeholder; must not 500)
  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = public_pl AND practice_id = archived_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'RLS-hidden practice item row must remain visible via playlist_items';
  END IF;

  -- embed join: archived practice null for anon, free still embeds
  SELECT count(*) INTO cnt
  FROM public.playlist_items AS pi
  LEFT JOIN public.practices AS pr ON pr.id = pi.practice_id
  WHERE pi.playlist_id = public_pl
    AND pi.practice_id = archived_id
    AND pr.id IS NULL;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'archived practice embed must be null under anon RLS';
  END IF;

  -- items ordered by position
  IF (
    SELECT array_agg(practice_id ORDER BY position)
    FROM public.playlist_items
    WHERE playlist_id = public_pl
  ) IS DISTINCT FROM ARRAY[free_id, paid_id, unlisted_id, archived_id] THEN
    RAISE EXCEPTION 'item order by position broken';
  END IF;

  RESET ROLE;

  -- other authenticated cannot see private
  PERFORM set_config('request.jwt.claim.sub', v_other_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO cnt FROM public.playlists WHERE id = private_pl;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'other user must not see private';
  END IF;

  SELECT count(*) INTO cnt
  FROM public.playlists
  WHERE slug = 'pr5-public-demo' AND visibility = 'public';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'other user should see public playlist';
  END IF;

  RESET ROLE;

  -- cleanup
  DELETE FROM public.playlist_items WHERE playlist_id IN (public_pl, private_pl, unpublished_pl);
  DELETE FROM public.playlists WHERE id IN (public_pl, private_pl, unpublished_pl);
  DELETE FROM public.practices WHERE id IN (free_id, paid_id, unlisted_id, archived_id);

  RAISE NOTICE 'PR5_PUBLIC_PAGE_SMOKE_PASS';
END;
$$;
