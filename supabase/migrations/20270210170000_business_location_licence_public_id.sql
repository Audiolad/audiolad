BEGIN;

-- ---------------------------------------------------------------------------
-- Public id for the venue licence page (task 90d24628).
-- Additive. Does not apply itself. Needs Sergey's OK before production.
--
-- business_locations.licence_public_id is the unguessable id in
-- business.audiolad.ru/v/<id>. It is not the location primary key and it
-- carries no owner identity. Existing rows receive a fresh id. New rows
-- receive one from the column default, including
-- create_business_organization_with_location, which does not list the column.
--
-- Rollback, only if this migration is the latest change and Sergey confirms
-- the column may go:
--   ALTER TABLE public.business_locations
--     DROP CONSTRAINT IF EXISTS business_locations_licence_public_id_check;
--   DROP INDEX IF EXISTS public.business_locations_licence_public_id_uidx;
--   ALTER TABLE public.business_locations DROP COLUMN IF EXISTS licence_public_id;
-- ---------------------------------------------------------------------------

ALTER TABLE public.business_locations
  ADD COLUMN IF NOT EXISTS licence_public_id text;

UPDATE public.business_locations
SET licence_public_id = replace(gen_random_uuid()::text, '-', '')
WHERE licence_public_id IS NULL;

ALTER TABLE public.business_locations
  ALTER COLUMN licence_public_id SET DEFAULT replace(gen_random_uuid()::text, '-', '');

ALTER TABLE public.business_locations
  ALTER COLUMN licence_public_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_locations_licence_public_id_check'
  ) THEN
    ALTER TABLE public.business_locations
      ADD CONSTRAINT business_locations_licence_public_id_check
      CHECK (licence_public_id ~ '^[0-9a-f]{32}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS business_locations_licence_public_id_uidx
  ON public.business_locations (licence_public_id);

COMMENT ON COLUMN public.business_locations.licence_public_id IS
  'audiolad:venue-licence; unguessable public id for /v/<id>. Not the location primary key. No owner identity.';

COMMIT;
