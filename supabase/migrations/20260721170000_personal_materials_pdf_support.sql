-- Personal materials: optional PDF attachments + activate with audio OR PDF.
-- Storage cleanup remains server-side. DO NOT apply without explicit approval.

BEGIN;

CREATE OR REPLACE FUNCTION public.activate_personal_material(
  p_material_id uuid,
  p_access_token_hash bytea
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
  v_has_audio boolean;
  v_has_pdf boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_access_token_hash IS NULL OR octet_length(p_access_token_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid_token_hash'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.personal_materials_assert_author_access(v_material.author_id, auth.uid());

  IF v_material.status = 'deleted' THEN
    RAISE EXCEPTION 'material_deleted'
      USING ERRCODE = 'P0002';
  END IF;

  IF btrim(v_material.client_first_name) = ''
     OR btrim(v_material.client_last_name) = ''
     OR v_material.material_date IS NULL
     OR v_material.material_type IS NULL THEN
    RAISE EXCEPTION 'material_not_ready'
      USING ERRCODE = '22023';
  END IF;

  v_has_audio :=
    v_material.audio_path IS NOT NULL
    AND btrim(v_material.audio_path) <> ''
    AND v_material.duration_seconds IS NOT NULL
    AND v_material.duration_seconds > 0;

  v_has_pdf :=
    v_material.pdf_path IS NOT NULL
    AND btrim(v_material.pdf_path) <> '';

  IF NOT v_has_audio AND NOT v_has_pdf THEN
    RAISE EXCEPTION 'material_not_ready'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.personal_materials AS pm
  SET
    access_token_hash = p_access_token_hash,
    guest_access_enabled = true,
    token_created_at = now(),
    status = 'active',
    revoked_at = NULL,
    deleted_at = NULL,
    updated_at = now()
  WHERE pm.id = p_material_id;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'status', 'active'
  );
END;
$$;

COMMENT ON FUNCTION public.activate_personal_material(uuid, bytea) IS
  'audiolad:personal-material-activate:v2; requires audio OR PDF attachment';

CREATE OR REPLACE FUNCTION public.clear_personal_material_draft_pdf(
  p_material_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.personal_materials_assert_author_access(v_material.author_id, auth.uid());

  IF v_material.status <> 'draft' THEN
    RAISE EXCEPTION 'material_not_editable'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.personal_materials AS pm
  SET
    pdf_path = NULL,
    pdf_original_filename = NULL,
    pdf_mime_type = NULL,
    pdf_size_bytes = NULL,
    updated_at = now()
  WHERE pm.id = p_material_id;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_personal_material_draft_pdf(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_personal_material_draft_pdf(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_personal_material_draft_pdf(uuid) TO authenticated;

COMMENT ON FUNCTION public.clear_personal_material_draft_pdf(uuid) IS
  'audiolad:personal-material-clear-draft-pdf:v1; draft only; storage cleanup is server-side';

COMMIT;
