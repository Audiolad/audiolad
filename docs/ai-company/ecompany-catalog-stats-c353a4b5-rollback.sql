-- Rollback for 20270104120000_ecompany_catalog_stats.sql (c353a4b5). Drops only objects it created.
BEGIN;
DROP FUNCTION IF EXISTS public.ecompany_catalog_stats_history_started();
DROP FUNCTION IF EXISTS public.ecompany_catalog_stats_history(integer);
DROP FUNCTION IF EXISTS public.ecompany_catalog_stats_capture();
DROP FUNCTION IF EXISTS public.ecompany_catalog_stats_counts(timestamptz[]);
DROP TABLE IF EXISTS public.ecompany_catalog_stats_snapshots;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270104120000';
COMMIT;
