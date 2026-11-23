-- Drop the atomic album-unlink function, then revoke the collection DELETE grants.
-- Application code that deletes or calls the function must already be rolled back.
-- Only with a separate operator OK, after a database backup.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.remove_business_personal_collection_album(uuid, uuid);
REVOKE DELETE ON TABLE
  public.business_personal_collections,
  public.business_personal_collection_items,
  public.business_personal_collection_accounts,
  public.business_personal_collection_locations
FROM service_role;
COMMIT;
