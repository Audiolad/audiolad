-- Disposable smoke for 20270210180000_jwt_claims_trigger_guards.sql.
-- PostgREST 10+ sets only request.jwt.claims (JSON), never the legacy
-- request.jwt.claim.sub. Column guards must still treat that as a client
-- JWT session. Runs as the migration owner (RLS bypassed) on purpose: it
-- isolates the trigger decision. Rolls back.
\set ON_ERROR_STOP on
BEGIN;

-- Compile stub auth.users lacks GoTrue columns that profile triggers read.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_role text;
  v_premium boolean;
  v_unlimited boolean;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (v_user, 'jwt-guard-' || replace(v_user::text, '-', '') || '@example.invalid');
  INSERT INTO public.profiles (id) VALUES (v_user) ON CONFLICT (id) DO NOTHING;
  UPDATE public.profiles
     SET role = 'listener', author_premium_enabled = false, author_projects_unlimited = false
   WHERE id = v_user;

  IF public.request_jwt_sub_text() IS NOT NULL THEN
    RAISE EXCEPTION 'jwt guard smoke: expected no JWT sub outside a request';
  END IF;

  -- Modern PostgREST shape: only request.jwt.claims.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'is_anonymous', true)::text,
    true
  );
  IF public.request_jwt_sub_text() IS DISTINCT FROM v_user::text THEN
    RAISE EXCEPTION 'jwt guard smoke: request_jwt_sub_text must read request.jwt.claims';
  END IF;

  UPDATE public.profiles
     SET role = 'admin', author_premium_enabled = true, author_projects_unlimited = true
   WHERE id = v_user;
  SELECT role, author_premium_enabled, author_projects_unlimited
    INTO v_role, v_premium, v_unlimited
    FROM public.profiles WHERE id = v_user;
  IF v_role IS DISTINCT FROM 'listener' OR v_premium OR v_unlimited THEN
    RAISE EXCEPTION 'jwt guard smoke: JSON-claims session changed protected columns (role=%, premium=%, unlimited=%)',
      v_role, v_premium, v_unlimited;
  END IF;

  -- Legacy shape still guarded.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  UPDATE public.profiles SET role = 'admin' WHERE id = v_user;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user;
  IF v_role IS DISTINCT FROM 'listener' THEN
    RAISE EXCEPTION 'jwt guard smoke: legacy-claim session changed role';
  END IF;

  -- Trusted server SQL (no JWT at all) keeps the ability to assign.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.profiles SET role = 'admin' WHERE id = v_user;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'jwt guard smoke: trusted SQL lost the ability to assign role';
  END IF;
END;
$$;

-- Every re-created guard (profiles and playlists) must read the sub only via
-- request_jwt_sub_text(); a revert to the legacy GUC is caught here without
-- playlist fixtures.
DO $$
DECLARE
  v_fn text;
  v_src text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'protect_profiles_role_column',
    'protect_profiles_author_project_limit_columns',
    'protect_playlist_ownership_columns',
    'protect_playlist_direction_id'
  ] LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn AND p.pronargs = 0;
    IF v_src IS NULL THEN
      RAISE EXCEPTION 'jwt guard smoke: % is missing', v_fn;
    END IF;
    IF position('request_jwt_sub_text()' in v_src) = 0
      OR position('request.jwt.claim.sub' in v_src) > 0 THEN
      RAISE EXCEPTION 'jwt guard smoke: % does not use request_jwt_sub_text()', v_fn;
    END IF;
  END LOOP;
END;
$$;

-- Malformed claims JSON without a legacy sub fails closed (error, no write).
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{not json', true);
  BEGIN
    PERFORM public.request_jwt_sub_text();
    RAISE EXCEPTION 'jwt guard smoke: malformed claims accepted';
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

ROLLBACK;
