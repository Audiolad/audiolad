-- Rollback of 20270314120000_author_closed_catalog_only.sql (t1505u/t1506u).
-- Order: 1) roll back the app code; 2) apply this file. The column is unused after the app rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.authors DROP COLUMN IF EXISTS closed_catalog_only;
COMMIT;
