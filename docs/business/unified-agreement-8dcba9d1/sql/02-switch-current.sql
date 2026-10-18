-- Шаг «переключение текущей редакции на 2.0». Только с явного OK Сергея и ТОЛЬКО когда
-- на сервере уже включён флаг AUDIOLAD_UNIFIED_AGREEMENT_ENABLED=1 (иначе приложение откажет в
-- принятии: в коде без флага допустима только 1.2).
-- Использование: psql -f 02-switch-current.sql   (параметров нет; никакой даты отсечения нет)
-- Дата публикации и вступления в силу 2.0 = момент переключения (решение Сергея 18.10.2026 15:02):
-- ставится здесь, now() этой же транзакции. Повторный запуск (2.0 уже текущая) даты не меняет.
-- Решение Сергея 17.10.2026: авторы, принявшие 1.2, сохраняют коммерческие возможности 1.2
-- (продажи, выплаты, Студия) БЕССРОЧНО — редакция 1.2 помечается commercial_access_continues.
-- Правом ограничения из п. 22.4 Платформа не пользуется. «АудиоЛад Бизнес» открывается только
-- после личной акцептации 2.0 и подтверждённой проверки прав. Авторам показывается приглашение
-- принять 2.0. Ничего не принимает за авторов. Существующие акцепты не меняются.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902' AND version = '1.2' AND document_key = 'author-terms') THEN
    RAISE EXCEPTION 'edition_1_2_missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20' AND content_hash = '41770211b4b40c6c675316ace4796708179a9c08860101fdb4b23bcdf9443d97' AND covers_business) THEN
    RAISE EXCEPTION 'edition_2_0_not_inserted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_terms_versions WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20' AND is_current) THEN
    RAISE NOTICE 'edition 2.0 already current: no-op';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902' AND is_current) THEN
    RAISE EXCEPTION 'expected_1_2_current_before_switch';
  END IF;
  -- 1.2 keeps its commercial channels with no end date (not Business). Only 1.2: 1.0/1.1-only
  -- authors stay exactly as today (they already need to accept the current edition).
  UPDATE public.author_terms_versions SET commercial_access_continues = true
    WHERE id = '9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902';
  UPDATE public.author_terms_versions SET is_current = false
    WHERE document_key = 'author-terms' AND is_current;
  UPDATE public.author_terms_versions SET is_current = true, published_at = now(), effective_at = now()
    WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20';
END;
$$;
-- Активация единой модели: попродуктовый opt-in больше не вызывается клиентами
-- (поступление треков в Бизнес — автоматическое, триггеры миграции 20270109120000).
REVOKE EXECUTE ON FUNCTION public.author_business_product_optin(uuid[],boolean,boolean,text,text,inet,text) FROM authenticated;
SELECT public.business_unified_agreement_active() AS unified_active;
SELECT version, is_current, covers_business, commercial_access_continues, published_at, effective_at
FROM public.author_terms_versions WHERE document_key = 'author-terms' ORDER BY published_at;
COMMIT;
