BEGIN;

-- ---------------------------------------------------------------------------
-- Extend practice_moderation_email_outbox for admin submit/resubmit alerts.
--
-- Author-facing outcomes (changes_requested, approved_and_published) stay
-- unchanged. Additionally enqueue one admin alert per submitted/resubmitted
-- moderation event to authors@audiolad.ru. Idempotency remains event_id PK.
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_moderation_email_outbox
  DROP CONSTRAINT IF EXISTS practice_moderation_email_outbox_action_check;

ALTER TABLE public.practice_moderation_email_outbox
  ADD CONSTRAINT practice_moderation_email_outbox_action_check
  CHECK (
    action IN (
      'changes_requested',
      'approved_and_published',
      'submitted',
      'resubmitted'
    )
  );

ALTER TABLE public.practice_moderation_email_outbox
  DROP CONSTRAINT IF EXISTS practice_moderation_email_outbox_recipient_role_check;

ALTER TABLE public.practice_moderation_email_outbox
  ADD CONSTRAINT practice_moderation_email_outbox_recipient_role_check
  CHECK (recipient_role IN ('author_owner', 'platform_admin'));

COMMENT ON TABLE public.practice_moderation_email_outbox IS
  'audiolad:practice-moderation-email-outbox:v2; operational author notifications (changes_requested, approved_and_published) plus admin submit/resubmit alerts. Enqueued only from log_practice_moderation_event.';

CREATE OR REPLACE FUNCTION public.moderation_email_delivery_is_stale(
  p_event_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outbox public.practice_moderation_email_outbox%ROWTYPE;
  v_event public.practice_moderation_events%ROWTYPE;
  v_practice public.practices%ROWTYPE;
BEGIN
  SELECT * INTO v_outbox
  FROM public.practice_moderation_email_outbox
  WHERE event_id = p_event_id;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  SELECT * INTO v_event
  FROM public.practice_moderation_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  SELECT * INTO v_practice
  FROM public.practices
  WHERE id = v_event.practice_id;

  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL THEN
    RETURN true;
  END IF;

  IF v_outbox.action = 'changes_requested' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.practice_moderation_events AS e
      WHERE e.practice_id = v_event.practice_id
        AND e.id <> v_event.id
        AND e.created_at >= v_event.created_at
        AND e.action IN ('resubmitted', 'approved_and_published', 'deleted')
    );
  END IF;

  IF v_outbox.action = 'approved_and_published' THEN
    RETURN v_practice.status IS DISTINCT FROM 'published'
      OR v_practice.moderation_status IS DISTINCT FROM 'approved';
  END IF;

  -- Admin submit/resubmit alerts: only cancel when the practice is gone.
  IF v_outbox.action IN ('submitted', 'resubmitted') THEN
    RETURN false;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_email_delivery_is_stale(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_email_delivery_is_stale(uuid) TO service_role;

COMMENT ON FUNCTION public.moderation_email_delivery_is_stale(uuid) IS
  'audiolad:practice-moderation-email-outbox:v2; true when the moderation state has moved on since this event and the queued email is no longer accurate.';

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
    practice_id,
    author_id,
    action,
    from_status,
    to_status,
    from_moderation_status,
    to_moderation_status,
    comment,
    actor_user_id,
    actor_type,
    attempt,
    metadata,
    created_at
  )
  VALUES (
    p_practice_id,
    p_author_id,
    p_action,
    p_from_status,
    p_to_status,
    p_from_moderation_status,
    p_to_moderation_status,
    v_comment,
    p_actor_user_id,
    p_actor_type,
    p_attempt,
    COALESCE(p_metadata, '{}'::jsonb),
    clock_timestamp()
  )
  RETURNING id INTO v_id;

  -- Author email notifications: STRICT product contract.
  IF p_action IN ('changes_requested', 'approved_and_published') THEN
    SELECT p.title, p.slug
    INTO v_practice_title, v_practice_slug
    FROM public.practices AS p
    WHERE p.id = p_practice_id;

    SELECT a.slug
    INTO v_author_slug
    FROM public.authors AS a
    WHERE a.id = p_author_id;

    SELECT
      am.user_id,
      lower(coalesce(nullif(btrim(pr.contact_email), ''), nullif(btrim(pr.email), '')))
    INTO v_owner_user_id, v_recipient_email
    FROM public.author_members AS am
    INNER JOIN public.profiles AS pr ON pr.id = am.user_id
    WHERE am.author_id = p_author_id
      AND am.role = 'owner'
    LIMIT 1;

    IF v_recipient_email IS NOT NULL
       AND v_recipient_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      v_recipient_email := NULL;
    END IF;

    v_context := jsonb_build_object(
      'product_title', v_practice_title,
      'author_dashboard_path',
        '/author-dashboard/products/' || p_practice_id::text
          || '?author=' || coalesce(v_author_slug, ''),
      'public_product_path',
        CASE
          WHEN v_author_slug IS NOT NULL AND v_practice_slug IS NOT NULL
            THEN '/practice/' || v_author_slug || '/' || v_practice_slug
          ELSE NULL
        END,
      'moderator_comment',
        CASE WHEN p_action = 'changes_requested' THEN v_comment ELSE NULL END
    );

    INSERT INTO public.practice_moderation_email_outbox (
      event_id,
      practice_id,
      author_id,
      action,
      recipient_role,
      recipient_user_id,
      recipient_email,
      context,
      status,
      error_code,
      error_message
    )
    VALUES (
      v_id,
      p_practice_id,
      p_author_id,
      p_action,
      'author_owner',
      v_owner_user_id,
      v_recipient_email,
      v_context,
      CASE WHEN v_recipient_email IS NULL THEN 'failed_permanent' ELSE 'pending' END,
      CASE WHEN v_recipient_email IS NULL THEN 'recipient_missing' ELSE NULL END,
      CASE
        WHEN v_recipient_email IS NULL
          THEN 'No usable owner contact email at enqueue time.'
        ELSE NULL
      END
    );
  END IF;

  -- Admin alerts: first submit and resubmit after changes_requested.
  IF p_action IN ('submitted', 'resubmitted') THEN
    SELECT
      p.title,
      p.product_kind,
      COALESCE(p.is_free, false),
      p.moderation_submitted_at
    INTO
      v_practice_title,
      v_product_kind,
      v_is_free,
      v_submitted_at
    FROM public.practices AS p
    WHERE p.id = p_practice_id;

    SELECT a.name
    INTO v_author_name
    FROM public.authors AS a
    WHERE a.id = p_author_id;

    SELECT COUNT(*)::integer
    INTO v_audio_track_count
    FROM public.audio_items AS ai
    WHERE ai.practice_id = p_practice_id;

    v_product_kind_label := CASE
      WHEN v_product_kind = 'music' AND v_audio_track_count >= 2 THEN 'альбом'
      WHEN v_product_kind = 'music' THEN 'музыка'
      ELSE 'аудиопрактика'
    END;

    v_price_label := CASE
      WHEN v_is_free THEN 'бесплатный'
      ELSE 'платный'
    END;

    v_submission_kind_label := CASE
      WHEN p_action = 'resubmitted' THEN 'повторная отправка'
      ELSE 'первая отправка'
    END;

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
      event_id,
      practice_id,
      author_id,
      action,
      recipient_role,
      recipient_user_id,
      recipient_email,
      context,
      status,
      error_code,
      error_message
    )
    VALUES (
      v_id,
      p_practice_id,
      p_author_id,
      p_action,
      'platform_admin',
      NULL,
      v_recipient_email,
      v_context,
      'pending',
      NULL,
      NULL
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
  'audiolad:practice-moderation-email-outbox:v2; append-only moderation history plus durable email enqueue for author outcomes and admin submit/resubmit alerts.';

COMMIT;
