-- Rollback for 20270215120000_business_player_history_retention (task f381f92b).
-- NOT a migration: deploy never runs this folder. Run by hand only with Sergey's OK,
-- with BUSINESS_PLAYER_RETENTION_ENABLED and BUSINESS_PLAYER_RETENTION_DELETE_ENABLED
-- off and no external schedule calling the runner.
-- Drops only the cleanup RPC and the retention index. History rows are not touched.
-- Rows already removed by an enabled cleanup run cannot be restored: by decision there
-- is no archive. Feed this file to psql WITHOUT --single-transaction: the concurrent
-- index drop must run outside a transaction block.
BEGIN;
SET LOCAL lock_timeout = '3s';
DROP FUNCTION IF EXISTS public.cleanup_business_player_listening_history(boolean, boolean, integer, integer, integer);
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270215120000';
COMMIT;
SET lock_timeout = '3s';
DROP INDEX CONCURRENTLY IF EXISTS public.business_player_listening_history_retention_idx;
RESET lock_timeout;
