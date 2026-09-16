BEGIN;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS catalog_section text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_catalog_section_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_catalog_section_check
      CHECK (
        catalog_section IS NULL
        OR catalog_section IN (
          'music',
          'meditations',
          'education',
          'stories',
          'books'
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.practices.catalog_section IS
  'Primary catalog section: music, meditations, education, stories, books. NULL means unassigned.';

COMMIT;
