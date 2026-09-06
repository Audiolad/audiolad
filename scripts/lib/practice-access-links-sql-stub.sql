-- Extra isolated columns for Phase 5 preview DTO. Never apply to production.

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.authors
SET slug = coalesce(nullif(slug, ''), 'author-a')
WHERE slug IS NULL OR btrim(slug) = '';
