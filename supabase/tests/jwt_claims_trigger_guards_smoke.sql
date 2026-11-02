-- Disposable smoke for 20270210180000_jwt_claims_trigger_guards.sql.
-- PostgREST 10+ sets only request.jwt.claims (JSON), never the legacy
-- request.jwt.claim.sub. Column guards must still treat that as a client
-- JWT session. Runs as the migration owner (RLS bypassed) on purpose: it
-- isolates the trigger decision. Rolls back.
\set ON_ERROR_STOP on
BEGIN;

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

ROLLBACK;
