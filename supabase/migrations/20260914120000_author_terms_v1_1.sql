-- Author cooperation terms edition 1.1.
-- Publishes the current legal text from src/lib/author-terms/approved-content.ts.
-- Does not create tables, payment objects, or Author Support functionality.
-- DO NOT apply to production without explicit approval.

BEGIN;

UPDATE public.author_terms_versions
SET is_current = false
WHERE document_key = 'author-terms'
  AND is_current IS TRUE;

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
  '7b95bb3d-9047-4a2b-9546-0e6b5af6bb26',
  '1.1',
  'Авторские условия сотрудничества платформы «АудиоЛад»',
  '2026-09-02T00:00:00+03:00',
  '2026-09-02T00:00:00+03:00',
  'e4d72807867d8db14846a9b34fe2956a4de3fa44e0b7aacb9d16478e4528abc9',
  'author-terms',
  true
);

COMMIT;
