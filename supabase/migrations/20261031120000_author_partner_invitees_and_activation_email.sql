-- Partner cabinet visibility + activation email (no monetary ledger).
--
-- Pending invitees are existing author_referrals rows:
--   status = 'attributed', activated_at IS NULL, date = attributed_at.
-- Activated invitees use canonical activated_at / expires_at / invitee_author_id.
-- This migration does not change first-touch, the 60-day window, one-invitee-one-referrer,
-- immutability after activation, bonus slots, or commission calculation.
--
-- Email is enqueued only by an AFTER UPDATE trigger when activated_at
-- transitions from NULL to a timestamp and status becomes 'activated'
-- (the same statement finalize_author_partner_referral uses). Listener
-- registration inserts attributed rows and does not fire the trigger.
-- Exactly-once enqueue: UNIQUE (referral_id) + ON CONFLICT DO NOTHING.
-- A retry that returns already_activated does not update activated_at, so
-- the trigger does not run again.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Activation email outbox (same lease pattern as author_sale_email_outbox)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_partner_activation_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL
    REFERENCES public.author_referrals (id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  recipient_email text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'failed', 'sent', 'permanent_failure')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  lease_token uuid,
  processing_started_at timestamptz,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_partner_activation_email_outbox_referral_key UNIQUE (referral_id),
  CONSTRAINT author_partner_activation_email_outbox_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT author_partner_activation_email_outbox_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT author_partner_activation_email_outbox_recipient_email_check
    CHECK (
      char_length(recipient_email) <= 320
      AND position('@' in recipient_email) > 1
    )
);

CREATE INDEX IF NOT EXISTS author_partner_activation_email_outbox_due_idx
  ON public.author_partner_activation_email_outbox (next_attempt_at)
  WHERE status IN ('pending', 'failed');

COMMENT ON TABLE public.author_partner_activation_email_outbox IS
  'audiolad:author-partner:v4; exactly-once email when a referred listener first becomes an author. Payload has partner and public author names plus canonical activated_at/expires_at. No invitee email, no ledger.';

ALTER TABLE public.author_partner_activation_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.author_partner_activation_email_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.author_partner_activation_email_outbox FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.author_partner_activation_email_outbox TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Enqueue on the activation UPDATE only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_author_partner_activation_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_partner_name text;
  v_invitee_name text;
BEGIN
  IF TG_OP IS DISTINCT FROM 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- First activation only. Registration (INSERT attributed) never reaches here.
  IF OLD.activated_at IS NOT NULL
     OR NEW.activated_at IS NULL
     OR NEW.status IS DISTINCT FROM 'activated'
     OR NEW.invitee_author_id IS NULL
     OR NEW.expires_at IS NULL
     OR NEW.referrer_owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT
      coalesce(
        nullif(lower(btrim(p.contact_email)), ''),
        nullif(lower(btrim(p.email)), ''),
        nullif(lower(btrim(u.email)), '')
      ),
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(referrer.name), ''), 'партнёр')
    INTO v_email, v_partner_name
    FROM public.profiles AS p
    LEFT JOIN auth.users AS u ON u.id = p.id
    LEFT JOIN public.authors AS referrer ON referrer.id = NEW.referrer_author_id
    WHERE p.id = NEW.referrer_owner_user_id;

    IF v_partner_name IS NULL OR position('@' in v_partner_name) > 0 THEN
      v_partner_name := 'партнёр';
    END IF;

    SELECT coalesce(nullif(btrim(a.name), ''), 'Автор')
    INTO v_invitee_name
    FROM public.authors AS a
    WHERE a.id = NEW.invitee_author_id;

    IF v_invitee_name IS NULL OR position('@' in v_invitee_name) > 0 THEN
      v_invitee_name := 'Автор';
    END IF;

    IF v_email IS NULL OR position('@' in v_email) < 2 THEN
      RAISE LOG 'audiolad_partner_event %', jsonb_build_object(
        'event', 'partner_activation_email_skipped',
        'reason', 'referrer_email_missing',
        'referral_id', NEW.id
      );
      RETURN NEW;
    END IF;

    INSERT INTO public.author_partner_activation_email_outbox (
      referral_id,
      idempotency_key,
      recipient_email,
      payload
    ) VALUES (
      NEW.id,
      'partner_author_activated:' || NEW.id::text,
      v_email,
      jsonb_build_object(
        'partner_name', v_partner_name,
        'invitee_author_name', v_invitee_name,
        'activated_at', NEW.activated_at,
        'expires_at', NEW.expires_at
      )
    )
    ON CONFLICT (referral_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Email must not roll back activation, bonus, or immutability.
    RAISE LOG 'audiolad_partner_event %', jsonb_build_object(
      'event', 'partner_activation_email_enqueue_failed',
      'referral_id', NEW.id,
      'sqlstate', SQLSTATE
    );
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enqueue_author_partner_activation_email() IS
  'audiolad:author-partner:v4; AFTER UPDATE trigger. Enqueues one partner email when activated_at is first set. Does not change referral identity or bonus.';

REVOKE ALL ON FUNCTION public.enqueue_author_partner_activation_email()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_author_partner_activation_email()
  TO service_role;

DROP TRIGGER IF EXISTS author_referrals_enqueue_activation_email_trg
  ON public.author_referrals;
CREATE TRIGGER author_referrals_enqueue_activation_email_trg
  AFTER UPDATE OF activated_at, status ON public.author_referrals
  FOR EACH ROW
  WHEN (
    OLD.activated_at IS NULL
    AND NEW.activated_at IS NOT NULL
    AND NEW.status = 'activated'
  )
  EXECUTE FUNCTION public.enqueue_author_partner_activation_email();

-- ---------------------------------------------------------------------------
-- 3. Claim / complete / fail (service role worker)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_author_partner_activation_email_outbox(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.author_partner_activation_email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 3600));
BEGIN
  UPDATE public.author_partner_activation_email_outbox
  SET status = 'pending',
      lease_token = NULL,
      processing_started_at = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE status = 'processing'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at <= now();

  RETURN QUERY
  WITH due AS (
    SELECT o.id
    FROM public.author_partner_activation_email_outbox AS o
    WHERE o.status IN ('pending', 'failed')
      AND o.next_attempt_at <= now()
    ORDER BY o.next_attempt_at, o.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.author_partner_activation_email_outbox AS o
  SET status = 'processing',
      lease_token = gen_random_uuid(),
      processing_started_at = now(),
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      attempt_count = o.attempt_count + 1,
      updated_at = now()
  FROM due
  WHERE o.id = due.id
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_author_partner_activation_email_outbox(
  p_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH updated AS (
    UPDATE public.author_partner_activation_email_outbox
    SET status = 'sent',
        sent_at = now(),
        last_error = NULL,
        lease_token = NULL,
        processing_started_at = NULL,
        lease_expires_at = NULL,
        updated_at = now()
    WHERE id = p_id
      AND status = 'processing'
      AND lease_token = p_lease_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

CREATE OR REPLACE FUNCTION public.fail_author_partner_activation_email_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_error text,
  p_max_attempts integer DEFAULT 5
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH updated AS (
    UPDATE public.author_partner_activation_email_outbox
    SET status = CASE
          WHEN attempt_count >= greatest(1, p_max_attempts) THEN 'permanent_failure'
          ELSE 'failed'
        END,
        next_attempt_at = CASE
          WHEN attempt_count >= greatest(1, p_max_attempts) THEN next_attempt_at
          ELSE now() + make_interval(secs => least(21600, 60 * (2 ^ greatest(0, attempt_count - 1))::integer))
        END,
        last_error = left(coalesce(nullif(trim(p_error), ''), 'send_failed'), 2000),
        lease_token = NULL,
        processing_started_at = NULL,
        lease_expires_at = NULL,
        updated_at = now()
    WHERE id = p_id
      AND status = 'processing'
      AND lease_token = p_lease_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

REVOKE ALL ON FUNCTION public.claim_author_partner_activation_email_outbox(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_author_partner_activation_email_outbox(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_author_partner_activation_email_outbox(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_author_partner_activation_email_outbox(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_author_partner_activation_email_outbox(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_author_partner_activation_email_outbox(uuid, uuid, text, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Owner-only list of own invitees (no email, no auth ids)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_author_partner_invitees(p_author_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitees jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL OR NOT public.author_partner_is_owner(p_author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(s.item ORDER BY s.sort_at DESC), '[]'::jsonb)
  INTO v_invitees
  FROM (
    SELECT
      CASE
        WHEN r.activated_at IS NULL THEN r.attributed_at
        ELSE r.activated_at
      END AS sort_at,
      CASE
        WHEN r.activated_at IS NULL THEN
          jsonb_build_object(
            'state', 'pending',
            'registered_at', r.attributed_at
          )
        ELSE
          jsonb_build_object(
            'state', 'activated',
            'display_name', CASE
              WHEN a.name IS NULL OR btrim(a.name) = '' OR position('@' in a.name) > 0
                THEN 'Автор'
              ELSE btrim(a.name)
            END,
            'activated_at', r.activated_at,
            'expires_at', r.expires_at
          )
      END AS item
    FROM public.author_referrals AS r
    LEFT JOIN public.authors AS a ON a.id = r.invitee_author_id
    WHERE r.referrer_author_id = p_author_id
      AND (
        (r.activated_at IS NULL AND r.status = 'attributed')
        OR (
          r.activated_at IS NOT NULL
          AND r.expires_at IS NOT NULL
          AND r.status IN ('activated', 'expired')
        )
      )
  ) AS s;

  RETURN jsonb_build_object(
    'ok', true,
    'invitees', v_invitees
  );
END;
$$;

COMMENT ON FUNCTION public.list_author_partner_invitees(uuid) IS
  'audiolad:author-partner:v4; owner read of own referrals. Pending uses attributed_at. Activated uses canonical activated_at and expires_at plus public authors.name. No invitee email and no auth user ids.';

REVOKE ALL ON FUNCTION public.list_author_partner_invitees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_author_partner_invitees(uuid)
  TO authenticated, service_role;

COMMIT;
