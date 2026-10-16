-- audiolad:business-onboarding; MANUAL ONLY, never automatic deploy rollback.
-- Requires separate approval + pg_dump. Refuses loss of onboarding history or objects.
BEGIN;
DO $$
DECLARE t text; has_rows boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_program_document_versions','business_rightsholder_accounts',
    'business_rightsholder_verifications','business_rightsholder_verification_attempts','business_verification_evidence','business_legal_consents',
    'business_product_optins','business_onboarding_suspensions','business_rightsholder_moderation_audit'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t);
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)',t) INTO has_rows;
      IF has_rows THEN RAISE EXCEPTION 'business_onboarding_rollback_refuses_data_loss: %',t; END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'business-rightsholder-evidence') THEN
    RAISE EXCEPTION 'business_onboarding_rollback_refuses_storage_data_loss';
  END IF;
END $$;
DROP POLICY IF EXISTS business_onboarding_evidence_read ON storage.objects;
DROP POLICY IF EXISTS business_onboarding_evidence_insert ON storage.objects;
DROP POLICY IF EXISTS business_onboarding_evidence_read_fence ON storage.objects;
DROP POLICY IF EXISTS business_onboarding_evidence_insert_fence ON storage.objects;
DROP POLICY IF EXISTS business_onboarding_evidence_update_fence ON storage.objects;
DROP POLICY IF EXISTS business_onboarding_evidence_delete_fence ON storage.objects;

-- Tables first drop their own policies and triggers (no CASCADE to existing objects).
-- The reserve RPC returns the evidence row type, so must be removed before that table.
DROP FUNCTION IF EXISTS public.author_business_evidence_reserve(uuid,text,text,bigint,text);
DROP TABLE IF EXISTS public.business_rightsholder_moderation_audit;
DROP TABLE IF EXISTS public.business_rightsholder_verification_attempts;
DROP TABLE IF EXISTS public.business_onboarding_suspensions;
DROP TABLE IF EXISTS public.business_product_optins;
DROP TABLE IF EXISTS public.business_legal_consents;
DROP TABLE IF EXISTS public.business_verification_evidence;
-- Dropping this empty table also removes its unconditional owner_user_id unique index.
DROP TABLE IF EXISTS public.business_rightsholder_verifications;
DROP TABLE IF EXISTS public.business_rightsholder_accounts;
DROP TABLE IF EXISTS public.business_program_document_versions;
DROP FUNCTION IF EXISTS public.author_business_verification_draft(uuid,uuid,text,text,text,text);
DROP FUNCTION IF EXISTS public.author_business_verification_submit(uuid,uuid[],boolean,boolean,text,text,inet,text);
DROP FUNCTION IF EXISTS public.author_business_product_optin(uuid[],boolean,boolean,text,text,inet,text);
-- Includes the audited rejected -> needs_info reopen action; no separate RPC to drop.
DROP FUNCTION IF EXISTS public.moderator_business_verification_action(uuid,text,text,uuid,text,text);
DROP FUNCTION IF EXISTS public.moderator_business_suspend_product(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.business_onboarding_storage_access(text,boolean);
DROP FUNCTION IF EXISTS public.business_onboarding_consents(uuid,uuid,text,jsonb,jsonb,boolean,boolean,text,text,inet,text);
DROP FUNCTION IF EXISTS public.business_onboarding_product(uuid);
DROP FUNCTION IF EXISTS public.business_onboarding_append_only();
DROP FUNCTION IF EXISTS public.business_onboarding_document_immutable();
DROP FUNCTION IF EXISTS public.business_onboarding_is_moderator();
DELETE FROM storage.buckets WHERE id = 'business-rightsholder-evidence';
COMMIT;
