-- Non-destructive rollback: disable feature access; retain collections and account links.
-- Roll back application code first. No DROP/DELETE, no changes to existing catalog/billing.
BEGIN;
ALTER TABLE public.business_personal_collection_accounts DISABLE TRIGGER business_personal_collection_account_attach;
ALTER TABLE public.business_locations DISABLE TRIGGER business_personal_collection_location_inherit;
REVOKE ALL ON FUNCTION public.business_personal_collection_location_tracks(uuid) FROM service_role;
REVOKE ALL ON public.business_personal_collection_locations FROM service_role;
REVOKE ALL ON FUNCTION public.business_personal_collection_tracks(uuid),
  public.create_business_personal_collection(text,text,uuid,uuid[]) FROM service_role;
REVOKE ALL ON public.business_personal_collections, public.business_personal_collection_items,
  public.business_personal_collection_accounts FROM service_role;
COMMIT;
