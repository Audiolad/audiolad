-- ONE-ROW production repair for «Поток Изобилия».
--
-- DO NOT APPLY until:
--   1. 20260915120000_preserve_catalog_visibility_on_start_editing.sql is deployed;
--   2. the access/PDP code fix is deployed;
--   3. the owner explicitly confirms this exact product should be listed.
--
-- This is not a migration. Do not run it as part of deploy.
-- Do not use it as a mass backfill: other unlisted rows may be intentional.
--
-- Fail-closed: the UPDATE must change exactly one row, otherwise the
-- transaction raises and rolls back. is_catalog_listed follows
-- catalog_visibility via sync_practice_catalog_visibility.

BEGIN;

DO $$
DECLARE
  v_row_count integer;
BEGIN
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

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'potok_izobiliya_repair_row_count_mismatch: expected 1 row, got %',
      v_row_count;
  END IF;
END;
$$;

COMMIT;
