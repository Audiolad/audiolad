-- Additive. No new columns: business_locations.name and address_line1 already exist.
-- The 5-argument create_business_organization_with_location stays.
-- A 6-argument overload writes the street address in the same transaction.
-- business_owner_set_location_venue lets the owner correct the name and address later.
-- Authenticated still cannot UPDATE business_locations directly.
-- Do not apply until the owner confirms. Deploy the app only after this migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.business_owner_set_location_venue(
  p_location_id uuid,
  p_name text,
  p_address_line1 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_address text := btrim(coalesce(p_address_line1, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_location_name' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_address) < 1
     OR char_length(v_address) > 200
     OR v_address ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_location_address' USING ERRCODE = '22023';
  END IF;

  SELECT l.organization_id
  INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = p_location_id
  FOR UPDATE;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_business_organization_owner(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.business_locations
  SET name = v_name,
      address_line1 = v_address
  WHERE id = p_location_id;

  RETURN jsonb_build_object(
    'ok', true,
    'location_id', p_location_id,
    'name', v_name,
    'address_line1', v_address
  );
END;
$$;

COMMENT ON FUNCTION public.business_owner_set_location_venue(uuid, text, text) IS
  'audiolad:business-domain; owner sets business_locations.name and address_line1. No new columns. Country and category stay untouched.';

REVOKE ALL ON FUNCTION public.business_owner_set_location_venue(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_owner_set_location_venue(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_business_organization_with_location(
  p_organization_name text,
  p_location_name text,
  p_business_category text,
  p_country_code text,
  p_timezone text,
  p_address_line1 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_address text := btrim(coalesce(p_address_line1, ''));
  v_result jsonb;
  v_location_id uuid;
BEGIN
  IF char_length(v_address) < 1
     OR char_length(v_address) > 200
     OR v_address ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_location_address' USING ERRCODE = '22023';
  END IF;

  v_result := public.create_business_organization_with_location(
    p_organization_name,
    p_location_name,
    p_business_category,
    p_country_code,
    p_timezone
  );

  v_location_id := (v_result ->> 'location_id')::uuid;

  UPDATE public.business_locations
  SET address_line1 = v_address
  WHERE id = v_location_id;

  RETURN v_result || jsonb_build_object('address_line1', v_address);
END;
$$;

COMMENT ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text, text) IS
  'audiolad:business-domain; same bootstrap as the 5-argument function, plus address_line1. The licence place is this address.';

REVOKE ALL ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text, text)
  TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.create_business_organization_with_location(text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 5-argument onboarding function missing';
  END IF;
  IF to_regprocedure('public.create_business_organization_with_location(text,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: address overload missing';
  END IF;
  IF to_regprocedure('public.business_owner_set_location_venue(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: venue save missing';
  END IF;
  IF has_table_privilege('authenticated', 'public.business_locations', 'UPDATE') THEN
    RAISE EXCEPTION 'Post-check failed: location update must stay closed';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.business_owner_set_location_venue(uuid,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: owner venue save is not granted';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.business_locations', 'address_line1', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.business_locations', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: members cannot read the address';
  END IF;
END;
$$;

COMMIT;

-- Rollback, only after a backup and a separate decision. Do not run this with the migration.
-- It drops the new functions only. It does not clear address_line1 values already stored.
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.create_business_organization_with_location(text, text, text, text, text, text);
-- DROP FUNCTION IF EXISTS public.business_owner_set_location_venue(uuid, text, text);
-- COMMIT;
