-- Additive metadata only. Keep published_at and the existing availability,
-- moderation, scheduled-claim, outbox and indexing contracts unchanged.
BEGIN;

ALTER TABLE public.practices
  ADD COLUMN first_published_at timestamptz NULL,
  ADD COLUMN first_publication_date_unknown boolean NOT NULL DEFAULT true;
-- Existing rows start uncertain; new rows are tracked from their creation.
ALTER TABLE public.practices
  ALTER COLUMN first_publication_date_unknown SET DEFAULT false;

-- Metadata backfill fires existing BEFORE UPDATE triggers too. Drain elapsed
-- canonical schedules through the existing transactional claim first, so its
-- go-live stamp ALWAYS keeps the associated indexing notification outbox row.
-- No network delivery is performed by this function.
SELECT public.claim_due_scheduled_practice_publications();

-- The foundation migration copied created_at to published_at (and used now()
-- when creation was missing). Neither is evidence of a first publication.
-- Retained publication stamps later than known creation are usable, unless
-- lifecycle history proves the product was already published before that stamp.
UPDATE public.practices AS p
SET first_published_at = p.published_at,
    first_publication_date_unknown = false
WHERE p.created_at IS NOT NULL
  AND p.published_at > p.created_at
  AND p.published_at <= now()
  AND NOT EXISTS (
    SELECT 1 FROM public.practice_moderation_events e
    WHERE e.practice_id = p.id
      AND e.created_at < p.published_at
      AND (e.from_status = 'published' OR e.action = 'republished'
           OR (e.action = 'approved_and_published'
               AND (p.scheduled_publish_at IS NULL
                    OR e.created_at >= p.scheduled_publish_at)))
  );

-- The transactional scheduled-release outbox is independent evidence of
-- actual go-live, including rows whose record-creation date is unknown.
UPDATE public.practices AS p
SET first_published_at = o.published_at,
    first_publication_date_unknown = false
FROM public.scheduled_publish_notification_outbox AS o
WHERE o.practice_id = p.id
  AND p.first_published_at IS NULL
  AND p.published_at = o.published_at
  AND o.published_at <= now()
  AND (p.created_at IS NULL OR o.published_at >= p.created_at)
  AND NOT EXISTS (
    SELECT 1 FROM public.practice_moderation_events e
    WHERE e.practice_id = p.id AND e.created_at < o.published_at
      AND (e.from_status = 'published' OR e.action = 'republished')
  );

-- A never-published draft or an approved schedule still awaiting its first
-- stamp can be tracked prospectively. Prior lifecycle evidence prevents an
-- unknown historical release from being replaced by today's republish date.
UPDATE public.practices AS p
SET first_publication_date_unknown = false
WHERE p.published_at IS NULL
  AND (p.status = 'draft' OR
       (p.status = 'published' AND p.scheduled_publish_at > now()))
  AND NOT EXISTS (
    SELECT 1 FROM public.practice_moderation_events e
    WHERE e.practice_id = p.id
      AND (e.from_status IN ('published', 'unpublished') OR e.action = 'republished')
  );

CREATE FUNCTION public.guard_product_publication_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    NEW.first_published_at := OLD.first_published_at;
    NEW.first_publication_date_unknown := OLD.first_publication_date_unknown;
    IF OLD.first_published_at IS NOT NULL OR OLD.first_publication_date_unknown THEN
      RETURN NEW;
    END IF;
    -- A schedule becomes public by passage of time. Capture that instant even
    -- when the next write hides/deletes/reschedules the row, or is a late claim.
    IF OLD.status = 'published' AND OLD.deleted_at IS NULL
       AND OLD.published_at IS NULL
       AND OLD.scheduled_publish_at <= now() THEN
      NEW.first_published_at := OLD.scheduled_publish_at;
      RETURN NEW;
    END IF;
  ELSE
    -- Callers cannot supply a publication date or mark a new draft historical.
    NEW.first_published_at := NULL;
    NEW.first_publication_date_unknown := false;
  END IF;

  IF NEW.status = 'published' AND NEW.deleted_at IS NULL
     AND public.practice_is_publicly_available(
       NEW.status, NEW.scheduled_publish_at, NEW.published_at
     ) THEN
    NEW.first_published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- PostgreSQL runs BEFORE triggers alphabetically: run after the existing
-- scheduled-publication guard has cleared premature published_at values.
CREATE TRIGGER zz_guard_product_publication_dates
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_publication_dates();

COMMENT ON COLUMN public.practices.first_published_at IS
  'Immutable first actual go-live, independent of record/file creation and edits. NULL for drafts, pending schedules or uncertain history. Elapsed approved schedules use the computed go-live instant.';
COMMENT ON COLUMN public.practices.first_publication_date_unknown IS
  'Historical uncertainty marker. Prevents a later republish/edit from inventing a first publication date. Not author-editable.';
COMMENT ON COLUMN public.practices.created_at IS
  'Product database record creation, not audio file creation or first publication. Preserved on update; legacy NULL remains unknown.';

COMMIT;
