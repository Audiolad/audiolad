-- Keep author edits available after revoke (access token unchanged).

CREATE OR REPLACE FUNCTION public.update_personal_material_draft(
  p_material_id uuid,
  p_client_first_name text,
  p_client_last_name text,
  p_material_date date,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_personal_recommendation text DEFAULT NULL,
  p_author_notes text DEFAULT NULL,
  p_return_url text DEFAULT NULL,
  p_return_button_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
  v_user_id uuid;
  v_normalized_notes text;
  v_return_url text;
  v_return_button_label text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
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

  PERFORM public.personal_materials_assert_author_access(v_material.author_id, v_user_id);

  IF v_material.status NOT IN ('draft', 'active', 'revoked') THEN
    RAISE EXCEPTION 'material_not_editable'
      USING ERRCODE = '22023';
  END IF;

  IF btrim(COALESCE(p_client_first_name, '')) = ''
     OR p_material_date IS NULL THEN
    RAISE EXCEPTION 'invalid_client_fields'
      USING ERRCODE = '22023';
  END IF;

  v_return_url := public.personal_materials_normalize_return_url(p_return_url);
  v_return_button_label := public.personal_materials_normalize_return_button_label(
    p_return_button_label
  );

  UPDATE public.personal_materials AS pm
  SET
    client_first_name = btrim(p_client_first_name),
    client_last_name = public.personal_materials_normalize_optional_text(p_client_last_name),
    material_date = p_material_date,
    title = public.personal_materials_normalize_optional_text(p_title),
    description = public.personal_materials_normalize_optional_text(p_description),
    personal_recommendation = public.personal_materials_normalize_optional_text(p_personal_recommendation),
    return_url = v_return_url,
    return_button_label = v_return_button_label,
    updated_at = now()
  WHERE pm.id = p_material_id;

  v_normalized_notes := public.personal_materials_normalize_optional_text(p_author_notes);

  IF v_normalized_notes IS NULL THEN
    DELETE FROM public.personal_material_author_notes AS pan
    WHERE pan.personal_material_id = p_material_id;
  ELSE
    INSERT INTO public.personal_material_author_notes AS pan (
      personal_material_id,
      author_notes,
      updated_by
    )
    VALUES (
      p_material_id,
      v_normalized_notes,
      v_user_id
    )
    ON CONFLICT (personal_material_id) DO UPDATE
    SET
      author_notes = EXCLUDED.author_notes,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'status', v_material.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_personal_material_draft_audio(
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

  IF v_material.status NOT IN ('draft', 'active', 'revoked') THEN
    RAISE EXCEPTION 'material_not_editable'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.personal_materials AS pm
  SET
    audio_path = NULL,
    audio_original_filename = NULL,
    audio_mime_type = NULL,
    audio_size_bytes = NULL,
    duration_seconds = NULL,
    updated_at = now()
  WHERE pm.id = p_material_id;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'status', v_material.status
  );
END;
$$;
