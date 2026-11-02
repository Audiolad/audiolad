-- Unresolved audit finding, NOT applied here (pricing/payments are out of scope):
-- public.resolve_practice_effective_price accepts an arbitrary p_user_id and
-- delegates to an internal binder. A separately approved change must validate
-- the subject and trusted service role at the public RPC boundary, including
-- transitive access through public.resolve_studio_music_acquisition.
-- Proposed interim guard in BOTH public entry points, before any side effects:
-- IF public.is_business_anonymous_user() THEN
--   RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
-- END IF;
-- This comment is a proposal, not a protection. Keep guest Auth disabled.
BEGIN;

-- Stage 1 proposal only. Never apply without the migration Human Gate.
CREATE TABLE IF NOT EXISTS public.business_guest_auth_tickets (
  nonce_hash text PRIMARY KEY CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '3 minutes')
);
ALTER TABLE public.business_guest_auth_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_guest_auth_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.business_guest_auth_tickets TO service_role;

CREATE OR REPLACE FUNCTION public.consume_business_guest_auth_ticket(p_nonce_hash text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH consumed AS (
    DELETE FROM public.business_guest_auth_tickets
    WHERE nonce_hash = p_nonce_hash AND expires_at > statement_timestamp()
    RETURNING nonce_hash
  ) SELECT EXISTS (SELECT 1 FROM consumed);
$$;
REVOKE ALL ON FUNCTION public.consume_business_guest_auth_ticket(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_business_guest_auth_ticket(text) TO service_role;

-- Consult the Auth-owned record, not mutable metadata. to_jsonb also permits
-- compiling against the repository's minimal historical Auth fixture.
CREATE OR REPLACE FUNCTION public.is_business_anonymous_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT (to_jsonb(u)->>'is_anonymous')::boolean
    FROM auth.users u WHERE u.id = auth.uid()), false);
$$;
REVOKE ALL ON FUNCTION public.is_business_anonymous_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_anonymous_user() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  grant_function_comment text;
  expected_grant_contract constant text :=
    'audiolad:starter-grant:v1; grants active published free zero-price starter practices; idempotent; returns inserted row count';
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_meta jsonb;
BEGIN
  -- Auth owns this column. Client user_metadata is never used as a role flag.
  IF COALESCE((to_jsonb(NEW)->>'is_anonymous')::boolean, false) THEN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (NEW.id, NULL, NULL, 'listener')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  SELECT obj_description(
    'public.grant_active_starter_practices(uuid)'::regprocedure,
    'pg_proc'
  )
  INTO grant_function_comment;

  IF grant_function_comment IS DISTINCT FROM expected_grant_contract THEN
    RAISE EXCEPTION 'Required starter grant function contract version v1 is not installed';
  END IF;

  v_meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  v_first_name := NULLIF(btrim(v_meta->>'first_name'), '');
  v_last_name := NULLIF(btrim(v_meta->>'last_name'), '');
  v_full_name := NULLIF(btrim(v_meta->>'full_name'), '');

  IF v_full_name IS NULL AND (v_first_name IS NOT NULL OR v_last_name IS NOT NULL) THEN
    v_full_name := btrim(concat_ws(' ', v_first_name, v_last_name));
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    'listener'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  PERFORM public.grant_active_starter_practices(NEW.id);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

COMMENT ON FUNCTION public.handle_new_user() IS
  'audiolad:new-user:v1; creates listener profile with full_name, grants starter library using audiolad:starter-grant:v1';

CREATE OR REPLACE FUNCTION public.create_business_organization_with_location(
  p_organization_name text,
  p_location_name text,
  p_business_category text,
  p_country_code text,
  p_timezone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_name text := btrim(coalesce(p_organization_name, ''));
  v_loc_name text := btrim(coalesce(p_location_name, ''));
  v_category text := btrim(coalesce(p_business_category, ''));
  v_country text := upper(btrim(coalesce(p_country_code, '')));
  v_timezone text := btrim(coalesce(p_timezone, ''));
  v_organization_id uuid;
  v_location_id uuid;
  v_zone_id uuid;
  v_rights_context_id uuid;
BEGIN
  -- The future server guest-start transaction needs its own narrow bootstrap.
  -- Anonymous JWTs must not bypass its quotas via this existing public RPC.
  IF public.is_business_anonymous_user() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_org_name) < 1 OR char_length(v_org_name) > 120 THEN
    RAISE EXCEPTION 'invalid_organization_name' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_loc_name) < 1 OR char_length(v_loc_name) > 120 THEN
    RAISE EXCEPTION 'invalid_location_name' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_category) < 1 OR char_length(v_category) > 120 THEN
    RAISE EXCEPTION 'invalid_business_category' USING ERRCODE = '22023';
  END IF;

  IF v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid_country_code' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_timezone) < 1 OR char_length(v_timezone) > 64 THEN
    RAISE EXCEPTION 'invalid_timezone' USING ERRCODE = '22023';
  END IF;

  -- STABLE lookup against live timezone catalog (not an IMMUTABLE wrapper).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names AS tz
    WHERE tz.name = v_timezone
  ) THEN
    RAISE EXCEPTION 'invalid_timezone' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.business_organizations (name, status, created_by)
  VALUES (v_org_name, 'active', v_user_id)
  RETURNING id INTO v_organization_id;

  INSERT INTO public.business_organization_members (
    organization_id, user_id, role
  ) VALUES (
    v_organization_id, v_user_id, 'owner'
  );

  INSERT INTO public.business_locations (
    organization_id,
    name,
    business_category,
    country_code,
    timezone,
    status
  ) VALUES (
    v_organization_id,
    v_loc_name,
    v_category,
    v_country,
    v_timezone,
    'active'
  )
  RETURNING id INTO v_location_id;

  INSERT INTO public.business_zones (
    location_id, name, is_default, status
  ) VALUES (
    v_location_id, NULL, true, 'active'
  )
  RETURNING id INTO v_zone_id;

  -- Location Rights Context v1 – same transaction, idempotent, fail-soft:
  -- NULL when the country has no active profile with a supported background
  -- rule (the venue then stays fail-closed: LOCATION_RIGHTS_CONTEXT_MISSING).
  v_rights_context_id := public.business_ensure_location_rights_context(v_location_id);

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', v_organization_id,
    'location_id', v_location_id,
    'zone_id', v_zone_id,
    'rights_context_id', v_rights_context_id
  );
END;
$$;

COMMIT;
