-- Откат переключения на 2.1: текущей снова становится 2.0. Строка 2.1 и все акцепты 2.1 СОХРАНЯЮТСЯ
-- (история не удаляется). Только с явного OK Сергея.
-- 2.0 снова текущая, её commercial_access_continues = false (как до 05); 1.2 сохраняет true.
-- Даты 2.0 не меняются (дата её переключения 18.10.2026). Даты 2.1 остаются как история; страница
-- показывает 2.1 как «ещё не вступила в силу», пока она не текущая. Повторное 05 поставит новую дату.
-- Если 2.1 уже кто-то принял, 2.1 помечается commercial_access_continues = true: принявшие 2.1 (в т. ч.
-- 1.2-авторы, перешедшие сразу на 2.1) не теряют «АудиоЛад Бизнес» и продажи после отката. Если акцептов
-- 2.1 нет – false (состояние до 04/05). Акцепты не удаляются, выданные права не меняются.
BEGIN;
DO $$
DECLARE
  accepted_21 integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.author_terms_versions
                 WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20' AND content_hash = '41770211b4b40c6c675316ace4796708179a9c08860101fdb4b23bcdf9443d97' AND covers_business) THEN
    RAISE EXCEPTION 'edition_2_0_missing';
  END IF;
  SELECT count(*) INTO accepted_21 FROM public.author_terms_acceptances WHERE terms_version_id = '28bc3171-0be6-474d-8cab-aa24acaf18f6';
  UPDATE public.author_terms_versions SET is_current = false
    WHERE document_key = 'author-terms' AND is_current AND id <> '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20';
  UPDATE public.author_terms_versions SET is_current = true, commercial_access_continues = false
    WHERE id = '5d0c2b7e-3f4a-4c61-9a8e-2b0f6d1e7a20';
  -- Accepted 2.1 already: keep those authors' agreement (2.1 covers everything 2.0 does).
  UPDATE public.author_terms_versions SET commercial_access_continues = (accepted_21 > 0)
    WHERE id = '28bc3171-0be6-474d-8cab-aa24acaf18f6';
  RAISE NOTICE 'acceptances of 2.1 kept: %', accepted_21;
END;
$$;
SELECT public.business_unified_agreement_active() AS unified_active;
SELECT version, is_current, commercial_access_continues FROM public.author_terms_versions WHERE document_key = 'author-terms' ORDER BY published_at;
COMMIT;
