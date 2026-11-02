-- 20270214120000_business_trial_attribution (task 253821e0, PR 3)
-- NOT APPLIED. Applying after a backup is Sergey's Human Gate.
-- Note: deploy.sh applies every pending file in supabase/migrations, so merging
-- this file and deploying = applying it. Merge only after Sergey's OK.
--
-- Where a gift week came from, for the admin «Подарочная неделя» and
-- «Воронка по каналам»: approximate city (DB-IP Lite, looked up in memory),
-- device class with OS and browser family, landing referrer domain, utm_* and
-- the bot channel (ch=max|tg). All columns are nullable and written once.
-- Never stored: IP address, raw user agent, full referrer URL, fingerprints,
-- coordinates, email or any other personal data.
-- The app writes nothing until AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED=1.
-- business_guest_starts stays service_role only (RLS on, no anon/authenticated grants).
BEGIN;
-- Fail fast instead of queueing behind live traffic: ADD COLUMN needs a short
-- ACCESS EXCLUSIVE lock. 55P03 after 3s rolls the whole file back; deploy can retry.
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.business_guest_starts
  ADD COLUMN IF NOT EXISTS attributed_at timestamptz,
  ADD COLUMN IF NOT EXISTS entry_channel text,
  ADD COLUMN IF NOT EXISTS referrer_domain text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS geo_country text,
  ADD COLUMN IF NOT EXISTS geo_region text,
  ADD COLUMN IF NOT EXISTS geo_city text,
  ADD COLUMN IF NOT EXISTS device_class text,
  ADD COLUMN IF NOT EXISTS os_family text,
  ADD COLUMN IF NOT EXISTS browser_family text;

-- NOT VALID: existing rows have NULL everywhere, so nothing to scan; new writes are checked.
ALTER TABLE public.business_guest_starts DROP CONSTRAINT IF EXISTS business_guest_starts_attribution_check;
ALTER TABLE public.business_guest_starts ADD CONSTRAINT business_guest_starts_attribution_check CHECK (
  (entry_channel IS NULL OR entry_channel IN ('max', 'tg'))
  AND (referrer_domain IS NULL OR (char_length(referrer_domain) <= 253 AND referrer_domain ~ '^[a-z0-9.-]+$'))
  AND (utm_source IS NULL OR (char_length(utm_source) <= 100 AND utm_source !~ '[[:cntrl:]]'))
  AND (utm_medium IS NULL OR (char_length(utm_medium) <= 100 AND utm_medium !~ '[[:cntrl:]]'))
  AND (utm_campaign IS NULL OR (char_length(utm_campaign) <= 100 AND utm_campaign !~ '[[:cntrl:]]'))
  AND (geo_country IS NULL OR geo_country ~ '^[A-Z]{2}$')
  AND (geo_region IS NULL OR (char_length(geo_region) <= 80 AND geo_region !~ '[[:cntrl:]]'))
  AND (geo_city IS NULL OR (char_length(geo_city) <= 80 AND geo_city !~ '[[:cntrl:]]'))
  AND (device_class IS NULL OR device_class IN ('phone', 'tablet', 'computer'))
  AND (os_family IS NULL OR os_family IN ('android', 'ios', 'windows', 'macos', 'linux', 'chromeos', 'other'))
  AND (browser_family IS NULL OR browser_family IN ('yandex', 'chrome', 'safari', 'firefox', 'edge', 'opera', 'samsung', 'max', 'telegram', 'other'))
) NOT VALID;

COMMIT;

-- Rollback (after a backup and a separate decision). Turn the flag off first:
-- AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED unset, pm2 reload; then the app neither
-- writes nor reads these columns. Same SQL is in supabase/rollbacks/ next to this file.
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- ALTER TABLE public.business_guest_starts DROP CONSTRAINT IF EXISTS business_guest_starts_attribution_check;
-- ALTER TABLE public.business_guest_starts
--   DROP COLUMN IF EXISTS browser_family, DROP COLUMN IF EXISTS os_family, DROP COLUMN IF EXISTS device_class,
--   DROP COLUMN IF EXISTS geo_city, DROP COLUMN IF EXISTS geo_region, DROP COLUMN IF EXISTS geo_country,
--   DROP COLUMN IF EXISTS utm_campaign, DROP COLUMN IF EXISTS utm_medium, DROP COLUMN IF EXISTS utm_source,
--   DROP COLUMN IF EXISTS referrer_domain, DROP COLUMN IF EXISTS entry_channel, DROP COLUMN IF EXISTS attributed_at;
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270214120000';
-- COMMIT;
