-- Author cooperation terms versions + acceptances (offer for authors).
-- DO NOT apply to production without explicit approval.
-- Seeded version matches src/lib/author-terms/approved-content.ts content hash.

BEGIN;

CREATE TABLE IF NOT EXISTS public.author_terms_versions (
  id uuid PRIMARY KEY,
  version text NOT NULL,
  title text NOT NULL,
  published_at timestamptz NOT NULL,
  effective_at timestamptz NOT NULL,
  content_hash text NOT NULL,
  document_key text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_terms_versions_version_nonempty
    CHECK (length(btrim(version)) > 0),
  CONSTRAINT author_terms_versions_hash_sha256
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT author_terms_versions_document_key_nonempty
    CHECK (length(btrim(document_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS author_terms_versions_one_current_idx
  ON public.author_terms_versions (is_current)
  WHERE is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS author_terms_versions_content_hash_uidx
  ON public.author_terms_versions (content_hash);

CREATE UNIQUE INDEX IF NOT EXISTS author_terms_versions_document_key_version_uidx
  ON public.author_terms_versions (document_key, version);

CREATE TABLE IF NOT EXISTS public.author_terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE RESTRICT,
  terms_version_id uuid NOT NULL
    REFERENCES public.author_terms_versions (id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_by_user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,
  ip_address inet NULL,
  user_agent text NULL,
  acceptance_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_terms_acceptances_acceptance_text_nonempty
    CHECK (length(btrim(acceptance_text)) > 0),
  CONSTRAINT author_terms_acceptances_user_agent_len
    CHECK (user_agent IS NULL OR char_length(user_agent) <= 512)
);

CREATE UNIQUE INDEX IF NOT EXISTS author_terms_acceptances_author_version_uidx
  ON public.author_terms_acceptances (author_id, terms_version_id);

CREATE INDEX IF NOT EXISTS author_terms_acceptances_author_accepted_idx
  ON public.author_terms_acceptances (author_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS author_terms_acceptances_version_idx
  ON public.author_terms_acceptances (terms_version_id);

ALTER TABLE public.author_terms_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_terms_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_terms_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.author_terms_acceptances FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.author_terms_versions TO service_role;
GRANT ALL ON TABLE public.author_terms_acceptances TO service_role;
GRANT SELECT ON TABLE public.author_terms_versions TO postgres;
GRANT ALL ON TABLE public.author_terms_acceptances TO postgres;

-- Seed current approved edition (content lives in application module; hash must match).
INSERT INTO public.author_terms_versions (
  id,
  version,
  title,
  published_at,
  effective_at,
  content_hash,
  document_key,
  is_current
) VALUES (
  'c0a7e001-7e12-4a01-9c01-81dfcb4acf97',
  '1.0',
  'Авторские условия сотрудничества платформы «АудиоЛад»',
  '2026-07-28T00:00:00+03:00',
  '2026-07-28T00:00:00+03:00',
  '22c32683c3b91781c1419d455e2a837c6d83999e9a2cf700cd8d330fda0fd5fc',
  'author-terms',
  true
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
