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
-- Одобрение коммерческой заявки: исходное тело из 20261026120100 (проверка только текущей редакции).
CREATE OR REPLACE FUNCTION public.approve_author_commercial_application(
  p_application_id uuid,
  p_staff_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.author_commercial_applications%ROWTYPE;
  v_transition jsonb;
  v_access text;
  v_terms_accepted boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'approved' THEN
    SELECT a.access_status
    INTO v_access
    FROM public.authors AS a
    WHERE a.id = v_row.author_id;

    -- Idempotent re-approve: still finalize if terms already accepted.
    SELECT EXISTS (
      SELECT 1
      FROM public.author_terms_acceptances AS ata
      INNER JOIN public.author_terms_versions AS atv
        ON atv.id = ata.terms_version_id
       AND atv.is_current = true
      WHERE ata.author_id = v_row.author_id
    )
    INTO v_terms_accepted;

    IF v_terms_accepted
       AND coalesce(v_access, '') = 'commercial_onboarding' THEN
      v_access := public.set_author_access_status_for_commercial_application(
        v_row.author_id,
        'commercial_active',
        v_actor,
        'author_terms_already_accepted_on_approve',
        p_application_id
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'application_id', p_application_id,
      'author_id', v_row.author_id,
      'status', 'approved',
      'access_status', v_access
    );
  END IF;

  IF v_row.status NOT IN ('submitted', 'in_review', 'needs_changes') THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_transition := public.transition_author_commercial_application_status(
    p_application_id,
    'approved',
    p_staff_comment,
    NULL
  );

  v_access := public.set_author_access_status_for_commercial_application(
    v_row.author_id,
    'commercial_onboarding',
    v_actor,
    'commercial_application_approved',
    p_application_id
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.author_terms_acceptances AS ata
    INNER JOIN public.author_terms_versions AS atv
      ON atv.id = ata.terms_version_id
     AND atv.is_current = true
    WHERE ata.author_id = v_row.author_id
  )
  INTO v_terms_accepted;

  IF v_terms_accepted THEN
    v_access := public.set_author_access_status_for_commercial_application(
      v_row.author_id,
      'commercial_active',
      v_actor,
      'author_terms_already_accepted_on_approve',
      p_application_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', coalesce((v_transition ->> 'idempotent')::boolean, false),
    'application_id', p_application_id,
    'author_id', v_row.author_id,
    'status', 'approved',
    'access_status', v_access
  );
END;
$$;
REVOKE ALL ON FUNCTION public.approve_author_commercial_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_author_commercial_application(uuid, text)
  TO authenticated, service_role;
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
DROP FUNCTION IF EXISTS public.author_business_track_grant_layers(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.business_unified_is_author_member(uuid);
GRANT EXECUTE ON FUNCTION public.author_business_product_optin(uuid[],boolean,boolean,text,text,inet,text) TO authenticated;
COMMIT;
