-- PREPARE ONLY. Human Gate: PostgreSQL backup, staging smoke, explicit approval before apply.
-- t1292u: every owner can add physical Locations up to the existing hard ceiling.
-- Data-only change: no grants, RLS changes, billing changes or Location deletion.
BEGIN;

UPDATE public.business_venue_slot_settings
SET default_limit = 10, updated_at = clock_timestamp()
WHERE singleton AND default_limit < 10;

COMMIT;
-- Rollback: UPDATE public.business_venue_slot_settings SET default_limit = 3, updated_at = clock_timestamp() WHERE singleton;
-- Keep all existing Locations, scopes, periods and evidence; rollback never deletes locations.
