-- Rollback of 20270313120000_business_passport_shazam_checks.sql (t1485u).
-- Order: 1) pm2 delete audiolad-business-shazam-worker; 2) roll back the app code; 3) apply this file.
-- Passport Shazam fields already written stay as they are (same columns as manual entry).
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS enqueue_business_shazam_on_desired_master ON public.audio_items;
DROP TRIGGER IF EXISTS enqueue_business_shazam_on_master_verified ON public.music_audio_assets;
DROP FUNCTION IF EXISTS public.complete_business_shazam_check(uuid,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.claim_business_shazam_check(text);
DROP FUNCTION IF EXISTS public.enqueue_business_shazam_on_master();
DROP FUNCTION IF EXISTS public.enqueue_business_shazam_check(uuid,text);
DROP TABLE IF EXISTS public.business_passport_shazam_checks;
COMMIT;
