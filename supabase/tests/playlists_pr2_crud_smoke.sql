-- PR2 CRUD smoke against audiolad_playlists_pr1_test (not production).
-- Simulates ownership + visibility transitions that API enforces.

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_id uuid := '11111111-1111-1111-1111-111111111111';
  other_id uuid := '22222222-2222-2222-2222-222222222222';
  private_id uuid;
  public_id uuid;
  cnt integer;
  slug_before text;
  updated_before timestamptz;
  updated_after timestamptz;
BEGIN
  DELETE FROM public.playlists
  WHERE user_id IN (owner_id, other_id)
    AND (title LIKE 'PR2 smoke%' OR slug LIKE 'pr2-smoke%');

  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (owner_id, 'PR2 smoke private', 'private')
  RETURNING id, updated_at INTO private_id, updated_before;

  UPDATE public.playlists
  SET
    title = 'PR2 smoke private renamed',
    updated_at = updated_before + interval '2 seconds'
  WHERE id = private_id
  RETURNING updated_at INTO updated_after;

  IF updated_after <= updated_before THEN
    RAISE EXCEPTION 'updated_at must advance on rename';
  END IF;

  INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
  VALUES (
    owner_id,
    'PR2 smoke public',
    'public',
    'pr2-smoke-public-a4f9',
    now()
  )
  RETURNING id, slug INTO public_id, slug_before;

  UPDATE public.playlists
  SET title = 'PR2 smoke public renamed', updated_at = now()
  WHERE id = public_id;

  IF (SELECT slug FROM public.playlists WHERE id = public_id) IS DISTINCT FROM slug_before THEN
    RAISE EXCEPTION 'public rename must keep slug';
  END IF;

  UPDATE public.playlists
  SET visibility = 'private', slug = NULL, published_at = NULL, updated_at = now()
  WHERE id = public_id;

  IF (SELECT visibility FROM public.playlists WHERE id = public_id) <> 'private' THEN
    RAISE EXCEPTION 'public→private failed';
  END IF;

  UPDATE public.playlists
  SET
    visibility = 'public',
    slug = 'pr2-smoke-repub-b1c2',
    published_at = now(),
    updated_at = now()
  WHERE id = public_id;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', other_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', other_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  UPDATE public.playlists SET title = 'hack' WHERE id = private_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'other user must not rename';
  END IF;

  DELETE FROM public.playlists WHERE id = private_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'other user must not delete';
  END IF;

  RESET ROLE;
  DELETE FROM public.playlists WHERE id IN (private_id, public_id);

  RAISE NOTICE 'playlists PR2 CRUD smoke: PASS';
END;
$$;
