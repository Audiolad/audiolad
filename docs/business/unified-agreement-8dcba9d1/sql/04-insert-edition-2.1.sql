-- Шаг «вставка редакции 2.1» (идемпотентно). НЕ делает 2.1 текущей. Только с явного OK Сергея.
-- Задача 8d9cd0af; тексты 2.1 одобрены Сергеем 18.10.2026 20:57 МСК (вариант A: новая строка, 2.0 сохраняется).
-- Требует: строка 2.0 вставлена (01), миграция 20270109120000 применена, код с реестром 2.1 задеплоен
-- (иначе страница и принятие 2.1 не узнают этот хэш).
-- Хэш = sha256 текста src/lib/author-terms/approved-content-v21.ts (AUTHOR_TERMS_V21_TEXT)
--      = sha256 docs/legal/author-agreement/edition-2.1.txt.
-- Даты: published_at/effective_at здесь – временная отметка момента вставки (now()); её нигде не
-- показывают (не текущая редакция новее текущей = «ещё не вступила в силу»). Настоящие даты ставит
-- 05-switch-current-2.1.sql в той же транзакции, что и переключение. Повтор вставки даты не меняет.
-- grants_scope = объём 2.0 + business_offline_cache (п. 8.1–8.2: кэш плеера заведения без связи).
-- Колонка справочная: ни одна функция её не читает.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.author_terms_versions') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'author_terms_versions' AND column_name = 'covers_business') THEN
    RAISE EXCEPTION 'unified_agreement_migration_not_applied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20' AND content_hash = '41770211b4b40c6c675316ace4796708179a9c08860101fdb4b23bcdf9443d97' AND covers_business) THEN
    RAISE EXCEPTION 'edition_2_0_missing';
  END IF;
  -- Тот же текст не должен существовать под другим id или другой версией.
  IF EXISTS (SELECT 1 FROM public.author_terms_versions
             WHERE content_hash = 'b6e064951696106be8ffc0b3f36d476174a9c7ca05af8418f64ba7c42c4f9175' AND id <> '28bc3171-0be6-474d-8cab-aa24acaf18f6') THEN
    RAISE EXCEPTION 'edition_2_1_duplicate_hash';
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_terms_versions
             WHERE document_key = 'author-terms' AND version = '2.1'
               AND (id <> '28bc3171-0be6-474d-8cab-aa24acaf18f6' OR content_hash <> 'b6e064951696106be8ffc0b3f36d476174a9c7ca05af8418f64ba7c42c4f9175')) THEN
    RAISE EXCEPTION 'edition_2_1_conflicting_row';
  END IF;
END;
$$;

INSERT INTO public.author_terms_versions (
  id, version, title, published_at, effective_at, content_hash, document_key, is_current,
  covers_business, grants_scope
) VALUES (
  '28bc3171-0be6-474d-8cab-aa24acaf18f6',
  '2.1',
  'Единое коммерческое соглашение с правообладателем (Авторские условия сотрудничества платформы «АудиоЛад», редакция 2.1)',
  now(),  -- временно; 05-switch-current-2.1.sql ставит дату переключения
  now(),
  'b6e064951696106be8ffc0b3f36d476174a9c7ca05af8418f64ba7c42c4f9175',
  'author-terms',
  false,
  true,
  '["catalog","listener_access","listener_set_price","promotion","studio_sublicense","business","business_sublicense_venues","business_offline_cache"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Проверка: 1 строка 2.1, covers_business = true, is_current = false; текущей остаётся 2.0.
SELECT id, version, content_hash, is_current, covers_business, commercial_access_continues, published_at, effective_at
FROM public.author_terms_versions WHERE document_key = 'author-terms' ORDER BY published_at;
COMMIT;
