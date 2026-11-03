-- Rollback for 20270214120000_business_trial_attribution (task 253821e0).
-- NOT a migration: deploy never runs this folder. Run by hand only after a backup,
-- Sergey's OK and with AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED already off.
-- Drops only the new columns; business_guest_starts rows stay.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE public.business_guest_starts DROP CONSTRAINT IF EXISTS business_guest_starts_attribution_check;
ALTER TABLE public.business_guest_starts
  DROP COLUMN IF EXISTS browser_family, DROP COLUMN IF EXISTS os_family, DROP COLUMN IF EXISTS device_class,
  DROP COLUMN IF EXISTS geo_city, DROP COLUMN IF EXISTS geo_region, DROP COLUMN IF EXISTS geo_country,
  DROP COLUMN IF EXISTS utm_campaign, DROP COLUMN IF EXISTS utm_medium, DROP COLUMN IF EXISTS utm_source,
  DROP COLUMN IF EXISTS referrer_domain, DROP COLUMN IF EXISTS entry_channel, DROP COLUMN IF EXISTS attributed_at;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270214120000';
COMMIT;
