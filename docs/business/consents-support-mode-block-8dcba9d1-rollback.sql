-- Rollback for 20270105120000_business_consents_block_support_mode.sql (8dcba9d1 PR 1).
-- SECURITY: rolling back RE-OPENS the support-mode consent hole. Only with Sergey's explicit OK.
-- Function-only: restores business_onboarding_consents from 20270101120000 verbatim and drops the helper.
-- No data is touched (no rows are created by the forward migration either).
BEGIN;

CREATE OR REPLACE FUNCTION public.business_onboarding_consents(
  p_verification_id uuid, p_product_id uuid, p_context text, p_tracks jsonb, p_evidence jsonb,
  p_accept_terms boolean, p_confirm_rights boolean, p_terms_version text, p_rights_version text,
  p_ip_address inet, p_user_agent text
)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE d public.business_program_document_versions%ROWTYPE; ids uuid[] := ARRAY[]::uuid[]; v_id uuid; v_rightsholder uuid;
BEGIN
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

DROP FUNCTION IF EXISTS public.business_consent_caller_in_support_mode();

COMMIT;
