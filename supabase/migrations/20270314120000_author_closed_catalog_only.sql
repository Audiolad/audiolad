-- Additive per-author flag: publish closed Business catalog albums from the author cabinet.
-- Default false leaves every existing author unchanged. Operators toggle it in admin.
-- This migration only adds a nullable-safe boolean column; it does not write author rows.

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS closed_catalog_only boolean;

UPDATE public.authors
SET closed_catalog_only = false
WHERE closed_catalog_only IS NULL;

ALTER TABLE public.authors
  ALTER COLUMN closed_catalog_only SET DEFAULT false,
  ALTER COLUMN closed_catalog_only SET NOT NULL;

COMMENT ON COLUMN public.authors.closed_catalog_only IS
  'When true, this author publishes only to the closed AudioLad Business catalog from the author cabinet. Open-catalog fields (description, SEO, promotion step) stay hidden. Toggled by an operator in admin; never inferred from name or slug.';
