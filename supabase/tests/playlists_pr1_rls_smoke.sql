-- Smoke tests for playlists PR1 (schema + RLS).
-- Run ONLY against an isolated test database, never production `postgres`.
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d audiolad_playlists_pr1_test \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_pr1_rls_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_id uuid := '11111111-1111-1111-1111-111111111111';
  other_id uuid := '22222222-2222-2222-2222-222222222222';
  practice_a uuid;
  practice_b uuid;
  practice_c uuid;
  private_id uuid;
  public_id uuid;
  public_null_pub_id uuid;
  transition_id uuid;
  cnt integer;
  raised boolean;
BEGIN
  SELECT id INTO practice_a FROM public.practices ORDER BY id LIMIT 1;
  SELECT id INTO practice_b FROM public.practices ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO practice_c FROM public.practices ORDER BY id OFFSET 2 LIMIT 1;

  IF practice_a IS NULL OR practice_b IS NULL OR practice_c IS NULL THEN
    RAISE EXCEPTION 'test requires at least three practices';
  END IF;

  DELETE FROM public.playlists
  WHERE user_id IN (owner_id, other_id)
    AND (
      title LIKE 'PR1 smoke%'
      OR slug LIKE 'pr1-smoke%'
    );

  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- (5) private + slug NULL + published_at NULL
  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (owner_id, 'PR1 smoke private', 'private')
  RETURNING id INTO private_id;

  -- (7) public + non-blank slug + published_at set
  INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
  VALUES (owner_id, 'PR1 smoke public', 'public', 'pr1-smoke-public', now())
  RETURNING id INTO public_id;

  -- (6) public + non-blank slug + published_at NULL
  INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
  VALUES (owner_id, 'PR1 smoke public null published', 'public', 'pr1-smoke-public-null-pub', NULL)
  RETURNING id INTO public_null_pub_id;

  INSERT INTO public.playlist_items (playlist_id, practice_id, position)
  VALUES
    (private_id, practice_a, 1),
    (public_id, practice_a, 1),
    (public_id, practice_b, 2);

  SELECT count(*) INTO cnt
  FROM public.playlists
  WHERE id IN (private_id, public_id, public_null_pub_id);
  IF cnt <> 3 THEN
    RAISE EXCEPTION 'owner should see private+public rows, got %', cnt;
  END IF;

  UPDATE public.playlists
  SET title = 'PR1 smoke private renamed', updated_at = now()
  WHERE id = private_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner update failed';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.playlists (user_id, title, visibility)
    VALUES (other_id, 'PR1 smoke stolen', 'private');
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
    WHEN others THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'foreign user_id insert should be blocked by RLS';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', other_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', other_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO cnt FROM public.playlists WHERE id = private_id;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'other user must not see private playlist';
  END IF;

  SELECT count(*) INTO cnt FROM public.playlists WHERE id = public_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'other user must see public playlist';
  END IF;

  SELECT count(*) INTO cnt FROM public.playlists WHERE id = public_null_pub_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'other user must see public playlist with null published_at';
  END IF;

  SELECT count(*) INTO cnt FROM public.playlist_items WHERE playlist_id = public_id;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'other user must see public playlist items';
  END IF;

  SELECT count(*) INTO cnt FROM public.playlist_items WHERE playlist_id = private_id;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'other user must not see private playlist items';
  END IF;

  UPDATE public.playlists SET title = 'hacked' WHERE id = public_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'other user must not update public playlist';
  END IF;

  DELETE FROM public.playlists WHERE id = public_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'other user must not delete public playlist';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.playlist_items (playlist_id, practice_id, position)
    VALUES (public_id, practice_c, 3);
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
    WHEN others THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'other user must not insert into foreign playlist';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT count(*) INTO cnt FROM public.playlists WHERE id = private_id;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'anon must not see private playlist';
  END IF;

  SELECT count(*) INTO cnt FROM public.playlists WHERE id = public_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'anon must see public playlist';
  END IF;

  SELECT count(*) INTO cnt FROM public.playlist_items WHERE playlist_id = public_id;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'anon must see public playlist items';
  END IF;

  RESET ROLE;

  -- Title / visibility CHECK
  raised := false;
  BEGIN
    INSERT INTO public.playlists (user_id, title, visibility)
    VALUES (owner_id, '   ', 'private');
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'blank title should fail';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.playlists (user_id, title, visibility)
    VALUES (owner_id, repeat('x', 81), 'private');
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'long title should fail';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.playlists (user_id, title, visibility, slug)
    VALUES (owner_id, 'PR1 smoke bad vis', 'shared', 'x');
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'bad visibility should fail';
  END IF;

  -- (1) private + non-empty slug
  raised := false;
  BEGIN
    INSERT INTO public.playlists (user_id, title, visibility, slug)
    VALUES (owner_id, 'PR1 smoke private with slug', 'private', 'pr1-smoke-private-slug');
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'private with non-empty slug should fail';
  END IF;

  -- (2) public + slug NULL
  raised := false;
  BEGIN
    INSERT INTO public.playlists (user_id, title, visibility)
    VALUES (owner_id, 'PR1 smoke public no slug', 'public');
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'public without slug should fail';
  END IF;

  -- (3) public + blank / whitespace slug
  raised := false;
  BEGIN
    INSERT INTO public.playlists (user_id, title, visibility, slug)
    VALUES (owner_id, 'PR1 smoke public blank slug', 'public', '   ');
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'public with blank slug should fail';
  END IF;

  -- (4) private + published_at set
  raised := false;
  BEGIN
    INSERT INTO public.playlists (user_id, title, visibility, published_at)
    VALUES (owner_id, 'PR1 smoke private published_at', 'private', now());
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'private with published_at should fail';
  END IF;

  -- (8) public slug uniqueness
  raised := false;
  BEGIN
    INSERT INTO public.playlists (user_id, title, visibility, slug)
    VALUES (owner_id, 'PR1 smoke duplicate slug', 'public', 'pr1-smoke-public');
  EXCEPTION
    WHEN unique_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'duplicate public slug should fail';
  END IF;

  -- (9) public → private without clearing slug / published_at
  INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
  VALUES (owner_id, 'PR1 smoke transition', 'public', 'pr1-smoke-transition', now())
  RETURNING id INTO transition_id;

  raised := false;
  BEGIN
    UPDATE public.playlists
    SET visibility = 'private'
    WHERE id = transition_id;
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'public→private without clearing slug/published_at should fail';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.playlists
    SET visibility = 'private', slug = NULL
    WHERE id = transition_id;
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'public→private clearing only slug should fail while published_at set';
  END IF;

  -- (10) atomic public → private clearing slug + published_at
  UPDATE public.playlists
  SET
    visibility = 'private',
    slug = NULL,
    published_at = NULL,
    updated_at = now()
  WHERE id = transition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'atomic public→private clear should succeed';
  END IF;

  SELECT count(*) INTO cnt
  FROM public.playlists
  WHERE id = transition_id
    AND visibility = 'private'
    AND slug IS NULL
    AND published_at IS NULL;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'transition row should be private with cleared slug/published_at';
  END IF;

  DELETE FROM public.playlists WHERE id = transition_id;

  -- Item UNIQUE / position CHECK
  raised := false;
  BEGIN
    INSERT INTO public.playlist_items (playlist_id, practice_id, position)
    VALUES (public_id, practice_a, 3);
  EXCEPTION
    WHEN unique_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'duplicate practice should fail';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.playlist_items (playlist_id, practice_id, position)
    VALUES (public_id, practice_c, 1);
  EXCEPTION
    WHEN unique_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'duplicate position should fail';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.playlist_items (playlist_id, practice_id, position)
    VALUES (public_id, practice_c, 0);
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'position < 1 should fail';
  END IF;

  INSERT INTO public.playlist_items (playlist_id, practice_id, position)
  VALUES (private_id, practice_b, 2);

  DELETE FROM public.playlists WHERE id = private_id;
  SELECT count(*) INTO cnt FROM public.playlist_items WHERE playlist_id = private_id;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'playlist delete must cascade items';
  END IF;

  DELETE FROM public.playlists WHERE id IN (public_id, public_null_pub_id);

  RAISE NOTICE 'playlists PR1 RLS smoke: PASS';
END;
$$;
