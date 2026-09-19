-- Additive: person credited as the audio product author (distinct from workspace).
-- Nullable for legacy/non-wizard products. Empty/whitespace cleared at API layer.

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS audio_product_author text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_audio_product_author_length_check'
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_audio_product_author_length_check
      CHECK (
        audio_product_author IS NULL
        OR char_length(audio_product_author) <= 120
      );
  END IF;
END $$;

COMMENT ON COLUMN public.practices.audio_product_author IS
  'Person credited as the audio product author (e.g. music author). Distinct from authors.name workspace.';
