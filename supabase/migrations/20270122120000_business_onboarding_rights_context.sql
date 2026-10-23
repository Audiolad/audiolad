-- Business onboarding: active Location Rights Context v1 for every new venue.
--
-- Before: create_business_organization_with_location created org + location +
-- default zone, but no business_location_rights_contexts row. Without an active
-- context resolve_business_track_eligibility returns UNKNOWN
-- (LOCATION_RIGHTS_CONTEXT_MISSING) for every track, so a new venue never sees
-- rights-confirmed music until an operator inserts the context by hand.
--
-- After:
--   * business_ensure_location_rights_context(location_id) – SECURITY DEFINER,
--     service_role/postgres only. Idempotent: returns the existing active
--     context; never supersedes or edits history; creates draft v1 and
--     activates it only when the location has no context history at all and
--     its country has an active Country Rights Profile whose
--     business_background_playback rule is supported with client_requirement
--     'none'. Otherwise returns NULL (fail-closed, nothing written).
--   * create_business_organization_with_location calls it in the same
--     transaction and returns rights_context_id (NULL when not created).
--
-- The context does not list tracks: the resolver checks grants at runtime, so
-- one active context covers every rights-confirmed track (current and future).
-- No data backfill here; existing venues are untouched.

BEGIN;

CREATE OR REPLACE FUNCTION public.business_ensure_location_rights_context(
  p_location_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_location public.business_locations%ROWTYPE;
  v_profile_id uuid;
  v_context_id uuid;
BEGIN
  IF p_location_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Serialises concurrent calls for the same location (retry-safe).
  SELECT *
  INTO v_location
  FROM public.business_locations
  WHERE id = p_location_id
  FOR UPDATE;

  IF NOT FOUND OR v_location.status IS DISTINCT FROM 'active' THEN
    RETURN NULL;
  END IF;

  SELECT c.id
  INTO v_context_id
  FROM public.business_location_rights_contexts AS c
  WHERE c.location_id = p_location_id
    AND c.status = 'active'
  ORDER BY c.version DESC
  LIMIT 1;

  IF v_context_id IS NOT NULL THEN
    RETURN v_context_id;
  END IF;

  -- Any history (draft or superseded) means an operator owns the lifecycle.
  IF EXISTS (
    SELECT 1
    FROM public.business_location_rights_contexts AS c
    WHERE c.location_id = p_location_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT p.id
  INTO v_profile_id
  FROM public.music_country_rights_profiles AS p
  JOIN public.music_country_rights_profile_rules AS r
    ON r.profile_id = p.id
   AND r.use_type = 'business_background_playback'
   AND r.service_status = 'supported'
   AND r.client_requirement = 'none'
  WHERE p.country_code = v_location.country_code
    AND p.status = 'active'
    AND p.activated_at IS NOT NULL
    AND p.activated_at <= clock_timestamp()
    AND p.ceased_at IS NULL
  ORDER BY p.version DESC
  LIMIT 1
  -- Hold the profile until commit: a concurrent supersession waits instead of
  -- making the activation trigger raise and roll back the whole onboarding.
  -- If it was superseded before we locked, the re-check drops it (NULL).
  FOR SHARE OF p;

  IF v_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.business_location_rights_contexts (
    location_id,
    country_profile_id,
    country_code_snapshot,
    business_category_snapshot,
    version,
    status,
    reviewed_at
  ) VALUES (
    p_location_id,
    v_profile_id,
    v_location.country_code,
    v_location.business_category,
    1,
    'draft',
    now()
  )
  RETURNING id INTO v_context_id;

  UPDATE public.business_location_rights_contexts
  SET status = 'active'
  WHERE id = v_context_id;

  RETURN v_context_id;
END;
$$;

COMMENT ON FUNCTION public.business_ensure_location_rights_context(uuid) IS
  'audiolad:rights-eligibility; idempotent auto-create of Location Rights Context v1 (draft -> active) for a new venue. NULL when history exists or no supported country profile. Never supersedes.';

REVOKE ALL ON FUNCTION public.business_ensure_location_rights_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.business_ensure_location_rights_context(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.business_ensure_location_rights_context(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.business_ensure_location_rights_context(uuid) TO service_role;

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

COMMENT ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text) IS
  'audiolad:business-domain; atomic bootstrap: Organization + owner membership + Location + default Zone + Location Rights Context v1 (when the country profile supports it). Owner is always auth.uid().';

REVOKE ALL ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text)
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.business_ensure_location_rights_context(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: business_ensure_location_rights_context missing';
  END IF;
  IF has_function_privilege('authenticated', 'public.business_ensure_location_rights_context(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.business_ensure_location_rights_context(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: ensure rights context must be service-only';
  END IF;
  IF position('business_ensure_location_rights_context' IN pg_get_functiondef(
       'public.create_business_organization_with_location(text,text,text,text,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Post-check failed: onboarding RPC does not ensure rights context';
  END IF;
END;
$$;

COMMIT;
