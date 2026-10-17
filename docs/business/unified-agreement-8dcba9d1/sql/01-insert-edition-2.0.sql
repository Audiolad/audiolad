-- Шаг «вставка редакции 2.0» (идемпотентно). НЕ делает 2.0 текущей. Только с явного OK Сергея.
-- Требует применённой миграции 20270106120000 (колонки covers_business, grants_scope).
-- Хэш = sha256 текста src/lib/author-terms/approved-content-v2.ts (AUTHOR_TERMS_V2_TEXT).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.author_terms_versions') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'author_terms_versions' AND column_name = 'covers_business') THEN
    RAISE EXCEPTION 'unified_agreement_migration_not_applied';
  END IF;
  -- Тот же текст не должен существовать под другим id или другой версией.
  IF EXISTS (SELECT 1 FROM public.author_terms_versions
             WHERE content_hash = '41770211b4b40c6c675316ace4796708179a9c08860101fdb4b23bcdf9443d97' AND id <> '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20') THEN
    RAISE EXCEPTION 'edition_2_0_duplicate_hash';
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_terms_versions
             WHERE document_key = 'author-terms' AND version = '2.0'
               AND (id <> '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20' OR content_hash <> '41770211b4b40c6c675316ace4796708179a9c08860101fdb4b23bcdf9443d97')) THEN
    RAISE EXCEPTION 'edition_2_0_conflicting_row';
  END IF;
END;
$$;

INSERT INTO public.author_terms_versions (
  id, version, title, published_at, effective_at, content_hash, document_key, is_current,
  covers_business, grants_scope
) VALUES (
  '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20',
  '2.0',
  'Единое коммерческое соглашение с правообладателем (Авторские условия сотрудничества платформы «АудиоЛад», редакция 2.0)',
  '2026-10-17T00:00:00+03:00',
  '2026-10-17T00:00:00+03:00',
  '41770211b4b40c6c675316ace4796708179a9c08860101fdb4b23bcdf9443d97',
  'author-terms',
  false,
  true,
  '["catalog","listener_access","listener_set_price","promotion","studio_sublicense","business","business_sublicense_venues"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Проверка результата (должна вернуть 1 строку с covers_business = true, is_current = false до шага 02).
SELECT id, version, content_hash, is_current, covers_business
FROM public.author_terms_versions WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20';
COMMIT;
