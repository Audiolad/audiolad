-- Admin author mailings V1.
-- Adds campaign snapshot tables and a lease-based worker for public.email_outbox.
-- Does not alter author_sale_email_outbox or author_partner_activation_email_outbox.

BEGIN;

INSERT INTO public.platform_permissions (code, description) VALUES
  ('mailings.view', 'View author mailing campaigns'),
  ('mailings.manage', 'Create and edit mailing drafts'),
  ('mailings.send', 'Send a test or launch a mailing campaign')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_code, permission_code)
SELECT 'owner', permission.code
FROM public.platform_permissions AS permission
WHERE permission.code IN ('mailings.view', 'mailings.manage', 'mailings.send')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NULL,
  audience_type text NOT NULL,
  message_type text NOT NULL,
  sender_identity text NOT NULL,
  subject text NOT NULL,
  preheader text NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  filter jsonb NOT NULL DEFAULT '{"version":1,"kind":"all_authors"}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  launched_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  recipient_total integer NOT NULL DEFAULT 0,
  recipient_queued integer NOT NULL DEFAULT 0,
  recipient_sent integer NOT NULL DEFAULT 0,
  recipient_failed integer NOT NULL DEFAULT 0,
  recipient_suppressed integer NOT NULL DEFAULT 0,
  recipient_excluded integer NOT NULL DEFAULT 0,
  CONSTRAINT email_campaigns_audience_type_check
    CHECK (audience_type IN ('authors', 'listeners')),
  CONSTRAINT email_campaigns_message_type_check
    CHECK (message_type IN (
      'author_operational',
      'author_marketing',
      'listener_operational',
      'listener_marketing'
    )),
  CONSTRAINT email_campaigns_sender_identity_check
    CHECK (sender_identity IN ('authors', 'listeners', 'support')),
  CONSTRAINT email_campaigns_status_check
    CHECK (status IN (
      'draft',
      'queued',
      'sending',
      'sent',
      'partially_failed',
      'failed',
      'cancelled'
    )),
  CONSTRAINT email_campaigns_content_object_check
    CHECK (jsonb_typeof(content) = 'object'),
  CONSTRAINT email_campaigns_filter_object_check
    CHECK (jsonb_typeof(filter) = 'object'),
  CONSTRAINT email_campaigns_subject_check
    CHECK (char_length(btrim(subject)) > 0 AND position(E'\n' IN subject) = 0 AND position(E'\r' IN subject) = 0)
);

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns (id) ON DELETE CASCADE,
  contact_id uuid NULL REFERENCES public.email_contacts (id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  author_id uuid NULL,
  email text NOT NULL,
  normalized_email text NOT NULL,
  display_name text NULL,
  first_name text NULL,
  status text NOT NULL,
  suppression_reason text NULL,
  outbox_id uuid NULL,
  provider_message_id text NULL,
  error_code text NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_campaign_recipients_status_check
    CHECK (status IN ('queued', 'sent', 'failed', 'suppressed', 'excluded', 'cancelled')),
  CONSTRAINT email_campaign_recipients_email_check
    CHECK (char_length(btrim(email)) > 0 AND position(E'\n' IN email) = 0),
  CONSTRAINT email_campaign_recipients_campaign_email_key
    UNIQUE (campaign_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS email_campaigns_created_at_idx
  ON public.email_campaigns (created_at DESC);

CREATE INDEX IF NOT EXISTS email_campaign_recipients_campaign_status_idx
  ON public.email_campaign_recipients (campaign_id, status);

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS campaign_recipient_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_outbox_campaign_id_fkey'
  ) THEN
    ALTER TABLE public.email_outbox
      ADD CONSTRAINT email_outbox_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_outbox_campaign_recipient_id_fkey'
  ) THEN
    ALTER TABLE public.email_outbox
      ADD CONSTRAINT email_outbox_campaign_recipient_id_fkey
      FOREIGN KEY (campaign_recipient_id) REFERENCES public.email_campaign_recipients (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_deduplication_key_uidx
  ON public.email_outbox (deduplication_key)
  WHERE deduplication_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_outbox_due_claim_idx
  ON public.email_outbox (scheduled_at, created_at)
  WHERE status = 'pending';

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_campaigns FROM PUBLIC;
REVOKE ALL ON TABLE public.email_campaign_recipients FROM PUBLIC;
REVOKE ALL ON TABLE public.email_campaigns FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_campaign_recipients FROM anon, authenticated;
GRANT ALL ON TABLE public.email_campaigns TO service_role;
GRANT ALL ON TABLE public.email_campaign_recipients TO service_role;

COMMENT ON TABLE public.email_campaigns IS
  'Manual admin mailings. Recipient snapshot is immutable after launch. Direct client access is closed.';
COMMENT ON TABLE public.email_campaign_recipients IS
  'Immutable recipient snapshot for one campaign launch. One recipient email is one outbox row.';

CREATE OR REPLACE FUNCTION public.recompute_email_campaign_counters(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_total integer;
  v_queued integer;
  v_sent integer;
  v_failed integer;
  v_suppressed integer;
  v_excluded integer;
  v_phase text;
BEGIN
  SELECT status
  INTO v_status
  FROM public.email_campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND OR v_status = 'draft' THEN
    RETURN;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE status = 'queued')::integer,
    count(*) FILTER (WHERE status = 'sent')::integer,
    count(*) FILTER (WHERE status = 'failed')::integer,
    count(*) FILTER (WHERE status = 'suppressed')::integer,
    count(*) FILTER (WHERE status IN ('excluded', 'cancelled'))::integer
  INTO v_total, v_queued, v_sent, v_failed, v_suppressed, v_excluded
  FROM public.email_campaign_recipients
  WHERE campaign_id = p_campaign_id;

  IF v_queued > 0 THEN
    IF v_sent > 0 OR v_failed > 0 THEN
      v_phase := 'sending';
    ELSE
      v_phase := 'queued';
    END IF;
  ELSIF v_failed > 0 AND v_sent > 0 THEN
    v_phase := 'partially_failed';
  ELSIF v_failed > 0 THEN
    v_phase := 'failed';
  ELSE
    v_phase := 'sent';
  END IF;

  IF v_status = 'cancelled' THEN
    UPDATE public.email_campaigns
    SET
      recipient_total = v_total,
      recipient_queued = v_queued,
      recipient_sent = v_sent,
      recipient_failed = v_failed,
      recipient_suppressed = v_suppressed,
      recipient_excluded = v_excluded,
      updated_at = now()
    WHERE id = p_campaign_id;
    RETURN;
  END IF;

  UPDATE public.email_campaigns
  SET
    status = v_phase,
    recipient_total = v_total,
    recipient_queued = v_queued,
    recipient_sent = v_sent,
    recipient_failed = v_failed,
    recipient_suppressed = v_suppressed,
    recipient_excluded = v_excluded,
    started_at = CASE
      WHEN v_phase IN ('sending', 'sent', 'partially_failed', 'failed') THEN coalesce(started_at, now())
      ELSE started_at
    END,
    finished_at = CASE
      WHEN v_phase IN ('sent', 'partially_failed', 'failed') THEN coalesce(finished_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_email_campaign_launch(
  p_campaign_id uuid,
  p_actor uuid,
  p_recipients jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_pending uuid[];
BEGIN
  SELECT status
  INTO v_status
  FROM public.email_campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'pendingRecipientIds', '[]'::jsonb);
  END IF;

  IF v_status <> 'draft' THEN
    SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO v_pending
    FROM public.email_campaign_recipients
    WHERE campaign_id = p_campaign_id
      AND status = 'queued'
      AND outbox_id IS NULL;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'already_launched',
      'pendingRecipientIds', to_jsonb(v_pending)
    );
  END IF;

  INSERT INTO public.email_campaign_recipients (
    campaign_id,
    contact_id,
    user_id,
    author_id,
    email,
    normalized_email,
    display_name,
    first_name,
    status,
    suppression_reason
  )
  SELECT
    p_campaign_id,
    CASE
      WHEN item->>'contactId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (item->>'contactId')::uuid
      ELSE NULL
    END,
    CASE
      WHEN item->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (item->>'userId')::uuid
      ELSE NULL
    END,
    CASE
      WHEN item->>'authorId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (item->>'authorId')::uuid
      ELSE NULL
    END,
    btrim(item->>'email'),
    btrim(item->>'normalizedEmail'),
    nullif(btrim(item->>'displayName'), ''),
    nullif(btrim(item->>'firstName'), ''),
    item->>'status',
    nullif(btrim(item->>'suppressionReason'), '')
  FROM jsonb_array_elements(coalesce(p_recipients, '[]'::jsonb)) AS item
  WHERE item->>'status' IN ('queued', 'suppressed', 'excluded')
    AND char_length(btrim(coalesce(item->>'normalizedEmail', ''))) > 3
    AND position(E'\n' IN coalesce(item->>'email', '')) = 0
  ON CONFLICT (campaign_id, normalized_email) DO NOTHING;

  UPDATE public.email_campaigns
  SET
    status = 'queued',
    queued_at = now(),
    launched_by = p_actor,
    updated_at = now()
  WHERE id = p_campaign_id
    AND status = 'draft';

  PERFORM public.recompute_email_campaign_counters(p_campaign_id);

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO v_pending
  FROM public.email_campaign_recipients
  WHERE campaign_id = p_campaign_id
    AND status = 'queued'
    AND outbox_id IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'launched',
    'pendingRecipientIds', to_jsonb(v_pending)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_application_email_outbox(
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 50));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 900));
BEGIN
  UPDATE public.email_outbox
  SET
    status = 'pending',
    lease_token = NULL,
    lease_expires_at = NULL,
    locked_at = NULL,
    last_error_code = coalesce(last_error_code, 'lease_expired'),
    updated_at = now()
  WHERE status = 'processing'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at <= now();

  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.email_outbox
    WHERE status = 'pending'
      AND scheduled_at <= now()
    ORDER BY scheduled_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.email_outbox AS outbox
  SET
    status = 'processing',
    lease_token = gen_random_uuid(),
    locked_at = now(),
    lease_expires_at = now() + make_interval(secs => v_lease_seconds),
    attempt_count = outbox.attempt_count + 1,
    updated_at = now()
  FROM due
  WHERE outbox.id = due.id
  RETURNING outbox.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_application_email_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_provider_message_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient uuid;
  v_campaign uuid;
BEGIN
  UPDATE public.email_outbox
  SET
    status = 'sent',
    sent_at = now(),
    provider_message_id = nullif(btrim(coalesce(p_provider_message_id, '')), ''),
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE id = p_id
    AND status = 'processing'
    AND lease_token = p_lease_token
  RETURNING campaign_recipient_id, campaign_id
  INTO v_recipient, v_campaign;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.email_campaign_recipients
  SET
    status = 'sent',
    sent_at = now(),
    provider_message_id = nullif(btrim(coalesce(p_provider_message_id, '')), ''),
    updated_at = now()
  WHERE id = v_recipient
    AND status = 'queued';

  INSERT INTO public.email_delivery_events (outbox_id, event_type, provider, provider_message_id)
  VALUES (
    p_id,
    'sent',
    'smtp',
    nullif(btrim(coalesce(p_provider_message_id, '')), '')
  );

  IF v_campaign IS NOT NULL THEN
    PERFORM public.recompute_email_campaign_counters(v_campaign);
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_application_email_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.email_outbox%ROWTYPE;
  v_retry boolean;
BEGIN
  SELECT * INTO v_row
  FROM public.email_outbox
  WHERE id = p_id
    AND status = 'processing'
    AND lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'lost';
  END IF;

  v_retry := coalesce(p_retryable, true) AND v_row.attempt_count < v_row.max_attempts;

  IF v_retry THEN
    UPDATE public.email_outbox
    SET
      status = 'pending',
      scheduled_at = now() + make_interval(secs => least(3600, 60 * (2 ^ greatest(0, v_row.attempt_count - 1))::integer)),
      last_error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'send_failed'), 80),
      last_error_message = left(coalesce(p_error_message, ''), 500),
      lease_token = NULL,
      lease_expires_at = NULL,
      locked_at = NULL,
      updated_at = now()
    WHERE id = p_id;

    INSERT INTO public.email_delivery_events (outbox_id, event_type, provider)
    VALUES (p_id, 'deferred', 'smtp');
    RETURN 'retry';
  END IF;

  UPDATE public.email_outbox
  SET
    status = 'failed',
    failed_at = now(),
    last_error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'send_failed'), 80),
    last_error_message = left(coalesce(p_error_message, ''), 500),
    lease_token = NULL,
    lease_expires_at = NULL,
    locked_at = NULL,
    updated_at = now()
  WHERE id = p_id;

  UPDATE public.email_campaign_recipients
  SET
    status = 'failed',
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'send_failed'), 80),
    error_message = left(coalesce(p_error_message, ''), 500),
    updated_at = now()
  WHERE id = v_row.campaign_recipient_id
    AND status = 'queued';

  INSERT INTO public.email_delivery_events (outbox_id, event_type, provider)
  VALUES (p_id, 'failed', 'smtp');

  IF v_row.campaign_id IS NOT NULL THEN
    PERFORM public.recompute_email_campaign_counters(v_row.campaign_id);
  END IF;

  RETURN 'failed';
END;
$$;

CREATE OR REPLACE FUNCTION public.suppress_application_email_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient uuid;
  v_campaign uuid;
BEGIN
  UPDATE public.email_outbox
  SET
    status = 'suppressed',
    last_error_code = left(coalesce(nullif(btrim(p_reason), ''), 'suppressed'), 80),
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE id = p_id
    AND status = 'processing'
    AND lease_token = p_lease_token
  RETURNING campaign_recipient_id, campaign_id
  INTO v_recipient, v_campaign;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.email_campaign_recipients
  SET status = 'suppressed', suppression_reason = left(coalesce(p_reason, 'suppressed'), 80), updated_at = now()
  WHERE id = v_recipient
    AND status = 'queued';

  INSERT INTO public.email_delivery_events (outbox_id, event_type, provider, metadata)
  VALUES (p_id, 'failed', 'smtp', jsonb_build_object('code', 'suppressed'));

  IF v_campaign IS NOT NULL THEN
    PERFORM public.recompute_email_campaign_counters(v_campaign);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_email_campaign_counters(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_email_campaign_launch(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_application_email_outbox(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_application_email_outbox(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_application_email_outbox(uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suppress_application_email_outbox(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.recompute_email_campaign_counters(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_email_campaign_launch(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_application_email_outbox(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_application_email_outbox(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_application_email_outbox(uuid, uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.suppress_application_email_outbox(uuid, uuid, text) TO service_role;

COMMENT ON TABLE public.email_outbox IS
  'Application email queue. Manual campaigns use claim_application_email_outbox. Author sale and partner activation keep their own outbox tables.';

COMMIT;
