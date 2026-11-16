-- Rollback of 20270313120000_business_passport_shazam_checks.sql (t1485u).
-- Order: 1) pm2 delete audiolad-business-shazam-worker; 2) roll back the app code; 3) apply this file.
-- Passport Shazam fields already written stay as they are (same columns as manual entry).
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Restore the approval RPC of 20270311120000 exactly (grants are kept by CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.admin_approve_business_track_passport(p_audio_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.business_track_passports; missing text[];
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(),'admin_panel.access') THEN
   RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.audio_items WHERE id=p_audio_item_id FOR UPDATE;
 SELECT * INTO b FROM public.business_track_passports WHERE audio_item_id=p_audio_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'passport_missing_fields: passport' USING ERRCODE='23514'; END IF;
 IF b.status <> 'draft' THEN RAISE EXCEPTION 'passport_draft_required' USING ERRCODE='55000'; END IF;
 missing := public.business_passport_missing(b);
 IF b.human_contribution='human' AND nullif(btrim(b.human_contribution_details),'') IS NULL THEN
   missing := array_append(missing,'human_contribution_details'); END IF;
 IF cardinality(missing)>0 THEN
   RAISE EXCEPTION 'passport_missing_fields: %',array_to_string(missing,',') USING ERRCODE='23514'; END IF;
 IF b.master_sha256 IS DISTINCT FROM b.stored_master_sha256 THEN
   RAISE EXCEPTION 'passport_hash_mismatch' USING ERRCODE='23514'; END IF;
 IF b.shazam_result <> 'not_found' OR b.acoustid_result <> 'not_found' THEN
   RAISE EXCEPTION 'passport_fingerprint_match' USING ERRCODE='23514'; END IF;
 UPDATE public.business_track_passports SET status='approved',approved_by=auth.uid(),approved_at=clock_timestamp()
 WHERE audio_item_id=p_audio_item_id;
END $$;
DROP TRIGGER IF EXISTS reset_business_passport_shazam_on_master_change ON public.audio_items;
DROP FUNCTION IF EXISTS public.clear_business_passport_auto_shazam();
DROP FUNCTION IF EXISTS public.business_passport_auto_shazam_master(uuid);
DROP FUNCTION IF EXISTS public.heartbeat_business_shazam_check(uuid,text);
DROP TRIGGER IF EXISTS enqueue_business_shazam_on_desired_master ON public.audio_items;
DROP TRIGGER IF EXISTS enqueue_business_shazam_on_master_verified ON public.music_audio_assets;
DROP FUNCTION IF EXISTS public.complete_business_shazam_check(uuid,text,text,jsonb,text,text,integer);
DROP FUNCTION IF EXISTS public.claim_business_shazam_check(text);
DROP FUNCTION IF EXISTS public.enqueue_business_shazam_on_master();
DROP FUNCTION IF EXISTS public.enqueue_business_shazam_check(uuid,text);
DROP TABLE IF EXISTS public.business_passport_shazam_checks;
COMMIT;
