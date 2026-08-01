BEGIN;

-- ---------------------------------------------------------------------------
-- Author product moderation email outbox
--
-- Hardened durable outbox for the two moderation outcomes that require an
-- author to act or that change what an author's product page shows:
--   * changes_requested        — product is NOT published; author must edit.
--   * approved_and_published   — product is now live.
--
-- These are mandatory operational notifications, not a marketing channel.
-- No other moderation/lifecycle action (submitted, resubmitted,
-- submission_withdrawn, unpublished, republished, edit_mode_started,
-- deleted, migration_backfill) ever enqueues an author email from here, and
-- this migration does not add any admin-facing alert email.
--
-- Design inspired by the historical hardened-outbox work (branch tip
-- migrations referred to internally as 88279f01 / 84c2fdfb / 147000) and by
-- the sibling `author_sale_email_outbox` (20260730160000_author_canonical_
-- sales.sql), adapted so the current moderation lifecycle RPCs
-- (submit_practice_for_moderation, request_practice_changes,
-- approve_and_publish_practice, ...) are untouched and keep returning
-- `practices` rows. Enqueue happens exclusively inside
-- `log_practice_moderation_event`, which every lifecycle RPC already calls
-- to append the append-only history row.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_moderation_email_outbox (
  -- One outbox row per moderation event. Because
  -- `practice_moderation_events` is append-only and a fresh row is created
  -- on every action, this primary key makes enqueue naturally idempotent
  -- without needing an application-supplied idempotency key.
  event_id uuid PRIMARY KEY
    REFERENCES public.practice_moderation_events (id) ON DELETE RESTRICT,
  practice_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE RESTRICT,
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE RESTRICT,

  action text NOT NULL
    CHECK (action IN ('changes_requested', 'approved_and_published')),

  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending', 'processing', 'retryable', 'sent', 'failed_permanent', 'cancelled'
      )
    ),

  -- Recipient contract: author_members.role = owner only. Editors never
  -- receive this mail. Snapshot the resolved contact at enqueue time so a
  -- later profile change cannot retroactively alter what was (or will be)
  -- sent.
  recipient_role text NOT NULL DEFAULT 'author_owner'
    CHECK (recipient_role = 'author_owner'),
  recipient_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  recipient_email text,

  -- URL snapshots + moderator comment for the template. Never contains
  -- recipient contact data.
  context jsonb NOT NULL DEFAULT '{}'::jsonb,

  claim_token uuid,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  error_code text,
  error_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT practice_moderation_email_outbox_error_message_len_check
    CHECK (error_message IS NULL OR char_length(error_message) <= 2000)
);

CREATE INDEX IF NOT EXISTS practice_moderation_email_outbox_due_idx
  ON public.practice_moderation_email_outbox (next_attempt_at)
  WHERE status IN ('pending', 'retryable');

CREATE INDEX IF NOT EXISTS practice_moderation_email_outbox_practice_idx
  ON public.practice_moderation_email_outbox (practice_id, created_at DESC);

ALTER TABLE public.practice_moderation_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.practice_moderation_email_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_moderation_email_outbox FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.practice_moderation_email_outbox TO service_role;

COMMENT ON TABLE public.practice_moderation_email_outbox IS
  'audiolad:practice-moderation-email-outbox:v1; mandatory operational author notifications for product moderation outcomes (changes_requested, approved_and_published) only. Not a marketing channel; no admin alerts. Enqueued only from log_practice_moderation_event.';

-- ---------------------------------------------------------------------------
-- Stale-delivery policy
--
--   changes_requested       cancelled if a later event on the same practice
--                            is resubmitted / approved_and_published /
--                            deleted, or the practice is soft-deleted.
--   approved_and_published  cancelled if the practice is soft-deleted, or is
--                            no longer status = published with
--                            moderation_status = approved.
-- ---------------------------------------------------------------------------

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

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_email_delivery_is_stale(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_email_delivery_is_stale(uuid) TO service_role;

COMMENT ON FUNCTION public.moderation_email_delivery_is_stale(uuid) IS
  'audiolad:practice-moderation-email-outbox:v1; true when the moderation state has moved on since this event and the queued email is no longer accurate.';

-- ---------------------------------------------------------------------------
-- Enqueue: replace log_practice_moderation_event to snapshot + enqueue for
-- the two in-scope actions only. Signature is unchanged so every existing
-- lifecycle RPC call site keeps working without modification.
-- ---------------------------------------------------------------------------

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
  v_author_slug text;
  v_owner_user_id uuid;
  v_recipient_email text;
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

  -- Author email notifications: STRICT product contract. Only these two
  -- actions ever enqueue mail; every other action (submitted, resubmitted,
  -- submission_withdrawn, unpublished, republished, edit_mode_started,
  -- deleted, migration_backfill) is intentionally silent here.
  IF p_action IN ('changes_requested', 'approved_and_published') THEN
    SELECT p.title, p.slug
    INTO v_practice_title, v_practice_slug
    FROM public.practices AS p
    WHERE p.id = p_practice_id;

    SELECT a.slug
    INTO v_author_slug
    FROM public.authors AS a
    WHERE a.id = p_author_id;

    -- Recipient contract: author_members.role = owner only, never editor.
    SELECT
      am.user_id,
      lower(coalesce(nullif(btrim(pr.contact_email), ''), nullif(btrim(pr.email), '')))
    INTO v_owner_user_id, v_recipient_email
    FROM public.author_members AS am
    INNER JOIN public.profiles AS pr ON pr.id = am.user_id
    WHERE am.author_id = p_author_id
      AND am.role = 'owner'
    LIMIT 1;

    -- Defensive format check; a malformed stored address is treated the
    -- same as a missing one.
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

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_practice_moderation_event(
  uuid, uuid, text, text, text, text, text, text, uuid, text, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_practice_moderation_event(
  uuid, uuid, text, text, text, text, text, text, uuid, text, integer, jsonb
) TO service_role;

-- ---------------------------------------------------------------------------
-- Worker RPCs: batch claim (lease + FOR UPDATE SKIP LOCKED) and single
-- completion call that folds retry/permanent-failure decisions server-side.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_practice_moderation_email_outbox(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.practice_moderation_email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 3600));
BEGIN
  -- Recover expired leases from a crashed/killed worker run.
  UPDATE public.practice_moderation_email_outbox
  SET status = 'retryable',
      claim_token = NULL,
      processing_started_at = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE status = 'processing' AND lease_expires_at <= now();

  -- Cancel deliveries whose moderation state has moved on before spending an
  -- SMTP attempt on a stale message.
  UPDATE public.practice_moderation_email_outbox AS o
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = 'moderation_state_advanced',
      claim_token = NULL,
      processing_started_at = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE o.status IN ('pending', 'retryable')
    AND public.moderation_email_delivery_is_stale(o.event_id);

  RETURN QUERY
  WITH due AS (
    SELECT event_id
    FROM public.practice_moderation_email_outbox
    WHERE status IN ('pending', 'retryable')
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.practice_moderation_email_outbox AS o
  SET status = 'processing',
      claim_token = gen_random_uuid(),
      processing_started_at = now(),
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      attempt_count = o.attempt_count + 1,
      updated_at = now()
  FROM due
  WHERE o.event_id = due.event_id
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_practice_moderation_email_outbox(
  p_event_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.practice_moderation_email_outbox%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'invalid_outcome' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.practice_moderation_email_outbox
  WHERE event_id = p_event_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_outcome = 'sent' THEN
    UPDATE public.practice_moderation_email_outbox
    SET status = 'sent',
        sent_at = now(),
        error_code = NULL,
        error_message = NULL,
        claim_token = NULL,
        processing_started_at = NULL,
        lease_expires_at = NULL,
        updated_at = now()
    WHERE event_id = p_event_id;

    RETURN true;
  END IF;

  -- p_outcome = 'failed': retry with backoff, or park permanently once the
  -- attempt budget is exhausted.
  IF v_row.attempt_count >= v_row.max_attempts THEN
    UPDATE public.practice_moderation_email_outbox
    SET status = 'failed_permanent',
        error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'send_failed'), 100),
        error_message = left(coalesce(nullif(btrim(p_error_message), ''), ''), 2000),
        claim_token = NULL,
        processing_started_at = NULL,
        lease_expires_at = NULL,
        updated_at = now()
    WHERE event_id = p_event_id;
  ELSE
    UPDATE public.practice_moderation_email_outbox
    SET status = 'retryable',
        next_attempt_at = now() + make_interval(
          secs => least(21600, 60 * (2 ^ greatest(0, v_row.attempt_count - 1))::integer)
        ),
        error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'send_failed'), 100),
        error_message = left(coalesce(nullif(btrim(p_error_message), ''), ''), 2000),
        claim_token = NULL,
        processing_started_at = NULL,
        lease_expires_at = NULL,
        updated_at = now()
    WHERE event_id = p_event_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_practice_moderation_email_outbox(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_practice_moderation_email_outbox(integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_practice_moderation_email_outbox(
  uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_practice_moderation_email_outbox(
  uuid, uuid, text, text, text
) TO service_role;

COMMIT;
