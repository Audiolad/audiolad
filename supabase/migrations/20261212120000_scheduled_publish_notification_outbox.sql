-- Service-only claim, plus a durable search-notification outbox.
-- The stamp and the pending event commit together. A later server read
-- drains pending rows and marks them processed only after delivery.
-- anon and authenticated cannot execute the claim or read the outbox.

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_publish_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL UNIQUE REFERENCES public.practices (id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  practice_slug text NOT NULL,
  author_slug text NOT NULL,
  catalog_visibility text,
  is_catalog_listed boolean,
  published_at timestamptz NOT NULL,
  prior_public_count integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  leased_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT scheduled_publish_notification_outbox_status_check
    CHECK (status IN ('pending', 'leased', 'processed'))
);

COMMENT ON TABLE public.scheduled_publish_notification_outbox IS
  'One first-go-live search notification per practice. Inserted in the same transaction that stamps published_at. Not readable by anon or authenticated.';

CREATE INDEX IF NOT EXISTS scheduled_publish_notification_outbox_pending_idx
  ON public.scheduled_publish_notification_outbox (created_at)
  WHERE status IN ('pending', 'leased');

ALTER TABLE public.scheduled_publish_notification_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.scheduled_publish_notification_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.scheduled_publish_notification_outbox FROM anon;
REVOKE ALL ON TABLE public.scheduled_publish_notification_outbox FROM authenticated;

DROP FUNCTION IF EXISTS public.claim_due_scheduled_practice_publications();

CREATE FUNCTION public.claim_due_scheduled_practice_publications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed_count integer;
BEGIN
  WITH due AS (
    SELECT
      p.id,
      p.author_id,
      p.slug AS practice_slug,
      a.slug AS author_slug,
      p.catalog_visibility,
      p.is_catalog_listed,
      p.scheduled_publish_at,
      (
        SELECT count(*)::integer
        FROM public.practices AS other
        WHERE other.author_id = p.author_id
          AND other.id <> p.id
          AND other.deleted_at IS NULL
          AND other.published_at IS NOT NULL
          AND other.published_at <= now()
      ) AS prior_public_count
    FROM public.practices AS p
    INNER JOIN public.authors AS a ON a.id = p.author_id
    WHERE p.status = 'published'
      AND p.deleted_at IS NULL
      AND p.published_at IS NULL
      AND p.scheduled_publish_at IS NOT NULL
      AND p.scheduled_publish_at <= now()
      AND p.slug IS NOT NULL
      AND a.slug IS NOT NULL
  ),
  claimed AS (
    UPDATE public.practices AS p
    SET published_at = p.scheduled_publish_at
    FROM due
    WHERE p.id = due.id
      AND p.published_at IS NULL
    RETURNING p.id, p.published_at
  ),
  inserted AS (
    INSERT INTO public.scheduled_publish_notification_outbox (
      practice_id,
      author_id,
      practice_slug,
      author_slug,
      catalog_visibility,
      is_catalog_listed,
      published_at,
      prior_public_count
    )
    SELECT
      due.id,
      due.author_id,
      due.practice_slug,
      due.author_slug,
      due.catalog_visibility,
      due.is_catalog_listed,
      claimed.published_at,
      due.prior_public_count
    FROM claimed
    INNER JOIN due ON due.id = claimed.id
    ON CONFLICT (practice_id) DO NOTHING
    RETURNING practice_id
  )
  SELECT count(*)::integer INTO claimed_count FROM inserted;

  RETURN claimed_count;
END;
$$;

COMMENT ON FUNCTION public.claim_due_scheduled_practice_publications() IS
  'Service-only. Stamps published_at to the elapsed schedule and inserts one pending search-notification row in the same transaction. Returns a count, not product rows. Approval after a past schedule is excluded because published_at is already set.';

REVOKE ALL ON FUNCTION public.claim_due_scheduled_practice_publications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_scheduled_practice_publications() FROM anon;
REVOKE ALL ON FUNCTION public.claim_due_scheduled_practice_publications() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_practice_publications() TO service_role;

CREATE FUNCTION public.take_pending_scheduled_publish_notifications()
RETURNS TABLE (
  id uuid,
  practice_id uuid,
  author_id uuid,
  practice_slug text,
  author_slug text,
  catalog_visibility text,
  is_catalog_listed boolean,
  published_at timestamptz,
  prior_public_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM public.scheduled_publish_notification_outbox AS q
    WHERE q.status = 'pending'
       OR (
         q.status = 'leased'
         AND q.leased_until IS NOT NULL
         AND q.leased_until <= now()
       )
    ORDER BY q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 50
  )
  UPDATE public.scheduled_publish_notification_outbox AS o
  SET
    status = 'leased',
    leased_until = now() + interval '2 minutes'
  FROM picked
  WHERE o.id = picked.id
  RETURNING
    o.id,
    o.practice_id,
    o.author_id,
    o.practice_slug,
    o.author_slug,
    o.catalog_visibility,
    o.is_catalog_listed,
    o.published_at,
    o.prior_public_count;
END;
$$;

COMMENT ON FUNCTION public.take_pending_scheduled_publish_notifications() IS
  'Service-only lease of pending first-go-live notifications. An expired lease can be taken again. Does not mark the event processed.';

REVOKE ALL ON FUNCTION public.take_pending_scheduled_publish_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_pending_scheduled_publish_notifications() FROM anon;
REVOKE ALL ON FUNCTION public.take_pending_scheduled_publish_notifications() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.take_pending_scheduled_publish_notifications() TO service_role;

CREATE FUNCTION public.complete_scheduled_publish_notifications(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.scheduled_publish_notification_outbox
  SET
    status = 'processed',
    processed_at = now(),
    leased_until = NULL
  WHERE id = ANY (COALESCE(p_ids, ARRAY[]::uuid[]))
    AND status = 'leased';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_scheduled_publish_notifications(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_scheduled_publish_notifications(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.complete_scheduled_publish_notifications(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_scheduled_publish_notifications(uuid[]) TO service_role;

CREATE FUNCTION public.abandon_scheduled_publish_notifications(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.scheduled_publish_notification_outbox
  SET
    status = 'pending',
    leased_until = NULL
  WHERE id = ANY (COALESCE(p_ids, ARRAY[]::uuid[]))
    AND status = 'leased';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_scheduled_publish_notifications(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.abandon_scheduled_publish_notifications(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.abandon_scheduled_publish_notifications(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_scheduled_publish_notifications(uuid[]) TO service_role;

COMMIT;
