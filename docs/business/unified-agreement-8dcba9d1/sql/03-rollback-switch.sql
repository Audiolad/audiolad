-- Откат переключения: текущей снова становится 1.2. Строка 2.0 и все акцепты 2.0 СОХРАНЯЮТСЯ
-- (история не удаляется). Только с явного OK Сергея. После отката выключить флаг.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902' AND version = '1.2') THEN
    RAISE EXCEPTION 'edition_1_2_missing';
  END IF;
  UPDATE public.author_terms_versions SET is_current = false
    WHERE document_key = 'author-terms' AND is_current AND id <> '9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902';
  UPDATE public.author_terms_versions SET is_current = true
    WHERE id = '9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902';
END;
$$;
-- Возврат прежнего поведения Бизнеса: opt-in снова доступен, новые RPC и автопоступление
-- неактивны (business_unified_agreement_active() = false).
GRANT EXECUTE ON FUNCTION public.author_business_product_optin(uuid[],boolean,boolean,text,text,inet,text) TO authenticated;
SELECT public.business_unified_agreement_active() AS unified_active;
SELECT version, is_current FROM public.author_terms_versions WHERE document_key = 'author-terms' ORDER BY published_at;
COMMIT;
