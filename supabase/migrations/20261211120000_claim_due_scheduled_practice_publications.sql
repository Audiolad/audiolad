-- Stamp factual go-live when an approved schedule elapses without a row write.
-- No worker. The next public read calls this idempotent claim.
-- published_at becomes scheduled_publish_at, not now().
-- An approval that already stamped published_at (schedule was already past)
-- is excluded by published_at IS NULL, so the approval instant stays put
-- and search notifications are not sent a second time.
-- The existing BEFORE trigger does not rewrite this value: the new
-- published_at is already <= now(), so the "stamp now()" branch does not run.

BEGIN;

CREATE INDEX IF NOT EXISTS practices_due_scheduled_publication_idx
  ON public.practices (scheduled_publish_at)
  WHERE status = 'published'
    AND published_at IS NULL
    AND scheduled_publish_at IS NOT NULL
    AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_practice_publications()
RETURNS TABLE (
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
  INNER JOIN due ON due.id = claimed.id;
END;
$$;

COMMENT ON FUNCTION public.claim_due_scheduled_practice_publications() IS
  'Idempotent first go-live stamp. Sets published_at to the elapsed scheduled_publish_at and returns only rows this call claimed. Approval after a past schedule is not claimed, because that write already set published_at to the approval instant.';

REVOKE ALL ON FUNCTION public.claim_due_scheduled_practice_publications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_practice_publications() TO anon, authenticated, service_role;

COMMIT;
