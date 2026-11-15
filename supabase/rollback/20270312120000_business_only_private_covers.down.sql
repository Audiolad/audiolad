-- Rollback of 20270312120000_business_only_private_covers.sql (39a7ef48 PR-D).
-- Order: 1) roll back the PR-D code; 2) export references and objects:
--   SELECT id, cover_url FROM public.practices WHERE cover_url LIKE 'business-private-cover:%';
--   SELECT id, practice_id, cover_url FROM public.audio_items WHERE cover_url LIKE 'business-private-cover:%';
--   download bucket business-private-covers via the Storage API;
-- 3) apply this file; 4) remove objects via the Storage API and re-run the bucket block if it was kept.
-- After this rollback closed albums have no cover again (PR-C state: cannot be published).
BEGIN;
SET LOCAL lock_timeout = '5s';

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
  v_max_level integer;
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

  IF NULLIF(btrim(COALESCE(v_practice.cover_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_not_ready'
      USING ERRCODE = '22023', DETAIL = 'missing_cover';
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

    -- Access-level catalog is optional. Empty catalog = legacy single purchase.
    IF EXISTS (
      SELECT 1
      FROM public.practice_access_levels pal
      WHERE pal.practice_id = p_practice_id
    ) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.practice_access_levels pal
        WHERE pal.practice_id = p_practice_id
          AND pal.level = 1
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023', DETAIL = 'missing_access_level_1';
      END IF;

      SELECT max(pal.level)
      INTO v_max_level
      FROM public.practice_access_levels pal
      WHERE pal.practice_id = p_practice_id;

      IF EXISTS (
        SELECT 1
        FROM generate_series(1, v_max_level) AS expected(level)
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.practice_access_levels pal
          WHERE pal.practice_id = p_practice_id
            AND pal.level = expected.level
        )
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023', DETAIL = 'access_levels_not_contiguous';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.practice_access_levels pal
        WHERE pal.practice_id = p_practice_id
          AND pal.level = 1
          AND pal.upgrade_price IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023', DETAIL = 'invalid_level_1_upgrade_price';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.practice_access_levels pal
        WHERE pal.practice_id = p_practice_id
          AND pal.level >= 2
          AND (pal.upgrade_price IS NULL OR pal.upgrade_price <= 0)
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023', DETAIL = 'invalid_paid_upgrade_price';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.course_lessons cl
        WHERE cl.publication_id = p_practice_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.practice_access_levels pal
            WHERE pal.practice_id = p_practice_id
              AND pal.level = cl.required_access_level
          )
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023', DETAIL = 'lesson_level_not_in_catalog';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.practice_access_levels pal
        WHERE pal.practice_id = p_practice_id
          AND pal.level >= 2
          AND NOT EXISTS (
            SELECT 1
            FROM public.course_lessons cl
            WHERE cl.publication_id = p_practice_id
              AND cl.required_access_level = pal.level
          )
      ) THEN
        RAISE EXCEPTION 'product_not_ready'
          USING ERRCODE = '22023', DETAIL = 'paid_level_missing_lessons';
      END IF;
    END IF;
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
      FROM public.audio_items AS ai
      WHERE ai.practice_id = p_practice_id
        AND NOT (
          (
            NULLIF(btrim(COALESCE(ai.audio_path, '')), '') IS NOT NULL
            AND COALESCE(ai.duration_seconds, 0) > 0
          )
          OR (
            v_practice.product_kind = 'music'
            AND public.music_item_has_validated_active_delivery(ai.id)
            AND EXISTS (
              SELECT 1
              FROM public.music_audio_assets AS asset
              WHERE asset.id = ai.active_music_delivery_asset_id
                AND asset.audio_item_id = ai.id
                AND asset.asset_role = 'stream'
                AND asset.lifecycle_state = 'verified'
                AND asset.storage_bucket = 'music-streams'
                AND NULLIF(btrim(COALESCE(asset.storage_path, '')), '') IS NOT NULL
                AND COALESCE(ai.duration_seconds, asset.duration_seconds, 0) > 0
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'product_not_ready'
        USING ERRCODE = '22023', DETAIL = 'incomplete_audio';
    END IF;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.assert_practice_moderation_ready(uuid) IS
  'audiolad:internal-moderation-readiness:v8; title + product cover + current audio/course readiness required';

-- PR-C state: closed albums have no images at all.
CREATE OR REPLACE FUNCTION public.guard_business_only_public_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'practices' THEN
    IF NEW.business_only AND (
      (NEW.cover_url IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_url IS DISTINCT FROM OLD.cover_url))
      OR (NEW.cover_image IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_image IS DISTINCT FROM OLD.cover_image))
    ) THEN
      RAISE EXCEPTION 'business_only_cover_upload_blocked' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'audio_items' THEN
    IF (NEW.cover_url IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_url IS DISTINCT FROM OLD.cover_url))
       OR (NEW.cover_image IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_image IS DISTINCT FROM OLD.cover_image)) THEN
      v_practice_id := NEW.practice_id;
    END IF;
  ELSE -- publication_gallery_slides
    IF TG_OP = 'INSERT' OR NEW.image_url IS DISTINCT FROM OLD.image_url
       OR NEW.image_manifest IS DISTINCT FROM OLD.image_manifest
       OR NEW.publication_id IS DISTINCT FROM OLD.publication_id THEN
      v_practice_id := NEW.publication_id;
    END IF;
  END IF;
  IF v_practice_id IS NOT NULL AND public.practice_is_business_only(v_practice_id) THEN
    RAISE EXCEPTION 'business_only_cover_upload_blocked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.practices DISABLE TRIGGER guard_business_only_practice_cover;
UPDATE public.practices SET cover_url = NULL WHERE cover_url LIKE 'business-private-cover:%';
ALTER TABLE public.practices ENABLE TRIGGER guard_business_only_practice_cover;
ALTER TABLE public.audio_items DISABLE TRIGGER guard_business_only_track_cover;
UPDATE public.audio_items SET cover_url = NULL WHERE cover_url LIKE 'business-private-cover:%';
ALTER TABLE public.audio_items ENABLE TRIGGER guard_business_only_track_cover;

DROP FUNCTION public.business_private_cover_ref_ok(text, uuid, uuid);

-- The bucket and its fences go only when the bucket is empty (objects are removed via
-- the Storage API). Otherwise both stay, so the objects remain closed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'business-private-covers') THEN
    BEGIN
      DELETE FROM storage.buckets WHERE id = 'business-private-covers';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'business-private-covers bucket kept: %', SQLERRM;
      RETURN;
    END;
    DROP POLICY IF EXISTS business_private_covers_read_fence ON storage.objects;
    DROP POLICY IF EXISTS business_private_covers_insert_fence ON storage.objects;
    DROP POLICY IF EXISTS business_private_covers_update_fence ON storage.objects;
    DROP POLICY IF EXISTS business_private_covers_delete_fence ON storage.objects;
  ELSE
    RAISE NOTICE 'business-private-covers bucket and fences kept: remove objects via the Storage API first';
  END IF;
END $$;

COMMIT;
