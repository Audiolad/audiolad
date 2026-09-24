-- Owner-saved invitation copy for «Ваши 20%».
-- Stored as a template with {HOME_PARTNER_LINK} and {AUTHOR_PARTNER_LINK}.
-- Does not touch attribution, referrals, or the partner reward ledger.

ALTER TABLE public.author_partner_profiles
  ADD COLUMN IF NOT EXISTS invite_message_template text;

ALTER TABLE public.author_partner_profiles
  DROP CONSTRAINT IF EXISTS author_partner_profiles_invite_template_len_check;

ALTER TABLE public.author_partner_profiles
  ADD CONSTRAINT author_partner_profiles_invite_template_len_check
  CHECK (
    invite_message_template IS NULL
    OR char_length(invite_message_template) BETWEEN 1 AND 4000
  );

COMMENT ON COLUMN public.author_partner_profiles.invite_message_template IS
  'Owner invitation copy. Null means the product default. Link tokens stay unresolved until display.';

CREATE OR REPLACE FUNCTION public.get_author_partner_invite_template(p_author_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template text;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL OR NOT public.author_partner_is_owner(p_author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.invite_message_template
  INTO v_template
  FROM public.author_partner_profiles AS p
  WHERE p.author_id = p_author_id;

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', p_author_id,
    'template', v_template
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_author_partner_invite_template(
  p_author_id uuid,
  p_template text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template text;
  v_updated integer;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL OR NOT public.author_partner_is_owner(p_author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_template := nullif(btrim(coalesce(p_template, '')), '');
  IF v_template IS NOT NULL AND char_length(v_template) > 4000 THEN
    RAISE EXCEPTION 'invite_template_too_long' USING ERRCODE = '22023';
  END IF;

  UPDATE public.author_partner_profiles AS p
  SET invite_message_template = v_template
  WHERE p.author_id = p_author_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'partner_profile_missing' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', p_author_id,
    'template', v_template
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_author_partner_invite_template(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_author_partner_invite_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_author_partner_invite_template(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_author_partner_invite_template(uuid, text)
  TO authenticated, service_role;
