BEGIN;

-- ---------------------------------------------------------------------------
-- 8dcba9d1 / 8d9cd0af PR 1: block Business consents from a support session.
-- Function-only and additive: one new helper + business_onboarding_consents
-- re-created with ONE extra guard at the top (body otherwise identical to
-- 20270101120000). No table, row, grant or policy changes. No data writes.
-- Rollback: docs/business/consents-support-mode-block-8dcba9d1-rollback.sql
-- ---------------------------------------------------------------------------

-- True when the caller (auth.uid()) is acting as platform-owner support:
--   * the request carries a support proof (transaction GUC or PostgREST header), or
--   * the caller has ANY unrevoked, unexpired support session as actor.
-- The browser Business form talks to PostgREST with the staff member's own JWT,
-- so the second rule is what catches it. Fail-closed by design: staff must end
-- the support session before accepting anything for their own account.
CREATE OR REPLACE FUNCTION public.business_consent_caller_in_support_mode()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_headers json;
BEGIN
  IF nullif(btrim(coalesce(current_setting('audiolad.author_support_token_hash', true), '')), '') IS NOT NULL THEN
    RETURN true;
  END IF;
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  IF v_headers IS NOT NULL AND nullif(btrim(coalesce(v_headers->>'x-audiolad-support-proof', '')), '') IS NOT NULL THEN
    RETURN true;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.author_support_sessions s
    WHERE s.actor_user_id = auth.uid()
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
  );
END;
$$;

-- Internal helper: only the SECURITY DEFINER consent function (same owner) calls it.
REVOKE ALL ON FUNCTION public.business_consent_caller_in_support_mode() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.business_consent_caller_in_support_mode() IS 'audiolad:business-onboarding support-mode consent guard (8dcba9d1)';

CREATE OR REPLACE FUNCTION public.business_onboarding_consents(
  p_verification_id uuid, p_product_id uuid, p_context text, p_tracks jsonb, p_evidence jsonb,
  p_accept_terms boolean, p_confirm_rights boolean, p_terms_version text, p_rights_version text,
  p_ip_address inet, p_user_agent text
)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE d public.business_program_document_versions%ROWTYPE; ids uuid[] := ARRAY[]::uuid[]; v_id uuid; v_rightsholder uuid;
BEGIN
  -- 20270105120000: a platform-owner support session must never record a consent.
  -- Checked before any other rule, fail-closed (any open session of the caller or any support proof).
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;
  -- Both mandatory documents must exist and be effective now. No legal seed in this migration.
  PERFORM 1 FROM public.business_program_document_versions WHERE is_current ORDER BY document_key FOR SHARE;
  IF (SELECT count(*) FROM public.business_program_document_versions WHERE is_current AND published_at <= clock_timestamp()) <> 2 THEN
    RAISE EXCEPTION 'business_program_documents_not_published';
  END IF;
  IF p_accept_terms IS DISTINCT FROM true OR p_confirm_rights IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'business_program_consents_required';
  END IF;
  SELECT rightsholder_id INTO v_rightsholder FROM public.business_rightsholder_accounts WHERE owner_user_id = auth.uid();
  FOR d IN SELECT * FROM public.business_program_document_versions WHERE is_current ORDER BY document_key LOOP
    IF d.version IS DISTINCT FROM (CASE d.document_key WHEN 'business_program_terms' THEN p_terms_version ELSE p_rights_version END) THEN
      RAISE EXCEPTION 'business_program_document_version_changed';
    END IF;
    INSERT INTO public.business_legal_consents(user_id,owner_user_id,rightsholder_id,document_key,version,content_hash,
      acceptance_text,ip_address,user_agent,context,verification_id,product_id,evidence_snapshot,track_snapshot)
    VALUES(auth.uid(),auth.uid(),v_rightsholder,d.document_key,d.version,d.content_hash,
      CASE d.document_key WHEN 'business_program_terms' THEN
        'Я ознакомился и принимаю условия участия в программе „АудиоЛад Бизнес“'
      ELSE 'Подтверждаю, что обладаю достаточными правами и разрешениями на музыку, которую подключаю к программе, и обязуюсь предоставить подтверждающие материалы по запросу' END,
      p_ip_address,p_user_agent,p_context,p_verification_id,p_product_id,p_evidence,p_tracks) RETURNING id INTO v_id;
    ids := array_append(ids,v_id);
  END LOOP;
  RETURN ids; -- alphabetic document_key order: music rights, then terms
END;
$$;

COMMIT;
