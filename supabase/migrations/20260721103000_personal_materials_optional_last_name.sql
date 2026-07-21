-- Make client_last_name optional for personal materials (additive, nullable).

ALTER TABLE public.personal_materials
  DROP CONSTRAINT IF EXISTS personal_materials_client_last_name_not_blank_check;

ALTER TABLE public.personal_materials
  ALTER COLUMN client_last_name DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_personal_material(
  p_author_id uuid,
  p_client_first_name text,
  p_client_last_name text,
  p_material_date date,
  p_material_type text DEFAULT 'diagnostic',
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
  v_user_id uuid;
  v_material_id uuid;
  v_return_url text;
  v_return_button_label text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  PERFORM public.personal_materials_assert_author_access(p_author_id, v_user_id);

  IF p_material_type IS NULL OR p_material_type NOT IN (
    'diagnostic',
    'audio_review',
    'personal_meditation',
    'recommendation',
    'consultation_material',
    'homework',
    'personal_music',
    'other'
  ) THEN
    RAISE EXCEPTION 'invalid_material_type'
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

  INSERT INTO public.personal_materials (
    author_id,
    created_by,
    material_type,
    title,
    client_first_name,
    client_last_name,
    material_date,
    description,
    personal_recommendation,
    return_url,
    return_button_label,
    status,
    guest_access_enabled
  )
  VALUES (
    p_author_id,
    v_user_id,
    p_material_type,
    public.personal_materials_normalize_optional_text(p_title),
    btrim(p_client_first_name),
    public.personal_materials_normalize_optional_text(p_client_last_name),
    p_material_date,
    public.personal_materials_normalize_optional_text(p_description),
    public.personal_materials_normalize_optional_text(p_personal_recommendation),
    v_return_url,
    v_return_button_label,
    'draft',
    false
  )
  RETURNING id INTO v_material_id;

  IF public.personal_materials_normalize_optional_text(p_author_notes) IS NOT NULL THEN
    INSERT INTO public.personal_material_author_notes (
      personal_material_id,
      author_notes,
      updated_by
    )
    VALUES (
      v_material_id,
      public.personal_materials_normalize_optional_text(p_author_notes),
      v_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'material_id', v_material_id,
    'status', 'draft'
  );
END;
$$;

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

  IF v_material.status <> 'draft' THEN
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
    'status', 'draft'
  );
END;
$$;

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
     OR v_material.material_date IS NULL
     OR v_material.material_type IS NULL
     OR v_material.audio_path IS NULL
     OR btrim(v_material.audio_path) = ''
     OR v_material.duration_seconds IS NULL
     OR v_material.duration_seconds <= 0 THEN
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

COMMENT ON FUNCTION public.create_personal_material(
  uuid, text, text, date, text, text, text, text, text, text, text
) IS
  'audiolad:personal-material-create:v3; draft only; client_last_name optional';

COMMENT ON FUNCTION public.update_personal_material_draft(
  uuid, text, text, date, text, text, text, text, text, text, text
) IS
  'audiolad:personal-material-update-draft:v2; draft only; client_last_name optional';

COMMENT ON FUNCTION public.activate_personal_material(uuid, bytea) IS
  'audiolad:personal-material-activate:v2; client_last_name optional';
