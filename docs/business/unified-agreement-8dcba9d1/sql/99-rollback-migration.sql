-- Откат миграции 20270109120000 (функции, триггеры автопоступления, индекс, права; данные сохраняются).
-- Предусловие: текущая редакция НЕ 2.0 (сначала 03-rollback-switch.sql) и флаг выключен.
-- Таблица business_track_eligibility_reviews и колонки author_terms_versions НЕ удаляются:
-- это юридическая история (решения по трекам, отметка covers_business у строки 2.0).
-- Созданные синхронизацией гранты НЕ удаляются; при необходимости их отзывает модератор.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.author_terms_versions WHERE document_key = 'author-terms' AND is_current AND covers_business) THEN
    RAISE EXCEPTION 'switch_current_back_first';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.author_has_accepted_current_terms(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_author_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.author_terms_acceptances a
    JOIN public.author_terms_versions v ON v.id = a.terms_version_id
    WHERE a.author_id = p_author_id AND v.document_key = 'author-terms' AND v.is_current
  );
$$;
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_ins ON public.author_terms_acceptances;
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_upd ON public.business_rightsholder_verifications;
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_ins ON public.practices;
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_upd ON public.practices;
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_ins ON public.audio_items;
DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_upd ON public.audio_items;
DROP FUNCTION IF EXISTS public.business_unified_auto_sync_trigger();
DROP FUNCTION IF EXISTS public.business_unified_auto_sync_authors(uuid[]);
-- Playback overlay: restore the original resolver under its public name (body untouched, grants as in 20261206120200).
DO $$
BEGIN
  IF to_regprocedure('public.resolve_business_track_eligibility_v1(uuid,uuid,uuid,text,timestamptz)') IS NOT NULL THEN
    DROP FUNCTION IF EXISTS public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz);
    ALTER FUNCTION public.resolve_business_track_eligibility_v1(uuid, uuid, uuid, text, timestamptz)
      RENAME TO resolve_business_track_eligibility;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) TO postgres;
DROP FUNCTION IF EXISTS public.author_business_verification_draft_v3(uuid, uuid, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.business_catalog_sync(uuid, boolean);
DROP FUNCTION IF EXISTS public.business_catalog_sync_run(uuid, boolean);
DROP FUNCTION IF EXISTS public.business_track_lock(uuid);
DROP FUNCTION IF EXISTS public.business_author_lock(uuid);
DROP FUNCTION IF EXISTS public.business_unified_agreement_active();
-- Индекс идемпотентности снимается; гранты остаются.
DROP INDEX IF EXISTS public.music_rights_grants_platform_agreement_open_uidx;
-- business_catalog_sync_failures (журнал сбоев автопоступления) сохраняется как история.
DROP FUNCTION IF EXISTS public.author_business_verification_submit_v3(uuid, uuid[], inet, text);
DROP FUNCTION IF EXISTS public.business_unified_evidence_track(uuid, uuid);
DROP FUNCTION IF EXISTS public.moderator_business_track_review(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.business_track_latest_review(uuid);
DROP FUNCTION IF EXISTS public.author_commercial_agreement_state(uuid);
DROP FUNCTION IF EXISTS public.author_has_business_agreement(uuid);
DROP FUNCTION IF EXISTS public.author_business_agreement_acceptance(uuid);
-- RLS policy depends on the membership helper: replace it with a moderator-only read before dropping.
DROP POLICY IF EXISTS business_track_eligibility_reviews_read ON public.business_track_eligibility_reviews;
CREATE POLICY business_track_eligibility_reviews_read ON public.business_track_eligibility_reviews
  FOR SELECT TO authenticated USING (public.business_onboarding_is_moderator());
DROP FUNCTION IF EXISTS public.business_unified_is_author_member(uuid);
GRANT EXECUTE ON FUNCTION public.author_business_product_optin(uuid[],boolean,boolean,text,text,inet,text) TO authenticated;
COMMIT;
