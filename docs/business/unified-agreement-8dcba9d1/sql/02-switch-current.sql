-- Шаг «переключение текущей редакции на 2.0». Только с явного OK Сергея и ТОЛЬКО когда
-- на сервере уже включён флаг AUDIOLAD_UNIFIED_AGREEMENT_ENABLED=1 (иначе приложение откажет в
-- принятии: в коде без флага допустима только 1.2).
-- Использование: psql -v grace_until='2027-01-31T23:59:59+03:00' -f 02-switch-current.sql
-- grace_until: до этого момента принятые ранее редакции (1.0–1.2) сохраняют коммерческий доступ
-- (продажи, выплаты, Студия). «АудиоЛад Бизнес» во время grace НЕ открывается: нужна личная акцептация 2.0.
-- Ничего не принимает за авторов. Существующие акцепты не меняются.
BEGIN;
SELECT set_config('audiolad.rollout_grace_until', :'grace_until', true);
DO $$
DECLARE v_grace timestamptz := nullif(current_setting('audiolad.rollout_grace_until', true), '')::timestamptz;
BEGIN
  IF v_grace IS NULL OR v_grace <= clock_timestamp() THEN
    RAISE EXCEPTION 'grace_until_must_be_in_future';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20' AND content_hash = '41770211b4b40c6c675316ace4796708179a9c08860101fdb4b23bcdf9443d97' AND covers_business) THEN
    RAISE EXCEPTION 'edition_2_0_not_inserted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.author_terms_versions WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20' AND is_current) THEN
    RAISE NOTICE 'edition 2.0 already current: no-op';
    RETURN;
  END IF;
  UPDATE public.author_terms_versions SET is_current = false
    WHERE document_key = 'author-terms' AND is_current;
  UPDATE public.author_terms_versions SET is_current = true, reaccept_grace_until = v_grace
    WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20';
END;
$$;
SELECT version, is_current, covers_business, reaccept_grace_until
FROM public.author_terms_versions WHERE document_key = 'author-terms' ORDER BY published_at;
COMMIT;
