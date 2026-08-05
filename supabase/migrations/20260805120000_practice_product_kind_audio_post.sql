BEGIN;

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_product_kind_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_product_kind_check
  CHECK (product_kind IN ('practice', 'music', 'audio_post'));

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_music_usage_permission_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_music_usage_permission_check
  CHECK (
    (product_kind IN ('practice', 'audio_post') AND music_usage_permission IS NULL)
    OR (
      product_kind = 'music'
      AND (
        music_usage_permission IS NULL
        OR music_usage_permission IN ('listen_only', 'platform_reuse_allowed')
      )
    )
  );

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS promo_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_title text NULL,
  ADD COLUMN IF NOT EXISTS promo_text text NULL,
  ADD COLUMN IF NOT EXISTS promo_button_text text NULL,
  ADD COLUMN IF NOT EXISTS promo_url text NULL,
  ADD COLUMN IF NOT EXISTS promo_open_in_new_tab boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.practices.product_kind IS
  'audiolad:product-kind:v2; practice | music | audio_post. Immutable after first publish (published_at set).';

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
  IF NULLIF(btrim(COALESCE(v_practice.description, '')), '') IS NULL THEN
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
  'audiolad:internal-moderation-readiness:v2; SECURITY DEFINER helper for trusted lifecycle RPCs only';

CREATE OR REPLACE FUNCTION public.author_has_published_free_product_for_commercial_gate(
  p_author_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.author_id = p_author_id
      AND p.deleted_at IS NULL
      AND p.status = 'published'
      AND p.is_free IS TRUE
      AND COALESCE(p.price, 0) = 0
      AND p.product_kind IN ('practice', 'music')
  );
$$;

COMMENT ON FUNCTION public.author_has_published_free_product_for_commercial_gate(uuid) IS
  'audiolad:commercial-application-free-product-gate:v2; true when author has at least one published free zero-price practice or music product.';

CREATE OR REPLACE FUNCTION public.log_practice_moderation_event(
  p_practice_id uuid,
  p_author_id uuid,
  p_action text,
  p_from_status text,
  p_to_status text,
  p_from_moderation_status text,
  p_to_moderation_status text,
  p_comment text,
  p_actor_user_id uuid,
  p_actor_type text,
  p_attempt integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_comment text;
  v_practice_title text;
  v_practice_slug text;
  v_product_kind text;
  v_is_free boolean;
  v_submitted_at timestamptz;
  v_author_slug text;
  v_author_name text;
  v_owner_user_id uuid;
  v_recipient_email text;
  v_audio_track_count integer;
  v_product_kind_label text;
  v_price_label text;
  v_submission_kind_label text;
  v_context jsonb;
BEGIN
  v_comment := NULLIF(btrim(COALESCE(p_comment, '')), '');

  INSERT INTO public.practice_moderation_events (
    practice_id, author_id, action, from_status, to_status,
    from_moderation_status, to_moderation_status, comment, actor_user_id,
    actor_type, attempt, metadata, created_at
  ) VALUES (
    p_practice_id, p_author_id, p_action, p_from_status, p_to_status,
    p_from_moderation_status, p_to_moderation_status, v_comment, p_actor_user_id,
    p_actor_type, p_attempt, COALESCE(p_metadata, '{}'::jsonb), clock_timestamp()
  ) RETURNING id INTO v_id;

  IF p_action IN ('changes_requested', 'approved_and_published') THEN
    SELECT p.title, p.slug INTO v_practice_title, v_practice_slug
    FROM public.practices AS p WHERE p.id = p_practice_id;
    SELECT a.slug INTO v_author_slug FROM public.authors AS a WHERE a.id = p_author_id;
    SELECT am.user_id, lower(coalesce(nullif(btrim(pr.contact_email), ''), nullif(btrim(pr.email), '')))
    INTO v_owner_user_id, v_recipient_email
    FROM public.author_members AS am
    INNER JOIN public.profiles AS pr ON pr.id = am.user_id
    WHERE am.author_id = p_author_id AND am.role = 'owner'
    LIMIT 1;
    IF v_recipient_email IS NOT NULL
       AND v_recipient_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      v_recipient_email := NULL;
    END IF;
    v_context := jsonb_build_object(
      'product_title', v_practice_title,
      'author_dashboard_path', '/author-dashboard/products/' || p_practice_id::text || '?author=' || coalesce(v_author_slug, ''),
      'public_product_path', CASE WHEN v_author_slug IS NOT NULL AND v_practice_slug IS NOT NULL THEN '/practice/' || v_author_slug || '/' || v_practice_slug ELSE NULL END,
      'moderator_comment', CASE WHEN p_action = 'changes_requested' THEN v_comment ELSE NULL END
    );
    INSERT INTO public.practice_moderation_email_outbox (
      event_id, practice_id, author_id, action, recipient_role, recipient_user_id,
      recipient_email, context, status, error_code, error_message
    ) VALUES (
      v_id, p_practice_id, p_author_id, p_action, 'author_owner', v_owner_user_id,
      v_recipient_email, v_context,
      CASE WHEN v_recipient_email IS NULL THEN 'failed_permanent' ELSE 'pending' END,
      CASE WHEN v_recipient_email IS NULL THEN 'recipient_missing' ELSE NULL END,
      CASE WHEN v_recipient_email IS NULL THEN 'No usable owner contact email at enqueue time.' ELSE NULL END
    );
  END IF;

  IF p_action IN ('submitted', 'resubmitted') THEN
    SELECT p.title, p.product_kind, COALESCE(p.is_free, false), p.moderation_submitted_at
    INTO v_practice_title, v_product_kind, v_is_free, v_submitted_at
    FROM public.practices AS p WHERE p.id = p_practice_id;
    SELECT a.name INTO v_author_name FROM public.authors AS a WHERE a.id = p_author_id;
    SELECT COUNT(*)::integer INTO v_audio_track_count
    FROM public.audio_items AS ai WHERE ai.practice_id = p_practice_id;
    v_product_kind_label := CASE
      WHEN v_product_kind = 'audio_post' THEN 'аудиопост'
      WHEN v_product_kind = 'music' AND v_audio_track_count >= 2 THEN 'альбом'
      WHEN v_product_kind = 'music' THEN 'музыка'
      ELSE 'аудиопрактика'
    END;
    v_price_label := CASE WHEN v_is_free THEN 'бесплатный' ELSE 'платный' END;
    v_submission_kind_label := CASE WHEN p_action = 'resubmitted' THEN 'повторная отправка' ELSE 'первая отправка' END;
    v_recipient_email := 'authors@audiolad.ru';
    v_context := jsonb_build_object(
      'product_id', p_practice_id::text,
      'product_title', v_practice_title,
      'author_name', v_author_name,
      'author_project_name', v_author_name,
      'product_kind_label', v_product_kind_label,
      'price_label', v_price_label,
      'audio_track_count', v_audio_track_count,
      'submission_kind_label', v_submission_kind_label,
      'submitted_at', v_submitted_at,
      'admin_review_path', '/admin/product-moderation/' || p_practice_id::text
    );
    INSERT INTO public.practice_moderation_email_outbox (
      event_id, practice_id, author_id, action, recipient_role, recipient_user_id,
      recipient_email, context, status, error_code, error_message
    ) VALUES (
      v_id, p_practice_id, p_author_id, p_action, 'platform_admin', NULL,
      v_recipient_email, v_context, 'pending', NULL, NULL
    );
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_practice_moderation_event(
  uuid, uuid, text, text, text, text, text, text, uuid, text, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_practice_moderation_event(
  uuid, uuid, text, text, text, text, text, text, uuid, text, integer, jsonb
) TO service_role;

COMMENT ON FUNCTION public.log_practice_moderation_event(
  uuid, uuid, text, text, text, text, text, text, uuid, text, integer, jsonb
) IS
  'audiolad:practice-moderation-email-outbox:v3; append-only moderation history plus durable email enqueue for author outcomes and admin submit/resubmit alerts.';

COMMIT;
