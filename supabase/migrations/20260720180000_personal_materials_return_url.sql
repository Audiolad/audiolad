-- Add optional return-to-chat fields for personal materials.
-- Idempotent additive migration; does not modify P1 foundation file.

BEGIN;

ALTER TABLE public.personal_materials
  ADD COLUMN IF NOT EXISTS return_url text NULL,
  ADD COLUMN IF NOT EXISTS return_button_label text NULL;

ALTER TABLE public.personal_materials
  DROP CONSTRAINT IF EXISTS personal_materials_return_url_length_check;

ALTER TABLE public.personal_materials
  ADD CONSTRAINT personal_materials_return_url_length_check
    CHECK (return_url IS NULL OR char_length(return_url) <= 2000);

ALTER TABLE public.personal_materials
  DROP CONSTRAINT IF EXISTS personal_materials_return_button_label_length_check;

ALTER TABLE public.personal_materials
  ADD CONSTRAINT personal_materials_return_button_label_length_check
    CHECK (return_button_label IS NULL OR char_length(return_button_label) <= 120);

COMMENT ON COLUMN public.personal_materials.return_url IS
  'Optional safe HTTPS (or local HTTP) link for client to return to author chat after listening';

COMMENT ON COLUMN public.personal_materials.return_button_label IS
  'Optional custom label for return-to-chat button; max 120 chars';

CREATE OR REPLACE FUNCTION public.personal_materials_normalize_return_url(
  p_url text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_trimmed text;
BEGIN
  v_trimmed := NULLIF(btrim(p_url), '');

  IF v_trimmed IS NULL THEN
    RETURN NULL;
  END IF;

  IF char_length(v_trimmed) > 2000 THEN
    RAISE EXCEPTION 'invalid_return_url'
      USING ERRCODE = '22023';
  END IF;

  IF v_trimmed ~* '^(javascript|data|file|vbscript):' THEN
    RAISE EXCEPTION 'invalid_return_url'
      USING ERRCODE = '22023';
  END IF;

  IF v_trimmed ~* '^https://' THEN
    RETURN v_trimmed;
  END IF;

  IF v_trimmed ~* '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?(/|$)' THEN
    RETURN v_trimmed;
  END IF;

  RAISE EXCEPTION 'invalid_return_url'
    USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.personal_materials_normalize_return_url(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.personal_materials_normalize_return_button_label(
  p_label text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_trimmed text;
BEGIN
  v_trimmed := public.personal_materials_normalize_optional_text(p_label);

  IF v_trimmed IS NULL THEN
    RETURN NULL;
  END IF;

  IF char_length(v_trimmed) > 120 THEN
    RAISE EXCEPTION 'invalid_return_button_label'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_trimmed;
END;
$$;

REVOKE ALL ON FUNCTION public.personal_materials_normalize_return_button_label(text) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.create_personal_material(
  uuid, text, text, date, text, text, text, text, text
);

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
     OR btrim(COALESCE(p_client_last_name, '')) = ''
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
    btrim(p_client_last_name),
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

REVOKE ALL ON FUNCTION public.create_personal_material(
  uuid, text, text, date, text, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_personal_material(
  uuid, text, text, date, text, text, text, text, text, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_personal_material(
  uuid, text, text, date, text, text, text, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.create_personal_material(
  uuid, text, text, date, text, text, text, text, text, text, text
) IS
  'audiolad:personal-material-create:v2; draft only; optional return_url fields';

DROP FUNCTION IF EXISTS public.update_personal_material_draft(
  uuid, text, text, date, text, text, text, text
);

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
     OR btrim(COALESCE(p_client_last_name, '')) = ''
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
    client_last_name = btrim(p_client_last_name),
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
    DELETE FROM public.personal_material_author_notes AS n
    WHERE n.personal_material_id = p_material_id;
  ELSE
    INSERT INTO public.personal_material_author_notes (
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

REVOKE ALL ON FUNCTION public.update_personal_material_draft(
  uuid, text, text, date, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_personal_material_draft(
  uuid, text, text, date, text, text, text, text, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_personal_material_draft(
  uuid, text, text, date, text, text, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.update_personal_material_draft(
  uuid, text, text, date, text, text, text, text, text, text
) IS
  'audiolad:personal-material-update-draft:v2; draft only; optional return_url fields';

COMMIT;
