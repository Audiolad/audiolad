-- Moderation accepts a minimal audio product: title plus a ready audio file.
-- Descriptions, cover, format, topics, SEO, price and promotion fields are
-- optional content and must never block sending a product to moderation.
-- Do not edit already-applied migrations; replace the current function here.

CREATE OR REPLACE FUNCTION public.assert_practice_moderation_ready(p_practice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_access_status text;
  v_audio_count integer;
  v_lesson record;
BEGIN
  SELECT * INTO v_practice FROM public.practices WHERE id = p_practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;

  SELECT access_status INTO v_access_status
  FROM public.authors
  WHERE id = v_practice.author_id;

  IF NOT FOUND OR NOT public.author_access_allows_content_mutations(v_access_status) THEN
    RAISE EXCEPTION 'author_content_mutations_blocked' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(v_practice.title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_not_ready'
      USING ERRCODE = '22023', DETAIL = 'missing_title';
  END IF;

  IF v_practice.publication_class = 'course' THEN
    -- Courses retain their existing per-lesson semantic-content requirement.
    IF NOT EXISTS (
      SELECT 1
      FROM public.course_lessons cl
      WHERE cl.publication_id = p_practice_id
    ) THEN
      RAISE EXCEPTION 'product_not_ready'
        USING ERRCODE = '22023', DETAIL = 'missing_course_lessons';
    END IF;

    FOR v_lesson IN
      SELECT cl.id, cl.title
      FROM public.course_lessons cl
      WHERE cl.publication_id = p_practice_id
      ORDER BY cl.position, cl.id
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.course_lesson_blocks b
        WHERE b.lesson_id = v_lesson.id
          AND (
            (b.type = 'text' AND NULLIF(btrim(COALESCE(b.payload->>'text', '')), '') IS NOT NULL)
            OR (b.type = 'audio' AND EXISTS (
              SELECT 1 FROM public.audio_items ai
              WHERE ai.id = b.asset_id
                AND ai.practice_id = p_practice_id
                AND NULLIF(btrim(COALESCE(ai.audio_path, '')), '') IS NOT NULL
                AND COALESCE(ai.duration_seconds, 0) > 0
            ))
            OR (b.type = 'file' AND EXISTS (
              SELECT 1 FROM public.publication_files pf
              WHERE pf.id = b.asset_id
                AND pf.publication_id = p_practice_id
                AND NULLIF(btrim(COALESCE(pf.storage_path, '')), '') IS NOT NULL
                AND NULLIF(btrim(COALESCE(pf.original_name, '')), '') IS NOT NULL
                AND COALESCE(pf.size_bytes, 0) > 0
            ))
          )
      ) THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.course_lesson_blocks b
        WHERE b.lesson_id = v_lesson.id AND b.type = 'audio'
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023', DETAIL = 'incomplete_course_audio', HINT = v_lesson.title;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.course_lesson_blocks b
        WHERE b.lesson_id = v_lesson.id AND b.type = 'file'
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023', DETAIL = 'missing_course_file', HINT = v_lesson.title;
      END IF;
      RAISE EXCEPTION 'product_not_ready'
        USING ERRCODE = '22023', DETAIL = 'empty_course_lesson', HINT = v_lesson.title;
    END LOOP;
  ELSE
    SELECT count(*)::integer INTO v_audio_count
    FROM public.audio_items
    WHERE practice_id = p_practice_id;

    IF v_audio_count = 0 THEN
      RAISE EXCEPTION 'product_not_ready'
        USING ERRCODE = '22023', DETAIL = 'missing_audio';
    END IF;
    IF v_practice.product_kind = 'audio_post' AND v_audio_count <> 1 THEN
      RAISE EXCEPTION 'product_not_ready'
        USING ERRCODE = '22023', DETAIL = 'audio_post_requires_single_audio';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.audio_items
      WHERE practice_id = p_practice_id
        AND (
          NULLIF(btrim(COALESCE(audio_path, '')), '') IS NULL
          OR COALESCE(duration_seconds, 0) <= 0
        )
    ) THEN
      RAISE EXCEPTION 'product_not_ready'
        USING ERRCODE = '22023', DETAIL = 'incomplete_audio';
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_practice_moderation_ready(uuid) IS
  'audiolad:internal-moderation-readiness:v5; SECURITY DEFINER helper for trusted lifecycle RPCs only; title plus ready audio required; optional content does not gate moderation; course uses per-lesson semantic content';
