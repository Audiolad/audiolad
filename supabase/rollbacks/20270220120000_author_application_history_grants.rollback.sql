-- Rollback for 20270220120000_author_application_history_grants.
-- NOT a migration: deploy never runs this folder. Run by hand only with Sergey's OK.
-- Restores the previous EXECUTE grants on the history helper.
BEGIN;
SET LOCAL lock_timeout = '3s';
GRANT EXECUTE ON FUNCTION public.log_author_application_status_event(uuid, text, text, uuid, text, text)
  TO anon, authenticated;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270220120000';
COMMIT;
