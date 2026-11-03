-- Rollback for 20270216120000_business_profile_organization (profile personalisation).
-- NOT a migration: deploy never runs this folder. Run by hand only with Sergey's OK.
-- Drops only the owner-only rename RPC. Organization names already saved stay as they are.
BEGIN;
SET LOCAL lock_timeout = '3s';
DROP FUNCTION IF EXISTS public.rename_business_organization(uuid, text);
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270216120000';
COMMIT;
