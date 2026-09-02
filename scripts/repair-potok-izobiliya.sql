-- ONE-ROW production repair for «Поток Изобилия».
--
-- DO NOT APPLY until:
--   1. 20260915120000_preserve_catalog_visibility_on_start_editing.sql is deployed;
--   2. the access/PDP code fix is deployed;
--   3. the owner explicitly confirms this exact product should be listed.
--
-- This is not a migration. Do not run it as part of deploy.
-- Do not use it as a mass backfill: other unlisted rows may be intentional.

BEGIN;

UPDATE public.practices
SET
  catalog_visibility = 'listed',
  updated_at = now()
WHERE id = '7f7da757-9191-4e3d-95c0-02834321ad35'
  AND slug = 'potok-izobiliya'
  AND status = 'published'
  AND is_free IS TRUE
  AND COALESCE(price, 0) = 0
  AND deleted_at IS NULL
  AND catalog_visibility = 'unlisted'
  AND is_catalog_listed IS FALSE;

-- Expect exactly 1 row. is_catalog_listed follows catalog_visibility via
-- sync_practice_catalog_visibility.

COMMIT;
