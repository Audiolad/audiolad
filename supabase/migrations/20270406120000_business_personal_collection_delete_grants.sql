-- t1655u/t1656u: allow the platform-owner admin to unlink collection tracks
-- and delete a collection. Rights only. No CASCADE, no row or schema change.
-- Approved by the operator 20.11.2026, with a production backup before deploy.
--
-- Rollback (only with a separate operator OK, after a backup):
--   REVOKE DELETE ON TABLE
--     public.business_personal_collections,
--     public.business_personal_collection_items,
--     public.business_personal_collection_accounts,
--     public.business_personal_collection_locations
--   FROM service_role;

BEGIN;
SET LOCAL lock_timeout = '5s';

GRANT DELETE ON TABLE
  public.business_personal_collections,
  public.business_personal_collection_items,
  public.business_personal_collection_accounts,
  public.business_personal_collection_locations
TO service_role;

COMMIT;
