-- Tighten function grants for author application history.
-- log_author_application_status_event is an internal helper: it is called only
-- from SECURITY DEFINER functions owned by postgres (status transitions,
-- approval, resubmission trigger), never by clients directly.
-- Rollback: supabase/rollbacks/20270220120000_author_application_history_grants.rollback.sql
BEGIN;

REVOKE ALL ON FUNCTION public.log_author_application_status_event(uuid, text, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;

COMMIT;
