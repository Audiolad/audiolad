-- Additive: project/workspace default credited audio-product author.
-- Seeds once from the first non-empty practices.audio_product_author save.
-- Nullable for legacy workspaces. Empty/whitespace cleared at app layer.

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS default_audio_product_author text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'authors_default_audio_product_author_length_check'
  ) THEN
    ALTER TABLE public.authors
      ADD CONSTRAINT authors_default_audio_product_author_length_check
      CHECK (
        default_audio_product_author IS NULL
        OR char_length(default_audio_product_author) <= 120
      );
  END IF;
END $$;

COMMENT ON COLUMN public.authors.default_audio_product_author IS
  'Default credited audio-product author for this project workspace. Distinct from authors.name. Seeded once when NULL; per-product practices.audio_product_author remains independently editable.';
