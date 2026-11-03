-- Profile personalization: reuse the existing organization name and owner helper.
-- No table UPDATE grant or broader RLS policy is introduced.
BEGIN;

CREATE OR REPLACE FUNCTION public.rename_business_organization(p_organization_id uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_mutation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_business_organization_owner(p_organization_id, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_name) < 1 OR char_length(v_name) > 120
     OR coalesce(p_name, '') ~ '[<>[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_organization_name' USING ERRCODE = '22023';
  END IF;
  UPDATE public.business_organizations SET name = v_name WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('ok', true, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.rename_business_organization(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_business_organization(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.rename_business_organization(uuid, text) IS
  'Owner-only profile name update. Reuses business_organizations.name; table RLS stays read-only.';
COMMIT;
