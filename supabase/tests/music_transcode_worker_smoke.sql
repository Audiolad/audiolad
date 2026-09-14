-- Disposable Slice 2 RPC smoke. Localhost compile database only. Never production.
BEGIN;

DO $$
DECLARE
  v_author uuid := '461a0001-0000-4000-8000-000000000001';
  v_practice uuid := '461a0001-0000-4000-8000-000000000002';
  v_audio uuid := '461a0001-0000-4000-8000-000000000003';
  v_master uuid := '461a0001-0000-4000-8000-000000000004';
  v_stream uuid := '461a0001-0000-4000-8000-000000000005';
  v_master_other uuid := '461a0001-0000-4000-8000-000000000006';
  v_stream_other uuid := '461a0001-0000-4000-8000-000000000007';
  v_job public.music_transcode_jobs;
  v_again public.music_transcode_jobs;
  v_retry public.music_transcode_jobs;
  v_complete public.music_transcode_jobs;
  v_ok boolean;
  v_raised boolean;
  v_path_before text;
  v_pointer_before uuid;
  v_path_after text;
  v_pointer_after uuid;
  v_fn text;
  v_fns text[] := ARRAY[
    'public.recover_stale_music_transcode_jobs(integer)',
    'public.claim_music_transcode_job(integer,integer)',
    'public.renew_music_transcode_job_lease(uuid,uuid,integer)',
    'public.complete_music_transcode_job(uuid,uuid,uuid)',
    'public.fail_music_transcode_job(uuid,uuid,text,text,integer)',
    'public.release_music_transcode_job(uuid,uuid)'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'missing worker rpc %', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
      OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
      OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'worker rpc grants are not hardened: %', v_fn;
    END IF;
  END LOOP;

  INSERT INTO public.authors (id, name, slug)
  VALUES (v_author, 'Slice2 Smoke', 'slice2-music-transcode-smoke');
  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class
  ) VALUES (
    v_practice, v_author, 'Slice2 Master', 'slice2-music-transcode-smoke',
    'draft', true, 0, 'music', 'release'
  );
  INSERT INTO public.audio_items (id, practice_id, title, position, audio_path)
  VALUES (v_audio, v_practice, 'Track', 0, 'legacy/track.mp3');

  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds,
    lifecycle_state, verified_at
  ) VALUES
    (
      v_master, v_audio, NULL, 'master', 'music-masters',
      v_audio::text || '/' || v_master::text || '/master.wav',
      'master.wav', 'audio/wav', 2048, 10, 'verified', now()
    ),
    (
      v_master_other, v_audio, NULL, 'master', 'music-masters',
      v_audio::text || '/' || v_master_other::text || '/master.wav',
      'other.wav', 'audio/wav', 2048, 10, 'verified', now()
    );

  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds,
    lifecycle_state, verified_at
  ) VALUES
    (
      v_stream, v_audio, v_master, 'stream', 'music-streams',
      v_audio::text || '/' || v_master::text || '/mp3-256.mp3',
      'master.mp3', 'audio/mpeg', 1024, 10, 'verified', now()
    ),
    (
      v_stream_other, v_audio, v_master_other, 'stream', 'music-streams',
      v_audio::text || '/' || v_master_other::text || '/mp3-256.mp3',
      'other.mp3', 'audio/mpeg', 1024, 10, 'verified', now()
    );

  INSERT INTO public.music_transcode_jobs (source_asset_id, status)
  VALUES (v_master, 'queued');

  SELECT * INTO v_job FROM public.claim_music_transcode_job(1800, 3);
  IF v_job.id IS NULL OR v_job.status <> 'processing' OR v_job.attempt_count <> 1
    OR v_job.lease_token IS NULL OR v_job.lease_expires_at IS NULL
    OR v_job.lease_expires_at <= now() OR v_job.started_at IS NULL THEN
    RAISE EXCEPTION 'claim did not move queued job to a valid processing lease';
  END IF;

  SELECT * INTO v_again FROM public.claim_music_transcode_job(1800, 3);
  IF v_again.id IS NOT NULL THEN
    RAISE EXCEPTION 'second claim must not return the processing job';
  END IF;

  v_ok := public.renew_music_transcode_job_lease(v_job.id, v_job.lease_token, 1800);
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'renew with exact valid lease must succeed';
  END IF;
  v_ok := public.renew_music_transcode_job_lease(v_job.id, gen_random_uuid(), 1800);
  IF v_ok IS NOT FALSE THEN
    RAISE EXCEPTION 'renew with wrong token must fail';
  END IF;

  UPDATE public.music_transcode_jobs
  SET lease_expires_at = now() - interval '1 second'
  WHERE id = v_job.id;

  IF public.renew_music_transcode_job_lease(v_job.id, v_job.lease_token, 1800) IS NOT FALSE
    OR public.complete_music_transcode_job(v_job.id, v_job.lease_token, v_stream) IS NOT FALSE
    OR public.fail_music_transcode_job(v_job.id, v_job.lease_token, 'transcode_failed', '', 3) IS NOT FALSE
    OR public.release_music_transcode_job(v_job.id, v_job.lease_token) IS NOT FALSE THEN
    RAISE EXCEPTION 'expired lease must not renew/complete/fail/release';
  END IF;

  IF public.recover_stale_music_transcode_jobs(3) < 1 THEN
    RAISE EXCEPTION 'stale recovery must requeue expired processing below max attempts';
  END IF;
  SELECT * INTO v_job FROM public.music_transcode_jobs WHERE source_asset_id = v_master;
  IF v_job.status <> 'queued' OR v_job.lease_token IS NOT NULL OR v_job.lease_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'recovered job must be queued with lease cleared';
  END IF;

  INSERT INTO public.music_transcode_jobs (
    source_asset_id, status, attempt_count, lease_token, lease_expires_at, started_at
  ) VALUES (
    v_master_other, 'processing', 3, gen_random_uuid(), now() - interval '1 second', now()
  );
  IF public.recover_stale_music_transcode_jobs(3) < 1 THEN
    RAISE EXCEPTION 'stale recovery at max attempts must fail the job';
  END IF;
  SELECT * INTO v_retry FROM public.music_transcode_jobs
  WHERE source_asset_id = v_master_other
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_retry.status <> 'failed'
    OR v_retry.lease_token IS NOT NULL
    OR v_retry.error_message_safe IS NULL
    OR v_retry.error_message_safe NOT LIKE 'Не удалось подготовить версию для прослушивания.' THEN
    RAISE EXCEPTION 'max-attempt stale recovery must fail with safe error';
  END IF;

  -- Retry policy on a fresh source-bound job: claim/fail to max 3.
  DELETE FROM public.music_transcode_jobs WHERE source_asset_id = v_master AND status IN ('queued', 'processing');
  INSERT INTO public.music_transcode_jobs (source_asset_id, status) VALUES (v_master, 'queued');
  FOR i IN 1..3 LOOP
    SELECT * INTO v_retry FROM public.claim_music_transcode_job(1800, 3);
    IF v_retry.id IS NULL OR v_retry.attempt_count <> i THEN
      RAISE EXCEPTION 'retry claim % produced attempt_count %', i, v_retry.attempt_count;
    END IF;
    v_ok := public.fail_music_transcode_job(
      v_retry.id, v_retry.lease_token, 'transcode_failed', '', 3
    );
    IF v_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'fail on attempt % must succeed', i;
    END IF;
    SELECT * INTO v_retry FROM public.music_transcode_jobs WHERE id = v_retry.id;
    IF i < 3 THEN
      IF v_retry.status <> 'queued' THEN
        RAISE EXCEPTION 'attempt % must requeue, got %', i, v_retry.status;
      END IF;
    ELSE
      IF v_retry.status <> 'failed' THEN
        RAISE EXCEPTION 'attempt 3 must fail permanently, got %', v_retry.status;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.music_transcode_jobs (source_asset_id, status) VALUES (v_master, 'queued');
  SELECT * INTO v_complete FROM public.claim_music_transcode_job(1800, 3);
  v_raised := false;
  BEGIN
    PERFORM public.complete_music_transcode_job(
      v_complete.id, v_complete.lease_token, v_stream_other
    );
  EXCEPTION
    WHEN check_violation THEN
      v_raised := true;
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%invalid_music_transcode_output_asset%' THEN
        v_raised := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF v_raised IS NOT TRUE THEN
    RAISE EXCEPTION 'complete with stream from another source must reject';
  END IF;

  SELECT audio_path, active_music_delivery_asset_id
  INTO v_path_before, v_pointer_before
  FROM public.audio_items
  WHERE id = v_audio;

  v_ok := public.complete_music_transcode_job(
    v_complete.id, v_complete.lease_token, v_stream
  );
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'complete with matching verified stream must succeed';
  END IF;
  SELECT * INTO v_complete FROM public.music_transcode_jobs WHERE id = v_complete.id;
  IF v_complete.status <> 'ready'
    OR v_complete.output_asset_id IS DISTINCT FROM v_stream
    OR v_complete.completed_at IS NULL
    OR v_complete.lease_token IS NOT NULL
    OR v_complete.lease_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'ready job contract failed';
  END IF;

  SELECT audio_path, active_music_delivery_asset_id
  INTO v_path_after, v_pointer_after
  FROM public.audio_items
  WHERE id = v_audio;
  IF v_path_after IS DISTINCT FROM v_path_before
    OR v_pointer_after IS DISTINCT FROM v_pointer_before
    OR v_path_after IS DISTINCT FROM 'legacy/track.mp3'
    OR v_pointer_after IS NOT NULL THEN
    RAISE EXCEPTION 'complete must not switch public playback pointers';
  END IF;

  v_raised := false;
  BEGIN
    UPDATE public.music_transcode_jobs
    SET status = 'ready',
        output_asset_id = NULL,
        completed_at = now(),
        lease_token = NULL,
        lease_expires_at = NULL
    WHERE id = v_complete.id;
  EXCEPTION
    WHEN check_violation THEN
      v_raised := true;
  END;
  IF v_raised IS NOT TRUE THEN
    RAISE EXCEPTION 'ready job without verified matching stream must be impossible';
  END IF;

  BEGIN
    EXECUTE 'SET ROLE service_role';
    PERFORM public.recover_stale_music_transcode_jobs(3);
    EXECUTE 'RESET ROLE';
  EXCEPTION
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      RAISE;
  END;

  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM public.claim_music_transcode_job(1800, 3);
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'anon must not execute claim';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      RAISE;
  END;
END
$$;

ROLLBACK;
