-- Day-5 SEO reservation reminder for authors.
-- Unified path: public.seo_query_reservations (regular + sprint/marathon).
-- Does not change 7-day expiry / expire_seo_query_reservation semantics.
-- Claim/lease comparisons use clock_timestamp().

ALTER TABLE public.seo_query_reservations
  ADD COLUMN IF NOT EXISTS reminder_5d_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reminder_5d_lease_token uuid NULL,
  ADD COLUMN IF NOT EXISTS reminder_5d_lease_until timestamptz NULL;

COMMENT ON COLUMN public.seo_query_reservations.reminder_5d_sent_at IS
  'Set once when the day-5 reminder email is sent or permanently skipped (missing email). Max one reminder per reservation.';
COMMENT ON COLUMN public.seo_query_reservations.reminder_5d_lease_token IS
  'Transient claim token while the reminder worker sends mail.';
COMMENT ON COLUMN public.seo_query_reservations.reminder_5d_lease_until IS
  'Lease expiry for reminder_5d_lease_token; clock_timestamp()-based.';

CREATE INDEX IF NOT EXISTS seo_query_reservations_5d_reminder_due_idx
  ON public.seo_query_reservations (reserved_at)
  WHERE status = 'active' AND reminder_5d_sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.seo_reservation_blocks_5d_reminder(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.id = p_product_id
      AND p.deleted_at IS NULL
      AND (
        p.status = 'published'
        OR p.moderation_status NOT IN ('not_submitted', 'changes_requested')
      )
  );
$$;

COMMENT ON FUNCTION public.seo_reservation_blocks_5d_reminder(uuid) IS
  'True when the linked product is published or already submitted to moderation (submitted/approved).';

CREATE OR REPLACE FUNCTION public.claim_seo_reservation_5d_reminders(
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  reservation_id uuid,
  author_id uuid,
  query_id uuid,
  query_text text,
  expires_at timestamptz,
  reserved_at timestamptz,
  recipient_email text,
  lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
  v_lease_seconds integer := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 300), 900));
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT r.id
    FROM public.seo_query_reservations AS r
    WHERE r.status = 'active'
      AND r.reminder_5d_sent_at IS NULL
      AND (
        r.reminder_5d_lease_until IS NULL
        OR r.reminder_5d_lease_until < clock_timestamp()
      )
      AND r.reserved_at <= clock_timestamp() - interval '5 days'
      AND (r.expires_at IS NULL OR r.expires_at > clock_timestamp())
      AND (
        r.product_id IS NULL
        OR NOT public.seo_reservation_blocks_5d_reminder(r.product_id)
      )
    ORDER BY r.reserved_at ASC
    FOR UPDATE OF r SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.seo_query_reservations AS r
    SET
      reminder_5d_lease_token = gen_random_uuid(),
      reminder_5d_lease_until = clock_timestamp() + make_interval(secs => v_lease_seconds),
      updated_at = clock_timestamp()
    FROM due
    WHERE r.id = due.id
    RETURNING
      r.id,
      r.author_id,
      r.query_id,
      r.expires_at,
      r.reserved_at,
      r.reminder_5d_lease_token
  )
  SELECT
    c.id AS reservation_id,
    c.author_id,
    c.query_id,
    q.query_text,
    c.expires_at,
    c.reserved_at,
    (
      SELECT lower(coalesce(nullif(btrim(pr.contact_email), ''), nullif(btrim(pr.email), '')))
      FROM public.author_members AS am
      INNER JOIN public.profiles AS pr ON pr.id = am.user_id
      WHERE am.author_id = c.author_id
        AND am.role = 'owner'
      LIMIT 1
    ) AS recipient_email,
    c.reminder_5d_lease_token AS lease_token
  FROM claimed AS c
  INNER JOIN public.seo_queries AS q ON q.id = c.query_id;
END;
$$;

COMMENT ON FUNCTION public.claim_seo_reservation_5d_reminders(integer, integer) IS
  'Atomically claim active SEO reservations due for the day-5 author reminder. Lease uses clock_timestamp().';

CREATE OR REPLACE FUNCTION public.complete_seo_reservation_5d_reminder(
  p_reservation_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.seo_query_reservations
  SET
    reminder_5d_sent_at = clock_timestamp(),
    reminder_5d_lease_token = NULL,
    reminder_5d_lease_until = NULL,
    updated_at = clock_timestamp()
  WHERE id = p_reservation_id
    AND reminder_5d_lease_token IS NOT DISTINCT FROM p_lease_token
    AND reminder_5d_sent_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_seo_reservation_5d_reminder(
  p_reservation_id uuid,
  p_lease_token uuid,
  p_permanent boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF COALESCE(p_permanent, false) THEN
    -- Missing/invalid email: mark handled so we never retry or double-send.
    UPDATE public.seo_query_reservations
    SET
      reminder_5d_sent_at = clock_timestamp(),
      reminder_5d_lease_token = NULL,
      reminder_5d_lease_until = NULL,
      updated_at = clock_timestamp()
    WHERE id = p_reservation_id
      AND reminder_5d_lease_token IS NOT DISTINCT FROM p_lease_token
      AND reminder_5d_sent_at IS NULL;
  ELSE
    -- Transient SMTP failure: release lease for a later retry; never set sent_at.
    UPDATE public.seo_query_reservations
    SET
      reminder_5d_lease_token = NULL,
      reminder_5d_lease_until = NULL,
      updated_at = clock_timestamp()
    WHERE id = p_reservation_id
      AND reminder_5d_lease_token IS NOT DISTINCT FROM p_lease_token
      AND reminder_5d_sent_at IS NULL;
  END IF;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_seo_reservation_5d_reminder_candidates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_count
  FROM public.seo_query_reservations AS r
  WHERE r.status = 'active'
    AND r.reminder_5d_sent_at IS NULL
    AND r.reserved_at <= clock_timestamp() - interval '5 days'
    AND (r.expires_at IS NULL OR r.expires_at > clock_timestamp())
    AND (
      r.product_id IS NULL
      OR NOT public.seo_reservation_blocks_5d_reminder(r.product_id)
    );
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.seo_reservation_blocks_5d_reminder(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_seo_reservation_5d_reminders(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_seo_reservation_5d_reminder(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_seo_reservation_5d_reminder(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_seo_reservation_5d_reminder_candidates() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.seo_reservation_blocks_5d_reminder(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_seo_reservation_5d_reminders(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_seo_reservation_5d_reminder(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_seo_reservation_5d_reminder(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_seo_reservation_5d_reminder_candidates() TO service_role;
