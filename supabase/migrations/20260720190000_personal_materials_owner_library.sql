-- Additive: enrich claimed personal material owner RPCs for /my-materials client library.
-- Does not alter P1 foundation migration. Safe for empty production (functions only).

CREATE OR REPLACE FUNCTION public.get_claimed_personal_material(
  p_material_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_material public.personal_materials%ROWTYPE;
  v_author public.authors%ROWTYPE;
  v_progress public.personal_material_progress%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id;

  IF NOT FOUND
     OR v_material.claimed_by_user_id IS DISTINCT FROM v_user_id
     OR v_material.status = 'deleted' THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_author
  FROM public.authors AS a
  WHERE a.id = v_material.author_id;

  SELECT *
  INTO v_progress
  FROM public.personal_material_progress AS p
  WHERE p.user_id = v_user_id
    AND p.personal_material_id = p_material_id;

  RETURN jsonb_build_object(
    'id', v_material.id,
    'author_id', v_material.author_id,
    'author_name', v_author.name,
    'author_slug', v_author.slug,
    'author_avatar_url', v_author.avatar_url,
    'material_type', v_material.material_type,
    'title', v_material.title,
    'client_first_name', v_material.client_first_name,
    'material_date', v_material.material_date,
    'description', v_material.description,
    'personal_recommendation', v_material.personal_recommendation,
    'return_url', v_material.return_url,
    'return_button_label', v_material.return_button_label,
    'has_audio', v_material.audio_path IS NOT NULL,
    'has_pdf', v_material.pdf_path IS NOT NULL,
    'duration_seconds', v_material.duration_seconds,
    'status', v_material.status,
    'claimed_at', v_material.claimed_at,
    'created_at', v_material.created_at,
    'updated_at', v_material.updated_at,
    'progress', CASE
      WHEN v_progress.personal_material_id IS NULL THEN jsonb_build_object(
        'position_seconds', 0,
        'completed', false,
        'updated_at', NULL
      )
      ELSE jsonb_build_object(
        'position_seconds', v_progress.position_seconds,
        'completed', v_progress.completed,
        'updated_at', v_progress.updated_at
      )
    END
  );
END;
$$;

COMMENT ON FUNCTION public.get_claimed_personal_material(uuid) IS
  'audiolad:personal-material-owner-read:v2; safe DTO for /my-materials/{id}; includes return CTA + progress';

CREATE OR REPLACE FUNCTION public.list_claimed_personal_materials()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY row_data->>'claimed_at' DESC, row_data->>'id' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', pm.id,
          'author_id', pm.author_id,
          'author_name', a.name,
          'author_slug', a.slug,
          'author_avatar_url', a.avatar_url,
          'material_type', pm.material_type,
          'title', pm.title,
          'material_date', pm.material_date,
          'duration_seconds', pm.duration_seconds,
          'has_audio', pm.audio_path IS NOT NULL,
          'status', pm.status,
          'claimed_at', pm.claimed_at,
          'created_at', pm.created_at,
          'progress', CASE
            WHEN p.personal_material_id IS NULL THEN jsonb_build_object(
              'position_seconds', 0,
              'completed', false,
              'updated_at', NULL
            )
            ELSE jsonb_build_object(
              'position_seconds', p.position_seconds,
              'completed', p.completed,
              'updated_at', p.updated_at
            )
          END
        ) AS row_data
        FROM public.personal_materials AS pm
        INNER JOIN public.authors AS a ON a.id = pm.author_id
        LEFT JOIN public.personal_material_progress AS p
          ON p.personal_material_id = pm.id
         AND p.user_id = v_user_id
        WHERE pm.claimed_by_user_id = v_user_id
          AND pm.status <> 'deleted'
      ) AS rows
    ),
    '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.list_claimed_personal_materials() IS
  'audiolad:personal-material-owner-list:v2; claimed_at DESC; includes author slug/avatar + progress';

-- Improve upsert: never regress position or completed flag automatically.
CREATE OR REPLACE FUNCTION public.upsert_personal_material_progress(
  p_material_id uuid,
  p_position_seconds integer,
  p_completed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_duration integer;
  v_existing public.personal_material_progress%ROWTYPE;
  v_position integer;
  v_completed boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_position_seconds IS NULL OR p_position_seconds < 0 THEN
    RAISE EXCEPTION 'invalid_position'
      USING ERRCODE = '22023';
  END IF;

  SELECT pm.duration_seconds
  INTO v_duration
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id
    AND pm.claimed_by_user_id = v_user_id
    AND pm.status <> 'deleted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_position := p_position_seconds;

  IF v_duration IS NOT NULL AND v_position > v_duration THEN
    v_position := v_duration;
  END IF;

  SELECT *
  INTO v_existing
  FROM public.personal_material_progress AS p
  WHERE p.user_id = v_user_id
    AND p.personal_material_id = p_material_id;

  IF FOUND THEN
    IF v_position < v_existing.position_seconds THEN
      v_position := v_existing.position_seconds;
    END IF;
  END IF;

  v_completed := COALESCE(p_completed, false);

  IF v_duration IS NOT NULL AND v_duration > 0 THEN
    IF v_position >= GREATEST(v_duration - 15, CEIL(v_duration * 0.95)::integer) THEN
      v_completed := true;
    END IF;
  END IF;

  IF FOUND AND v_existing.completed THEN
    v_completed := true;
  END IF;

  INSERT INTO public.personal_material_progress (
    user_id,
    personal_material_id,
    position_seconds,
    completed,
    updated_at
  )
  VALUES (
    v_user_id,
    p_material_id,
    v_position,
    v_completed,
    now()
  )
  ON CONFLICT (user_id, personal_material_id) DO UPDATE
  SET
    position_seconds = EXCLUDED.position_seconds,
    completed = EXCLUDED.completed,
    updated_at = now();

  RETURN jsonb_build_object(
    'personal_material_id', p_material_id,
    'position_seconds', v_position,
    'completed', v_completed
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_personal_material_progress(uuid, integer, boolean) IS
  'audiolad:personal-material-progress-upsert:v2; no regression; auto-complete near end';
