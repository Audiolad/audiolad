-- t1640u: per-collection share of the paid personal-collection mix (50–95%, default 50).
-- Expand-only. Grants, RLS and existing rows' other columns are unchanged.
-- NULL is treated as 50 by the application.
--
-- Rollback (only with a separate operator OK, after a backup):
--   ALTER TABLE public.business_personal_collections
--     DROP COLUMN IF EXISTS collection_share_percent;

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.business_personal_collections
  ADD COLUMN collection_share_percent smallint DEFAULT 50
  CHECK (collection_share_percent IS NULL OR (collection_share_percent >= 50 AND collection_share_percent <= 95));

COMMENT ON COLUMN public.business_personal_collections.collection_share_percent IS
  'Доля треков подборки в пуле после оплаты, проценты 50–95. NULL = 50.';

COMMIT;
