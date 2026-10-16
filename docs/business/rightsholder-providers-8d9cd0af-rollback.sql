-- audiolad:business-onboarding; MANUAL ONLY rollback of 20270102120000_business_rightsholder_providers.sql.
-- Requires separate approval + fresh pg_dump. Refuses to lose provider data.
BEGIN;
LOCK TABLE public.business_rightsholder_verifications IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.business_rightsholder_verifications
      WHERE provider_details <> '{}'::jsonb OR service_track_url IS NULL) THEN
    RAISE EXCEPTION 'business_providers_rollback_refuses_data_loss';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.author_business_verification_submit_v2(uuid,uuid[],boolean,boolean,text,text,inet,text);
DROP FUNCTION IF EXISTS public.author_business_verification_draft_v2(uuid,uuid,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.business_onboarding_provider_error(text,text,text,jsonb);
ALTER TABLE public.business_rightsholder_verifications DROP CONSTRAINT IF EXISTS business_rv_suno_link_required;
ALTER TABLE public.business_rightsholder_verifications DROP CONSTRAINT IF EXISTS business_rv_provider_details_object;
ALTER TABLE public.business_rightsholder_verifications ALTER COLUMN service_track_url SET NOT NULL;
ALTER TABLE public.business_rightsholder_verifications DROP COLUMN IF EXISTS provider_details;
COMMIT;
