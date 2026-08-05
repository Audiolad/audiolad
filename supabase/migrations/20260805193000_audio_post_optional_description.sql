-- Audio posts: description is optional for moderation/publish readiness.
-- practice and music keep the existing required-description rule.
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
  'audiolad:internal-moderation-readiness:v3; SECURITY DEFINER helper for trusted lifecycle RPCs only; audio_post description optional';
