-- Author-declared rights holder – separate from the service-specific provider_details whitelist.
-- Owner approval required before applying. No backfill; legacy applications keep NULL fields.
BEGIN;

ALTER TABLE public.business_rightsholder_verifications
  ADD COLUMN IF NOT EXISTS declared_rightsholder_name text,
  ADD COLUMN IF NOT EXISTS declared_rightsholder_type text,
  ADD COLUMN IF NOT EXISTS declared_rightsholder_is_self boolean;

ALTER TABLE public.business_rightsholder_verifications
  ADD CONSTRAINT business_declared_rightsholder_name_check CHECK (
    declared_rightsholder_name IS NULL OR length(btrim(declared_rightsholder_name)) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT business_declared_rightsholder_type_check CHECK (
    declared_rightsholder_type IS NULL OR declared_rightsholder_type IN ('person', 'organization')
  ),
  ADD CONSTRAINT business_declared_rightsholder_self_check CHECK (
    declared_rightsholder_is_self IS DISTINCT FROM true OR declared_rightsholder_type = 'person'
  ),
  ADD CONSTRAINT business_declared_rightsholder_complete_check CHECK (
    (declared_rightsholder_name IS NULL AND declared_rightsholder_type IS NULL AND declared_rightsholder_is_self IS NULL)
    OR
    (declared_rightsholder_name IS NOT NULL AND declared_rightsholder_type IS NOT NULL AND declared_rightsholder_is_self IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.author_business_verification_set_declared_rightsholder(
  p_verification_id uuid, p_is_self boolean, p_name text, p_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.business_rightsholder_verifications
    WHERE id = p_verification_id AND owner_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'business_verification_not_found';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'business_verification_transition_forbidden';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'business_declared_rightsholder_name_invalid';
  END IF;
  IF p_is_self IS NULL OR p_type IS NULL OR p_type NOT IN ('person', 'organization')
    OR (p_is_self AND p_type <> 'person') THEN
    RAISE EXCEPTION 'business_declared_rightsholder_type_invalid';
  END IF;
  UPDATE public.business_rightsholder_verifications
    SET declared_rightsholder_name = btrim(p_name), declared_rightsholder_type = p_type,
      declared_rightsholder_is_self = p_is_self, updated_at = clock_timestamp()
    WHERE id = p_verification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.author_business_verification_set_declared_rightsholder(uuid,boolean,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_business_verification_set_declared_rightsholder(uuid,boolean,text,text) TO authenticated;

COMMIT;
