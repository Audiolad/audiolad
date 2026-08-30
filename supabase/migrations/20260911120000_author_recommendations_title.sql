-- Optional author-owned heading for the public related-products block.
-- Additive only. Nullable. No backfill. No change to practice_related_products.

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS author_recommendations_title text;

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_author_recommendations_title_length_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_author_recommendations_title_length_check
  CHECK (
    author_recommendations_title IS NULL
    OR (
      char_length(btrim(author_recommendations_title)) > 0
      AND char_length(author_recommendations_title) <= 80
    )
  );

COMMENT ON COLUMN public.practices.author_recommendations_title IS
  'Optional public heading for the author recommendations (related products) block. Max 80 characters. NULL uses the default «Рекомендации автора».';
