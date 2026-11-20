-- Drop the paid-mix share column. Application code that reads it must already be rolled back.
-- Only with a separate operator OK, after a database backup.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.business_personal_collections
  DROP COLUMN IF EXISTS collection_share_percent;
COMMIT;
