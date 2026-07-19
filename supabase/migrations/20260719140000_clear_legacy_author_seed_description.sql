BEGIN;

-- Remove the original demo seed copy from legacy author fields.
-- Only rows with the exact seeded text are updated.

UPDATE public.authors
SET short_bio = NULL
WHERE btrim(short_bio) =
  'Медитации, энергопрактики и программы для внутренней гармонии.';

UPDATE public.authors
SET description = NULL
WHERE btrim(description) =
  'Медитации, энергопрактики и программы для внутренней гармонии.';

COMMIT;
