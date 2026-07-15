-- Practice URL foundation: per-author product slugs + legacy redirect table.
-- Idempotent. Review before applying to production.

-- ---------------------------------------------------------------------------
-- Legacy global slugs for permanent redirects (/practice/{legacy} -> new URL)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_slug_redirects (
  legacy_slug text PRIMARY KEY,
  practice_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS practice_slug_redirects_practice_id_uidx
  ON public.practice_slug_redirects (practice_id);

COMMENT ON TABLE public.practice_slug_redirects IS
  'Maps historical globally-unique practice slugs to practices for 308 redirects.';

-- Backfill current slugs so existing links keep working.
INSERT INTO public.practice_slug_redirects (legacy_slug, practice_id)
SELECT p.slug, p.id
FROM public.practices AS p
WHERE p.slug IS NOT NULL
  AND btrim(p.slug) <> ''
ON CONFLICT (legacy_slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Product slug unique per author (not globally)
-- ---------------------------------------------------------------------------

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS practices_author_id_slug_uidx
  ON public.practices (author_id, slug);

-- authors.slug already has authors_slug_key UNIQUE from baseline schema.
