BEGIN;

-- ---------------------------------------------------------------------------
-- Catalog visibility separate from publication lifecycle.
--
-- published + is_catalog_listed = true  -> public catalog
-- published + is_catalog_listed = false -> unlisted (starters, direct links)
-- archived                              -> off sale, existing entitlements kept
-- ---------------------------------------------------------------------------

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS is_catalog_listed boolean;

UPDATE public.practices
SET is_catalog_listed = true
WHERE is_catalog_listed IS NULL;

ALTER TABLE public.practices
  ALTER COLUMN is_catalog_listed SET DEFAULT true,
  ALTER COLUMN is_catalog_listed SET NOT NULL;

COMMENT ON COLUMN public.practices.is_catalog_listed IS
  'When true and status=published, product appears in public catalog. Unlisted published products remain grantable and listenable for entitled users.';

-- Starter bundle: keep published for signup grants, hide from public catalog.
UPDATE public.practices
SET
  status = 'published',
  is_catalog_listed = false,
  updated_at = now()
WHERE slug IN (
  'elixir-molodosti',
  'klyuch-k-izobiliyu',
  'kod-prityazheniya'
);

-- Real catalog product stays listed.
UPDATE public.practices
SET is_catalog_listed = true
WHERE slug = 'energiya-deneg';

-- Archived/off-catalog demo products must not be listed.
UPDATE public.practices
SET is_catalog_listed = false
WHERE slug IN (
  'e2e-test-programma-3-audio',
  'e2e-test-odinochnyy-audioprodukt',
  'first-audio-course',
  'personal-boundaries',
  'sila-zhenstvennosti'
);

-- Entitled library users must read archived/unlisted products they already own.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'practices'
      AND policyname = 'Entitled users can read entitled practices'
  ) THEN
    CREATE POLICY "Entitled users can read entitled practices"
      ON public.practices
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.user_practices AS up
          WHERE up.user_id = auth.uid()
            AND up.practice_id = practices.id
            AND (
              up.expires_at IS NULL
              OR up.expires_at > now()
            )
        )
      );
  END IF;
END;
$$;

COMMIT;
