-- Courses: per-lesson semantic content replaces the global audio_items gate.
-- publication_class = 'course' does not require flat audio_items.
-- Leftover / orphan audio_items on a course must not fail readiness.
-- Non-course classes keep the existing audio_items required + complete checks.
-- Do not edit already-applied migrations; replace the function here.

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
  SELECT * INTO v_practice
  FROM public.practices
  WHERE id = p_practice_id;

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
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'missing_title';
  END IF;
  -- audio_post may publish without a long-form description
  IF v_practice.product_kind <> 'audio_post'
     AND NULLIF(btrim(COALESCE(v_practice.description, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'missing_description';
  END IF;
  IF NULLIF(btrim(COALESCE(v_practice.slug, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'slug_required';
  END IF;
  IF v_practice.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_slug';
  END IF;
  IF NULLIF(btrim(COALESCE(v_practice.cover_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'missing_cover';
  END IF;
  IF COALESCE(v_practice.currency, '') <> 'RUB' THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_currency';
  END IF;
  IF v_practice.product_kind NOT IN ('practice', 'music', 'audio_post') THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_product_kind';
  END IF;
  IF NULLIF(btrim(COALESCE(v_practice.format, '')), '') IS NULL
     OR (v_practice.product_kind = 'practice' AND btrim(v_practice.format) = 'Другое')
     OR (v_practice.product_kind = 'music' AND btrim(v_practice.format) <> 'Музыка')
     OR (v_practice.product_kind = 'audio_post' AND btrim(v_practice.format) <> 'Аудиопост') THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_format';
  END IF;
  IF v_practice.product_kind = 'music'
     AND v_practice.music_usage_permission NOT IN ('listen_only', 'platform_reuse_allowed') THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'music_permission_required';
  END IF;
  IF v_practice.product_kind IN ('practice', 'audio_post')
     AND v_practice.music_usage_permission IS NOT NULL THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'music_permission_not_allowed';
  END IF;
  IF v_practice.product_kind = 'audio_post'
     AND (NOT COALESCE(v_practice.is_free, false) OR COALESCE(v_practice.price, 0) <> 0) THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'audio_post_must_be_free';
  END IF;
  IF (COALESCE(v_practice.is_free, false) AND COALESCE(v_practice.price, 0) <> 0)
     OR (NOT COALESCE(v_practice.is_free, false) AND COALESCE(v_practice.price, 0) <= 0) THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_price';
  END IF;
  IF NOT COALESCE(v_practice.is_free, false)
     AND NOT public.author_access_allows_paid_products(v_access_status) THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'commercial_eligibility_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.practice_topics pt
    JOIN public.topics t ON t.id = pt.topic_id
    WHERE pt.practice_id = p_practice_id AND t.is_active
  ) THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'topic_min_required';
  END IF;

  IF v_practice.publication_class = 'course' THEN
    -- Per-lesson semantic content. Flat audio_items are not required.
    -- Orphan leftover tracks must not fail the course.
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
            (
              b.type = 'text'
              AND NULLIF(btrim(COALESCE(b.payload->>'text', '')), '') IS NOT NULL
            )
            OR (
              b.type = 'audio'
              AND EXISTS (
                SELECT 1
                FROM public.audio_items ai
                WHERE ai.id = b.asset_id
                  AND ai.practice_id = p_practice_id
                  AND NULLIF(btrim(COALESCE(ai.title, '')), '') IS NOT NULL
                  AND NULLIF(btrim(COALESCE(ai.audio_path, '')), '') IS NOT NULL
                  AND COALESCE(ai.duration_seconds, 0) > 0
              )
            )
            OR (
              b.type = 'file'
              AND EXISTS (
                SELECT 1
                FROM public.publication_files pf
                WHERE pf.id = b.asset_id
                  AND pf.publication_id = p_practice_id
                  AND NULLIF(btrim(COALESCE(pf.storage_path, '')), '') IS NOT NULL
                  AND NULLIF(btrim(COALESCE(pf.original_name, '')), '') IS NOT NULL
                  AND COALESCE(pf.size_bytes, 0) > 0
              )
            )
          )
      ) THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.course_lesson_blocks b
        WHERE b.lesson_id = v_lesson.id
          AND b.type = 'audio'
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023',
                DETAIL = 'incomplete_course_audio',
                HINT = v_lesson.title;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.course_lesson_blocks b
        WHERE b.lesson_id = v_lesson.id
          AND b.type = 'file'
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023',
                DETAIL = 'missing_course_file',
                HINT = v_lesson.title;
      END IF;

      RAISE EXCEPTION 'product_not_ready'
        USING ERRCODE = '22023',
              DETAIL = 'empty_course_lesson',
              HINT = v_lesson.title;
    END LOOP;
  ELSE
    SELECT count(*)::integer INTO v_audio_count
    FROM public.audio_items
    WHERE practice_id = p_practice_id;
    IF v_audio_count = 0 THEN
      RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'missing_audio';
    END IF;
    IF v_practice.product_kind = 'audio_post' AND v_audio_count <> 1 THEN
      RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'audio_post_requires_single_audio';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.audio_items
      WHERE practice_id = p_practice_id
        AND (
          NULLIF(btrim(COALESCE(title, '')), '') IS NULL
          OR NULLIF(btrim(COALESCE(audio_path, '')), '') IS NULL
          OR COALESCE(duration_seconds, 0) <= 0
        )
    ) THEN
      RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'incomplete_audio';
    END IF;
  END IF;

  IF v_practice.product_kind = 'audio_post' AND COALESCE(v_practice.promo_enabled, false) THEN
    IF NULLIF(btrim(COALESCE(v_practice.promo_title, '')), '') IS NULL THEN
      RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'promo_title_required';
    END IF;
    IF NULLIF(btrim(COALESCE(v_practice.promo_text, '')), '') IS NULL THEN
      RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'promo_text_required';
    END IF;
    IF NULLIF(btrim(COALESCE(v_practice.promo_button_text, '')), '') IS NULL THEN
      RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'promo_button_text_required';
    END IF;
    IF NULLIF(btrim(COALESCE(v_practice.promo_url, '')), '') IS NULL THEN
      RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'promo_url_required';
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_practice_moderation_ready(uuid) IS
  'audiolad:internal-moderation-readiness:v4; SECURITY DEFINER helper for trusted lifecycle RPCs only; audio_post description optional; course uses per-lesson semantic content instead of flat audio_items';
