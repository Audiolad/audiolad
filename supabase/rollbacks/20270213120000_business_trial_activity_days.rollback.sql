-- Rollback for 20270213120000_business_trial_activity_days (task 253821e0).
-- NOT a migration: deploy never runs this folder. Run by hand only after a backup,
-- Sergey's OK and with AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_ENABLED already off.
-- Drops only the new objects; business_guest_starts rows stay, only start_host goes.
BEGIN;
SET LOCAL lock_timeout = '3s';
DROP FUNCTION IF EXISTS public.purge_business_trial_activity_days(integer);
DROP FUNCTION IF EXISTS public.record_business_trial_point_listen(text, integer, integer);
DROP FUNCTION IF EXISTS public.record_business_trial_activity(uuid, text, integer, integer, integer);
DROP TABLE IF EXISTS public.business_trial_activity_days;
ALTER TABLE public.business_guest_starts DROP CONSTRAINT IF EXISTS business_guest_starts_start_host_check;
ALTER TABLE public.business_guest_starts DROP COLUMN IF EXISTS start_host;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270213120000';
COMMIT;
