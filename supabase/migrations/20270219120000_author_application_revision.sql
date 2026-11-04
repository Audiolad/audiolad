-- Author application revision («Отправить на доработку»).
-- Additive only: one nullable column with a CHECK constraint, a BEFORE UPDATE
-- guard so only staff can set it, and an AFTER UPDATE trigger that records the
-- applicant's resubmission in the decision history.
-- No existing function, policy or grant is changed.
-- Rollback: supabase/rollbacks/20270219120000_author_application_revision.rollback.sql
BEGIN;

-- Optional list of form sections the reviewer asks to fix.
ALTER TABLE public.author_applications
  ADD COLUMN IF NOT EXISTS revision_fields text[] NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'author_applications_revision_fields_check'
      AND conrelid = 'public.author_applications'::regclass
  ) THEN
    ALTER TABLE public.author_applications
      ADD CONSTRAINT author_applications_revision_fields_check
      CHECK (
        revision_fields IS NULL
        OR (
          cardinality(revision_fields) <= 5
          AND revision_fields <@ ARRAY[
            'display_name',
            'direction',
            'about',
            'contacts',
            'readiness'
          ]::text[]
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.author_applications.revision_fields IS
  'Form sections staff asked the applicant to fix when sending the application back for revision (needs_changes).';

-- Only staff (or service role without a JWT) may change revision_fields;
-- the existing applicant edit guard does not know about the new column.
CREATE OR REPLACE FUNCTION public.guard_author_application_revision_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.revision_fields IS NOT DISTINCT FROM OLD.revision_fields THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR public.is_platform_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'author_application_revision_fields_forbidden';
END;
$$;

DROP TRIGGER IF EXISTS author_applications_guard_revision_fields
  ON public.author_applications;

CREATE TRIGGER author_applications_guard_revision_fields
  BEFORE UPDATE OF revision_fields ON public.author_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_author_application_revision_fields();

-- Applicants cannot insert into author_application_status_events (staff-only
-- RLS), so the resubmission after revision is logged by a SECURITY DEFINER
-- trigger. Staff moves out of needs_changes go to in_review and are logged by
-- the existing RPCs, so they never match this trigger.
CREATE OR REPLACE FUNCTION public.log_author_application_resubmission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'needs_changes' AND NEW.status = 'submitted' THEN
    PERFORM public.log_author_application_status_event(
      NEW.id,
      OLD.status,
      NEW.status,
      COALESCE(auth.uid(), NEW.user_id),
      NULL,
      NULL
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_author_application_resubmission() FROM PUBLIC;

DROP TRIGGER IF EXISTS author_applications_log_resubmission
  ON public.author_applications;

CREATE TRIGGER author_applications_log_resubmission
  AFTER UPDATE OF status ON public.author_applications
  FOR EACH ROW
  WHEN (OLD.status = 'needs_changes' AND NEW.status = 'submitted')
  EXECUTE FUNCTION public.log_author_application_resubmission();

COMMIT;
