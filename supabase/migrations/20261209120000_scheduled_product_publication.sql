-- Scheduled publication for moderated author products.
-- Authors choose an MSK release time before moderation; approval locks the
-- snapshot and either publishes immediately or leaves it approved/unpublished
-- until the service-role publisher releases it.
BEGIN;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz;

COMMENT ON COLUMN public.practices.scheduled_publish_at IS
  'Optional planned catalog release instant. Author UI enters Moscow time (MSK, UTC+3) and stores the absolute timestamptz.';

CREATE INDEX IF NOT EXISTS practices_due_scheduled_publish_idx
  ON public.practices (scheduled_publish_at)
  WHERE deleted_at IS NULL
    AND status = 'unpublished'
    AND moderation_status = 'approved'
    AND scheduled_publish_at IS NOT NULL;

-- Lock the release time together with the moderated snapshot. Server lifecycle
-- RPCs may clear it using the transaction-local allow flag.
CREATE OR REPLACE FUNCTION public.guard_practices_scheduled_publish_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Any trusted or author-side publish path must respect a future scheduled
  -- release. The service worker uses the explicit allow flag, but it only
  -- selects already-due rows.
  IF NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published'
     AND OLD.scheduled_publish_at IS NOT NULL THEN
    IF OLD.scheduled_publish_at > clock_timestamp()
       AND current_setting('audiolad.allow_scheduled_publish', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'scheduled_publish_not_due'
        USING ERRCODE = 'P0001',
          DETAIL = 'The approved product has a future scheduled publication time.';
    END IF;

    -- Keep the stored schedule as a pending-only field. This also makes a
    -- manual publish exactly at/after the due time converge to the same state
    -- as the background publisher.
    NEW.scheduled_publish_at := NULL;
  END IF;

  IF NEW.scheduled_publish_at IS NOT DISTINCT FROM OLD.scheduled_publish_at THEN
    RETURN NEW;
  END IF;

  IF current_setting('audiolad.allow_scheduled_publish', true) = 'on'
     OR current_setting('audiolad.allow_moderated_content_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.moderation_status = 'submitted'
     OR (OLD.status = 'unpublished' AND OLD.moderation_status = 'approved') THEN
    RAISE EXCEPTION 'moderated_content_locked'
      USING ERRCODE = 'P0001',
        DETAIL = 'Scheduled publication belongs to the moderated snapshot.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_practices_scheduled_publish_immutable_trigger
  ON public.practices;
CREATE TRIGGER guard_practices_scheduled_publish_immutable_trigger
  BEFORE UPDATE OF status, scheduled_publish_at ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_practices_scheduled_publish_immutable();

CREATE OR REPLACE FUNCTION public.approve_and_publish_practice(p_practice_id uuid)
RETURNS public.practices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_from_status text;
  v_from_moderation text;
  v_first_path text;
  v_seconds bigint;
  v_minutes integer;
  v_starter boolean;
  v_catalog_listed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices
  WHERE id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF v_practice.status NOT IN ('draft', 'unpublished')
     OR v_practice.moderation_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'invalid_status_for_approve' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.assert_practice_moderation_ready(p_practice_id);

  v_from_status := v_practice.status;
  v_from_moderation := v_practice.moderation_status;

  -- Future schedule: approve and freeze the exact reviewed snapshot, but do
  -- not expose it publicly yet.
  IF v_practice.scheduled_publish_at IS NOT NULL
     AND v_practice.scheduled_publish_at > clock_timestamp() THEN
    PERFORM set_config('audiolad.allow_practice_moderation_update', 'on', true);

    UPDATE public.practices
    SET
      status = 'unpublished',
      moderation_status = 'approved',
      moderation_review_comment = NULL,
      updated_at = now()
    WHERE id = p_practice_id
    RETURNING * INTO v_practice;

    PERFORM public.log_practice_moderation_event(
      v_practice.id,
      v_practice.author_id,
      'approved_scheduled',
      v_from_status,
      'unpublished',
      v_from_moderation,
      'approved',
      NULL,
      auth.uid(),
      'admin',
      v_practice.moderation_attempt,
      jsonb_build_object(
        'source', 'approve_and_publish_practice',
        'scheduled_publish_at', v_practice.scheduled_publish_at
      )
    );

    RETURN v_practice;
  END IF;

  -- No future schedule (or it already passed while moderation was pending):
  -- preserve the existing immediate-publish behavior.
  SELECT ai.audio_path
  INTO v_first_path
  FROM public.audio_items AS ai
  WHERE ai.practice_id = p_practice_id
    AND NULLIF(btrim(ai.audio_path), '') IS NOT NULL
  ORDER BY ai.position
  LIMIT 1;

  SELECT COALESCE(
    sum(public.music_item_effective_publish_duration_seconds(ai.id)),
    0
  )
  INTO v_seconds
  FROM public.audio_items AS ai
  WHERE ai.practice_id = p_practice_id
    AND (
      NULLIF(btrim(ai.audio_path), '') IS NOT NULL
      OR (
        v_practice.product_kind = 'music'
        AND public.music_item_has_validated_active_delivery(ai.id)
      )
    );

  v_minutes := CASE
    WHEN v_seconds > 0 THEN GREATEST(1, ceil(v_seconds::numeric / 60)::integer)
    ELSE NULL
  END;

  SELECT EXISTS (
    SELECT 1
    FROM public.starter_practices
    WHERE practice_id = p_practice_id
      AND is_active
  )
  INTO v_starter;

  v_catalog_listed := CASE
    WHEN v_starter THEN false
    ELSE COALESCE(v_practice.is_catalog_listed, true)
  END;

  PERFORM set_config('audiolad.allow_practice_publish', 'on', true);
  PERFORM set_config('audiolad.allow_practice_moderation_update', 'on', true);
  PERFORM set_config('audiolad.allow_moderated_content_update', 'on', true);
  PERFORM set_config('audiolad.allow_scheduled_publish', 'on', true);

  UPDATE public.audio_items
  SET status = 'published',
      updated_at = now()
  WHERE practice_id = p_practice_id;

  UPDATE public.practices
  SET
    status = 'published',
    moderation_status = 'approved',
    moderation_review_comment = NULL,
    is_catalog_listed = v_catalog_listed,
    published_at = COALESCE(published_at, now()),
    scheduled_publish_at = NULL,
    audio_url = v_first_path,
    duration_minutes = v_minutes,
    updated_at = now()
  WHERE id = p_practice_id
  RETURNING * INTO v_practice;

  PERFORM public.log_practice_moderation_event(
    v_practice.id,
    v_practice.author_id,
    'approved_and_published',
    v_from_status,
    'published',
    v_from_moderation,
    'approved',
    NULL,
    auth.uid(),
    'admin',
    v_practice.moderation_attempt,
    jsonb_build_object('source', 'approve_and_publish_practice')
  );

  RETURN v_practice;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_and_publish_practice(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_and_publish_practice(uuid)
  TO authenticated;

-- Service-role batch publisher. Each row is processed inside its own
-- subtransaction so one invalid/stale product cannot block other releases.
-- The partial index above makes the due scan cheap; SKIP LOCKED makes overlap
-- safe if a second worker starts during deployment.
CREATE OR REPLACE FUNCTION public.publish_due_scheduled_practices(
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  practice_id uuid,
  author_id uuid,
  practice_slug text,
  author_slug text,
  previous_status text,
  catalog_visibility text,
  is_catalog_listed boolean,
  was_first_publish boolean,
  published_count_before bigint,
  scheduled_at timestamptz,
  published_at timestamptz,
  result_status text,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_practice public.practices%ROWTYPE;
  v_first_path text;
  v_seconds bigint;
  v_minutes integer;
  v_starter boolean;
  v_catalog_listed boolean;
  v_author_slug text;
  v_count_before bigint;
  v_scheduled_at timestamptz;
  v_was_first boolean;
BEGIN
  FOR v_practice IN
    SELECT p.*
    FROM public.practices AS p
    WHERE p.deleted_at IS NULL
      AND p.status = 'unpublished'
      AND p.moderation_status = 'approved'
      AND p.scheduled_publish_at IS NOT NULL
      AND p.scheduled_publish_at <= clock_timestamp()
    ORDER BY p.scheduled_publish_at, p.id
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  LOOP
    v_scheduled_at := v_practice.scheduled_publish_at;
    v_was_first := v_practice.published_at IS NULL;

    BEGIN
      PERFORM public.assert_practice_moderation_ready(v_practice.id);

      SELECT a.slug
      INTO v_author_slug
      FROM public.authors AS a
      WHERE a.id = v_practice.author_id;

      SELECT count(*)::bigint
      INTO v_count_before
      FROM public.practices AS existing
      WHERE existing.author_id = v_practice.author_id
        AND existing.status = 'published'
        AND existing.id <> v_practice.id;

      SELECT ai.audio_path
      INTO v_first_path
      FROM public.audio_items AS ai
      WHERE ai.practice_id = v_practice.id
        AND NULLIF(btrim(ai.audio_path), '') IS NOT NULL
      ORDER BY ai.position
      LIMIT 1;

      SELECT COALESCE(
        sum(public.music_item_effective_publish_duration_seconds(ai.id)),
        0
      )
      INTO v_seconds
      FROM public.audio_items AS ai
      WHERE ai.practice_id = v_practice.id
        AND (
          NULLIF(btrim(ai.audio_path), '') IS NOT NULL
          OR (
            v_practice.product_kind = 'music'
            AND public.music_item_has_validated_active_delivery(ai.id)
          )
        );

      v_minutes := CASE
        WHEN v_seconds > 0 THEN GREATEST(1, ceil(v_seconds::numeric / 60)::integer)
        ELSE NULL
      END;

      SELECT EXISTS (
        SELECT 1
        FROM public.starter_practices
        WHERE practice_id = v_practice.id
          AND is_active
      )
      INTO v_starter;

      v_catalog_listed := CASE
        WHEN v_starter THEN false
        ELSE COALESCE(v_practice.is_catalog_listed, true)
      END;

      PERFORM set_config('audiolad.allow_practice_publish', 'on', true);
      PERFORM set_config('audiolad.allow_moderated_content_update', 'on', true);
      PERFORM set_config('audiolad.allow_scheduled_publish', 'on', true);

      UPDATE public.audio_items
      SET status = 'published',
          updated_at = now()
      WHERE practice_id = v_practice.id;

      UPDATE public.practices
      SET
        status = 'published',
        is_catalog_listed = v_catalog_listed,
        published_at = COALESCE(published_at, v_scheduled_at, now()),
        scheduled_publish_at = NULL,
        audio_url = v_first_path,
        duration_minutes = v_minutes,
        updated_at = now()
      WHERE id = v_practice.id
        AND status = 'unpublished'
        AND moderation_status = 'approved'
        AND scheduled_publish_at = v_scheduled_at
      RETURNING * INTO v_practice;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'lifecycle_state_changed' USING ERRCODE = 'P0001';
      END IF;

      -- Reuse the existing published outcome event so the durable moderation
      -- email outbox sends the already-canonical "published" notification at
      -- the actual release, not at the earlier scheduling approval.
      PERFORM public.log_practice_moderation_event(
        v_practice.id,
        v_practice.author_id,
        'approved_and_published',
        'unpublished',
        'published',
        'approved',
        'approved',
        NULL,
        NULL,
        'system',
        v_practice.moderation_attempt,
        jsonb_build_object(
          'source', 'scheduled_product_publisher',
          'scheduled_publish_at', v_scheduled_at
        )
      );

      RETURN QUERY
      SELECT
        v_practice.id,
        v_practice.author_id,
        v_practice.slug,
        v_author_slug,
        'unpublished'::text,
        v_practice.catalog_visibility::text,
        v_practice.is_catalog_listed,
        v_was_first,
        v_count_before,
        v_scheduled_at,
        v_practice.published_at,
        'published'::text,
        NULL::text;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        v_practice.id,
        v_practice.author_id,
        v_practice.slug,
        v_author_slug,
        'unpublished'::text,
        v_practice.catalog_visibility::text,
        v_practice.is_catalog_listed,
        v_was_first,
        v_count_before,
        v_scheduled_at,
        NULL::timestamptz,
        'failed'::text,
        SQLSTATE::text;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_due_scheduled_practices(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_due_scheduled_practices(integer)
  TO service_role;

COMMENT ON FUNCTION public.publish_due_scheduled_practices(integer) IS
  'Service-role-only idempotent batch publisher for approved products whose scheduled_publish_at is due.';

COMMIT;
