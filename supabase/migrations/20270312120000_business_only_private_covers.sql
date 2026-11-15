-- 39a7ef48 PR-D: private covers for business-only («только Бизнес») albums.
-- Objects: private bucket business-private-covers (service role only, restrictive fences
-- for anon/authenticated). Columns keep a reference, never a URL:
--   business-private-cover:practices/<practice>/variants/<version>/<file>
--   business-private-cover:practices/<practice>/track-covers/<audio_item>/variants/<version>/<file>
-- The hall/owner player gets a short-lived signed URL from the server only.
BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('business-private-covers', 'business-private-covers', false, 10485760,
        ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'business-private-covers' AND public IS FALSE) THEN
    RAISE EXCEPTION 'business_private_covers_bucket_not_private';
  END IF;
END $$;

-- No permissive policy for this bucket. Restrictive fences also neutralise any older
-- permissive storage policy for anon/authenticated. Service role (server) bypasses RLS.
DROP POLICY IF EXISTS business_private_covers_read_fence ON storage.objects;
CREATE POLICY business_private_covers_read_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (bucket_id <> 'business-private-covers');
DROP POLICY IF EXISTS business_private_covers_insert_fence ON storage.objects;
CREATE POLICY business_private_covers_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id <> 'business-private-covers');
DROP POLICY IF EXISTS business_private_covers_update_fence ON storage.objects;
CREATE POLICY business_private_covers_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (bucket_id <> 'business-private-covers') WITH CHECK (bucket_id <> 'business-private-covers');
DROP POLICY IF EXISTS business_private_covers_delete_fence ON storage.objects;
CREATE POLICY business_private_covers_delete_fence ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (bucket_id <> 'business-private-covers');

CREATE FUNCTION public.business_private_cover_ref_ok(p_ref text, p_practice_id uuid, p_audio_item_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_ref IS NOT NULL AND p_practice_id IS NOT NULL AND p_ref ~ (
    '^business-private-cover:practices/' || p_practice_id::text
    || CASE WHEN p_audio_item_id IS NULL THEN '' ELSE '/track-covers/' || p_audio_item_id::text END
    || '/variants/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+[.](webp|jpg|jpeg|png)$'
  );
$$;
REVOKE ALL ON FUNCTION public.business_private_cover_ref_ok(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_private_cover_ref_ok(text, uuid, uuid) TO service_role;

-- PR-C blocked every cover of a closed album. Now: only private references, no manifest
-- (public variants), and no private reference on ordinary albums. Gallery stays blocked.
CREATE OR REPLACE FUNCTION public.guard_business_only_public_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid;
  v_business boolean;
BEGIN
  IF TG_TABLE_NAME = 'practices' THEN
    IF NEW.business_only THEN
      -- Checked on insert, on change and when an album becomes business-only.
      IF TG_OP = 'INSERT' OR NOT COALESCE(OLD.business_only, false)
         OR NEW.cover_url IS DISTINCT FROM OLD.cover_url
         OR NEW.cover_image IS DISTINCT FROM OLD.cover_image THEN
        IF NEW.cover_image IS NOT NULL
           OR (NEW.cover_url IS NOT NULL AND NOT public.business_private_cover_ref_ok(NEW.cover_url, NEW.id, NULL)) THEN
          RAISE EXCEPTION 'business_only_cover_must_be_private' USING ERRCODE = '42501';
        END IF;
      END IF;
    ELSIF NEW.cover_url LIKE 'business-private-cover:%'
          AND (TG_OP = 'INSERT' OR NEW.cover_url IS DISTINCT FROM OLD.cover_url) THEN
      RAISE EXCEPTION 'private_cover_requires_business_only' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'audio_items' THEN
    IF (NEW.cover_url IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_url IS DISTINCT FROM OLD.cover_url))
       OR (NEW.cover_image IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cover_image IS DISTINCT FROM OLD.cover_image)) THEN
      v_business := public.practice_is_business_only(NEW.practice_id);
      IF v_business THEN
        IF NEW.cover_image IS NOT NULL
           OR (NEW.cover_url IS NOT NULL AND NOT public.business_private_cover_ref_ok(NEW.cover_url, NEW.practice_id, NEW.id)) THEN
          RAISE EXCEPTION 'business_only_cover_must_be_private' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.cover_url LIKE 'business-private-cover:%' THEN
        RAISE EXCEPTION 'private_cover_requires_business_only' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  ELSE -- publication_gallery_slides: the gallery stays public-only, so closed albums have none.
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

-- Minimal readiness change: same v8 checks plus the private cover rule.
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
  -- 39a7ef48 PR-D: business-only albums need a private cover reference; others never use one.
  IF COALESCE(v_practice.business_only, false) THEN
    IF NOT public.business_private_cover_ref_ok(v_practice.cover_url, v_practice.id, NULL) THEN
      RAISE EXCEPTION 'product_not_ready'
        USING ERRCODE = '22023', DETAIL = 'business_only_cover_not_private';
    END IF;
  ELSIF v_practice.cover_url LIKE 'business-private-cover:%' THEN
    RAISE EXCEPTION 'product_not_ready'
      USING ERRCODE = '22023', DETAIL = 'private_cover_on_public_product';
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
  'audiolad:internal-moderation-readiness:v9; v8 + business-only albums require a private cover reference';

COMMIT;
