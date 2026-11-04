-- Rollback for 20270219120000_author_application_revision («Отправить на доработку»).
-- NOT a migration: deploy never runs this folder. Run by hand only with Sergey's OK.
-- Removes both triggers, their functions and the revision_fields column. Status
-- history rows already written by the trigger stay as they are. The app keeps
-- working without the column (revision fields are read tolerantly).
BEGIN;
SET LOCAL lock_timeout = '3s';
DROP TRIGGER IF EXISTS author_applications_log_resubmission ON public.author_applications;
DROP FUNCTION IF EXISTS public.log_author_application_resubmission();
DROP TRIGGER IF EXISTS author_applications_guard_revision_fields ON public.author_applications;
DROP FUNCTION IF EXISTS public.guard_author_application_revision_fields();
ALTER TABLE public.author_applications
  DROP CONSTRAINT IF EXISTS author_applications_revision_fields_check;
ALTER TABLE public.author_applications DROP COLUMN IF EXISTS revision_fields;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270219120000';
COMMIT;
