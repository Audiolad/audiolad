BEGIN;

-- Remove demo, seed, and E2E test products from the public catalog.
-- Keeps purchased/granted rows intact; only changes publication status.
-- Real catalog product energiya-deneg remains published.

UPDATE public.practices
SET
  status = 'archived',
  updated_at = now()
WHERE slug IN (
  'e2e-test-programma-3-audio',
  'e2e-test-odinochnyy-audioprodukt',
  'first-audio-course',
  'elixir-molodosti',
  'klyuch-k-izobiliyu',
  'kod-prityazheniya',
  'personal-boundaries',
  'sila-zhenstvennosti'
)
AND status = 'published';

COMMIT;
