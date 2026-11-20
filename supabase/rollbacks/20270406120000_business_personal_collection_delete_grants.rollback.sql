-- Revoke the collection DELETE grants. Application code that deletes must already be rolled back.
-- Only with a separate operator OK, after a database backup.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE DELETE ON TABLE
  public.business_personal_collections,
  public.business_personal_collection_items,
  public.business_personal_collection_accounts,
  public.business_personal_collection_locations
FROM service_role;
COMMIT;
