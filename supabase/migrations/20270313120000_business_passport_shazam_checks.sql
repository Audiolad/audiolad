-- t1485u: automatic Shazam check queue for closed Business album passports.
-- ADDITIVE ONLY: one new table, service-role RPCs and two AFTER triggers that only enqueue.
-- Existing tables, columns, constraints and passport RPCs are not changed.
-- Recognition never runs in Postgres or in a Next.js request: the PM2 worker
-- audiolad-business-shazam-worker claims jobs, cuts 3 x 15 s segments and calls shazamio
-- with max_skew=1e-3. This file never approves a passport. A finished job writes
-- shazam_result='not_found' + shazam_checked_at only when exactly 3 segments returned no
-- track and none errored. A match never touches passport fields.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.business_passport_shazam_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_item_id uuid NOT NULL REFERENCES public.audio_items(id) ON DELETE CASCADE,
  master_asset_id uuid NOT NULL REFERENCES public.music_audio_assets(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('master_verified','autofill')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','no_match','match','error','skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  library_version text,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(segments) = 'array'),
  error text,
  passport_written boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX business_shazam_checks_active_uidx
  ON public.business_passport_shazam_checks(audio_item_id) WHERE status IN ('pending','running');
CREATE INDEX business_shazam_checks_track_idx
  ON public.business_passport_shazam_checks(audio_item_id, created_at DESC);
CREATE INDEX business_shazam_checks_queue_idx
  ON public.business_passport_shazam_checks(available_at) WHERE status IN ('pending','running');
ALTER TABLE public.business_passport_shazam_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_passport_shazam_checks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.business_passport_shazam_checks TO service_role;

-- Enqueue for the current verified master of a closed-album track. Returns NULL when the
-- track is not a closed Business track or has no verified master. Never raises for that.
CREATE FUNCTION public.enqueue_business_shazam_check(p_audio_item_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_asset uuid; v_id uuid; v_last public.business_passport_shazam_checks; v_passport_result text;
BEGIN
 IF p_reason IS NULL OR p_reason NOT IN ('master_verified','autofill') THEN
   RAISE EXCEPTION 'invalid_shazam_reason' USING ERRCODE='22023'; END IF;
 SELECT m.id INTO v_asset FROM public.audio_items a
   JOIN public.practices p ON p.id=a.practice_id
   JOIN public.music_audio_assets m ON m.id=a.desired_music_master_asset_id
  WHERE a.id=p_audio_item_id AND p.business_only AND p.product_kind='music' AND p.deleted_at IS NULL
    AND m.audio_item_id=a.id AND m.asset_role='master' AND m.lifecycle_state='verified';
 IF v_asset IS NULL THEN RETURN NULL; END IF;
 SELECT c.id INTO v_id FROM public.business_passport_shazam_checks c
  WHERE c.audio_item_id=p_audio_item_id AND c.status IN ('pending','running');
 IF FOUND THEN
   UPDATE public.business_passport_shazam_checks SET master_asset_id=v_asset, updated_at=now()
    WHERE id=v_id AND status='pending' AND master_asset_id<>v_asset;
   RETURN v_id;
 END IF;
 IF p_reason='autofill' THEN
   -- Pressing «Заполнить автоматически» again does not re-query Shazam for a master that
   -- already has a final answer still reflected in the passport.
   SELECT * INTO v_last FROM public.business_passport_shazam_checks c
    WHERE c.audio_item_id=p_audio_item_id AND c.master_asset_id=v_asset
    ORDER BY c.created_at DESC LIMIT 1;
   SELECT b.shazam_result INTO v_passport_result FROM public.business_track_passports b
    WHERE b.audio_item_id=p_audio_item_id;
   IF v_last.id IS NOT NULL AND (v_last.status='match'
      OR (v_last.status='no_match' AND v_passport_result='not_found')) THEN
     RETURN v_last.id;
   END IF;
 END IF;
 INSERT INTO public.business_passport_shazam_checks(audio_item_id, master_asset_id, reason)
 VALUES (p_audio_item_id, v_asset, p_reason)
 ON CONFLICT DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN
   SELECT c.id INTO v_id FROM public.business_passport_shazam_checks c
    WHERE c.audio_item_id=p_audio_item_id AND c.status IN ('pending','running');
 END IF;
 RETURN v_id;
END $$;

-- Upload/verification side: only enqueues. Any failure is swallowed with a WARNING so a
-- master upload can never fail because of the Shazam queue.
CREATE FUNCTION public.enqueue_business_shazam_on_master()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 BEGIN
   IF TG_TABLE_NAME='audio_items' THEN
     IF NEW.desired_music_master_asset_id IS NOT NULL
        AND NEW.desired_music_master_asset_id IS DISTINCT FROM OLD.desired_music_master_asset_id THEN
       PERFORM public.enqueue_business_shazam_check(NEW.id, 'master_verified');
     END IF;
   ELSIF NEW.asset_role='master' AND NEW.lifecycle_state='verified'
     AND (TG_OP='INSERT' OR OLD.lifecycle_state IS DISTINCT FROM 'verified') THEN
     PERFORM public.enqueue_business_shazam_check(NEW.audio_item_id, 'master_verified');
   END IF;
 EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'business_shazam_enqueue_skipped: %', SQLERRM;
 END;
 RETURN NULL;
END $$;
CREATE TRIGGER enqueue_business_shazam_on_desired_master
 AFTER UPDATE OF desired_music_master_asset_id ON public.audio_items
 FOR EACH ROW EXECUTE FUNCTION public.enqueue_business_shazam_on_master();
CREATE TRIGGER enqueue_business_shazam_on_master_verified
 AFTER INSERT OR UPDATE OF lifecycle_state ON public.music_audio_assets
 FOR EACH ROW EXECUTE FUNCTION public.enqueue_business_shazam_on_master();

-- One job at a time per worker. Jobs left running for 30 minutes (crashed worker) are reclaimed.
CREATE FUNCTION public.claim_business_shazam_check(p_worker text)
RETURNS SETOF public.business_passport_shazam_checks
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF nullif(btrim(p_worker),'') IS NULL THEN RAISE EXCEPTION 'shazam_worker_required' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 WITH next AS (
   SELECT c.id FROM public.business_passport_shazam_checks c
    WHERE (c.status='pending' AND c.available_at<=now())
       OR (c.status='running' AND c.locked_at < now() - interval '30 minutes')
    ORDER BY c.available_at, c.created_at
    LIMIT 1 FOR UPDATE SKIP LOCKED)
 UPDATE public.business_passport_shazam_checks c
    SET status='running', attempts=c.attempts+1, locked_at=now(), locked_by=left(p_worker,200), updated_at=now()
   FROM next WHERE c.id=next.id
 RETURNING c.*;
END $$;

-- Finish a claimed job. p_outcome: no_match | match | error | skipped | retry.
CREATE FUNCTION public.complete_business_shazam_check(
  p_check_id uuid, p_worker text, p_outcome text, p_segments jsonb,
  p_library_version text, p_error text, p_retry_after_seconds integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.business_passport_shazam_checks; b public.business_track_passports;
 v_current uuid; v_practice uuid; v_code text; v_written boolean := false; v_note text := NULL;
 v_segments jsonb := coalesce(p_segments,'[]'::jsonb);
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('no_match','match','error','skipped','retry') THEN
   RAISE EXCEPTION 'invalid_shazam_outcome' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(v_segments) <> 'array' THEN RAISE EXCEPTION 'invalid_shazam_segments' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.business_passport_shazam_checks WHERE id=p_check_id FOR UPDATE;
 IF NOT FOUND OR c.status <> 'running' OR c.locked_by IS DISTINCT FROM left(p_worker,200) THEN
   RAISE EXCEPTION 'shazam_check_not_owned' USING ERRCODE='55000'; END IF;

 IF p_outcome='retry' THEN
   UPDATE public.business_passport_shazam_checks SET status='pending', locked_at=NULL, locked_by=NULL,
     available_at=now()+make_interval(secs => greatest(coalesce(p_retry_after_seconds,60),5)),
     segments=v_segments, library_version=p_library_version, error=left(p_error,2000), updated_at=now()
    WHERE id=c.id;
   RETURN jsonb_build_object('status','pending','passport_written',false);
 END IF;

 IF p_outcome='no_match' AND (jsonb_array_length(v_segments) <> 3 OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_segments) s
      WHERE jsonb_typeof(s) <> 'object' OR (s->'matched') IS DISTINCT FROM 'false'::jsonb
         OR nullif(s->>'error','') IS NOT NULL)) THEN
   RAISE EXCEPTION 'shazam_no_match_requires_three_clean_segments' USING ERRCODE='22023'; END IF;
 IF p_outcome='match' AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_segments) s WHERE (s->'matched') = 'true'::jsonb) THEN
   RAISE EXCEPTION 'shazam_match_requires_matched_segment' USING ERRCODE='22023'; END IF;

 IF p_outcome='no_match' THEN
   SELECT a.desired_music_master_asset_id, a.practice_id, a.music_track_code INTO v_current, v_practice, v_code
     FROM public.audio_items a JOIN public.music_audio_assets m ON m.id=a.desired_music_master_asset_id
    WHERE a.id=c.audio_item_id AND m.audio_item_id=a.id AND m.asset_role='master' AND m.lifecycle_state='verified'
    FOR UPDATE OF a;
   IF v_current IS DISTINCT FROM c.master_asset_id THEN
     UPDATE public.business_passport_shazam_checks SET status='skipped', error='master_replaced',
       segments=v_segments, library_version=p_library_version, locked_at=NULL, locked_by=NULL,
       finished_at=now(), updated_at=now() WHERE id=c.id;
     PERFORM public.enqueue_business_shazam_check(c.audio_item_id, 'master_verified');
     RETURN jsonb_build_object('status','skipped','passport_written',false,'note','master_replaced');
   END IF;
   SELECT * INTO b FROM public.business_track_passports WHERE audio_item_id=c.audio_item_id FOR UPDATE;
   IF FOUND AND b.status <> 'draft' THEN
     v_note := 'passport_not_draft';
   ELSIF FOUND AND b.shazam_result='match' THEN
     v_note := 'manual_match_kept';
   ELSE
     IF NOT FOUND THEN
       INSERT INTO public.business_track_passports(audio_item_id, practice_id, al_code)
       VALUES (c.audio_item_id, v_practice, CASE WHEN v_code ~ '^AL-T-[A-Za-z0-9-]+$' THEN v_code END);
     END IF;
     UPDATE public.business_track_passports SET shazam_result='not_found', shazam_checked_at=clock_timestamp()
      WHERE audio_item_id=c.audio_item_id AND status='draft';
     v_written := FOUND;
   END IF;
 END IF;

 UPDATE public.business_passport_shazam_checks SET status=p_outcome, segments=v_segments,
   library_version=p_library_version, error=coalesce(left(p_error,2000), v_note), passport_written=v_written,
   locked_at=NULL, locked_by=NULL, finished_at=now(), updated_at=now()
  WHERE id=c.id;
 RETURN jsonb_build_object('status',p_outcome,'passport_written',v_written,'note',v_note);
END $$;

REVOKE ALL ON FUNCTION public.enqueue_business_shazam_check(uuid,text),
 public.enqueue_business_shazam_on_master(),
 public.claim_business_shazam_check(text),
 public.complete_business_shazam_check(uuid,text,text,jsonb,text,text,integer)
 FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_business_shazam_check(uuid,text),
 public.claim_business_shazam_check(text),
 public.complete_business_shazam_check(uuid,text,text,jsonb,text,text,integer)
 TO service_role;
COMMIT;
