-- Optional author SEO fields for public product pages.
-- Nullable. No backfill. Existing NULL rows keep legacy metadata.

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS seo_primary_query text,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text;

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_seo_primary_query_length_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_seo_primary_query_length_check
  CHECK (
    seo_primary_query IS NULL
    OR char_length(seo_primary_query) <= 120
  );

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_seo_title_length_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_seo_title_length_check
  CHECK (
    seo_title IS NULL
    OR char_length(seo_title) <= 140
  );

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_seo_description_length_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_seo_description_length_check
  CHECK (
    seo_description IS NULL
    OR char_length(seo_description) <= 300
  );

COMMENT ON COLUMN public.practices.seo_primary_query IS
  'Optional primary search phrase for the public product page. Max 120 characters. NULL keeps legacy metadata.';

COMMENT ON COLUMN public.practices.seo_title IS
  'Optional search title base without requiring the brand suffix. Max 140 characters. NULL uses title + primary query.';

COMMENT ON COLUMN public.practices.seo_description IS
  'Optional search description. Max 300 characters. NULL falls back to product description / subtitle.';
