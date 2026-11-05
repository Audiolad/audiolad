-- Rollback for 20270222120000_author_application_function_grants.
-- NOT a migration: deploy never runs this folder. Run by hand only with Sergey's OK.
-- Restores the previous EXECUTE grants (Supabase default ACL state).
BEGIN;
SET LOCAL lock_timeout = '3s';
GRANT EXECUTE ON FUNCTION public.guard_author_applications_user_update()
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_author_application_status(uuid, text, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_author_application(uuid, text)
  TO anon;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270222120000';
COMMIT;
