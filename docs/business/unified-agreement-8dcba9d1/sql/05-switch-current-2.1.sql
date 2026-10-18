-- Шаг «переключение текущей редакции на 2.1». Только с явного OK Сергея, после 04 и после деплоя кода
-- с реестром 2.1 (иначе принятие 2.1 будет отклонено как неизвестная редакция).
-- Использование: psql -v ON_ERROR_STOP=1 -f 05-switch-current-2.1.sql   (параметров нет; даты отсечения нет)
-- Дата публикации и вступления в силу 2.1 = момент переключения (как для 2.0): now() этой транзакции.
-- Повторный запуск (2.1 уже текущая) ничего не меняет.
-- Решения Сергея 18.10.2026 20:57: работа плеера без связи – новый способ использования, поэтому нужна
-- явная акцептация 2.1; принудительного отключения нет. Поэтому:
--  • 2.0 помечается commercial_access_continues = true – принявшие 2.0 сохраняют все возможности 2.0,
--    включая «АудиоЛад Бизнес» (author_business_agreement_acceptance продолжает возвращать акцепт 2.0),
--    без ограничения срока, пока не примут 2.1;
--  • 1.2 сохраняет commercial_access_continues = true (не трогаем);
--  • business_unified_agreement_active() остаётся true (2.1 covers_business);
--  • выданные права (author_business_rights_grants и т. п.) не меняются: триггеров на этой таблице нет;
--  • ничего не принимается за авторов, существующие акцепты не меняются.
-- Права opt-in уже отозваны шагом 02; повторно не трогаем.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '28bc3171-0be6-474d-8cab-aa24acaf18f6' AND content_hash = 'b6e064951696106be8ffc0b3f36d476174a9c7ca05af8418f64ba7c42c4f9175' AND covers_business) THEN
    RAISE EXCEPTION 'edition_2_1_not_inserted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_terms_versions WHERE id = '28bc3171-0be6-474d-8cab-aa24acaf18f6' AND is_current) THEN
    RAISE NOTICE 'edition 2.1 already current: no-op';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20' AND content_hash = '41770211b4b40c6c675316ace4796708179a9c08860101fdb4b23bcdf9443d97' AND covers_business AND is_current) THEN
    RAISE EXCEPTION 'expected_2_0_current_before_switch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902' AND commercial_access_continues) THEN
    RAISE EXCEPTION 'expected_1_2_commercial_access_continues';
  END IF;
  -- 2.0 keeps all its channels, Business included, with no end date (no forced cut-off).
  UPDATE public.author_terms_versions SET commercial_access_continues = true
    WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20';
  UPDATE public.author_terms_versions SET is_current = false
    WHERE document_key = 'author-terms' AND is_current;
  UPDATE public.author_terms_versions SET is_current = true, published_at = now(), effective_at = now()
    WHERE id = '28bc3171-0be6-474d-8cab-aa24acaf18f6';
END;
$$;
SELECT public.business_unified_agreement_active() AS unified_active;
SELECT version, is_current, covers_business, commercial_access_continues, published_at, effective_at
FROM public.author_terms_versions WHERE document_key = 'author-terms' ORDER BY published_at;
COMMIT;
