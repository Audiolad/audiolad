-- Disposable music draft-track teardown smoke. Localhost compile database only.
BEGIN;

DO $$
DECLARE
  v_author uuid := '461c0001-0000-4000-8000-000000000001';
  v_practice uuid := '461c0001-0000-4000-8000-000000000002';
  v_ready uuid := '461c0001-0000-4000-8000-000000000003';
  v_other uuid := '461c0001-0000-4000-8000-000000000004';
  v_untitled uuid := '461c0001-0000-4000-8000-000000000005';
  v_uploading uuid := '461c0001-0000-4000-8000-000000000006';
  v_failed uuid := '461c0001-0000-4000-8000-000000000007';
  v_clear uuid := '461c0001-0000-4000-8000-000000000008';
  v_replace uuid := '461c0001-0000-4000-8000-000000000009';
  v_master_ready uuid := '461c0001-0000-4000-8000-000000000011';
  v_stream_ready uuid := '461c0001-0000-4000-8000-000000000012';
  v_master_uploading uuid := '461c0001-0000-4000-8000-000000000013';
  v_master_failed uuid := '461c0001-0000-4000-8000-000000000014';
  v_master_clear uuid := '461c0001-0000-4000-8000-000000000015';
  v_stream_clear uuid := '461c0001-0000-4000-8000-000000000016';
  v_master_old uuid := '461c0001-0000-4000-8000-000000000017';
  v_master_new uuid := '461c0001-0000-4000-8000-000000000018';
  v_master_newer uuid := '461c0001-0000-4000-8000-000000000019';
  v_result jsonb;
  v_raised boolean;
  v_count integer;
  v_title text;
  v_path text;
  v_desired uuid;
  v_active uuid;
  v_gen bigint;
  v_gen_b bigint;
  v_gen_c bigint;
  v_lifecycle text;
  v_fn text;
  v_fns text[] := ARRAY[
    'public.teardown_music_track_delivery(uuid,uuid,boolean)',
    'public.claim_music_track_upload_generation(uuid,uuid,text)'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'missing music draft teardown rpc %', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
      OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
      OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'music draft teardown rpc grants are not hardened: %', v_fn;
    END IF;
  END LOOP;

  INSERT INTO public.authors (id, name, slug)
  VALUES (v_author, 'Draft Teardown Smoke', 'music-draft-teardown-smoke');
  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class
  ) VALUES (
    v_practice, v_author, 'Draft album', 'music-draft-teardown-smoke',
    'draft', true, 0, 'music', 'release'
  );

  INSERT INTO public.audio_items (id, practice_id, title, position, audio_path, duration_seconds, status)
  VALUES
    (v_ready, v_practice, 'Аудио 4', 1, 'practices/'||v_practice||'/audio/'||v_ready||'-old.mp3', 12, 'draft'),
    (v_other, v_practice, 'Сосед', 2, NULL, NULL, 'draft'),
    (v_untitled, v_practice, '', 3, NULL, NULL, 'draft'),
    (v_uploading, v_practice, 'Аудио 5', 4, NULL, NULL, 'draft'),
    (v_failed, v_practice, 'Аудио 6', 5, NULL, NULL, 'draft'),
    (v_clear, v_practice, 'Оставить трек', 6, 'practices/'||v_practice||'/audio/'||v_clear||'-live.mp3', 9, 'draft'),
    (v_replace, v_practice, 'Замена', 7, NULL, NULL, 'draft');

  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds, verified_at
  ) VALUES
    (v_master_ready, v_ready, NULL, 'master', 'verified', 'music-masters',
     'practices/'||v_practice||'/audio/'||v_ready||'/masters/'||v_master_ready||'.wav',
     'ready.wav', 'audio/wav', 1000, 12, now()),
    (v_stream_ready, v_ready, v_master_ready, 'stream', 'verified', 'music-streams',
     v_ready||'/'||v_master_ready||'/mp3-256.mp3',
     'mp3-256.mp3', 'audio/mpeg', 800, 12, now()),
    (v_master_uploading, v_uploading, NULL, 'master', 'uploading', 'music-masters',
     'practices/'||v_practice||'/audio/'||v_uploading||'/masters/'||v_master_uploading||'.wav',
     'partial.wav', 'audio/wav', NULL, NULL, NULL),
    (v_master_failed, v_failed, NULL, 'master', 'rejected', 'music-masters',
     'practices/'||v_practice||'/audio/'||v_failed||'/masters/'||v_master_failed||'.wav',
     'bad.wav', 'audio/wav', NULL, NULL, NULL),
    (v_master_clear, v_clear, NULL, 'master', 'verified', 'music-masters',
     'practices/'||v_practice||'/audio/'||v_clear||'/masters/'||v_master_clear||'.wav',
     'clear.wav', 'audio/wav', 1000, 9, now()),
    (v_stream_clear, v_clear, v_master_clear, 'stream', 'verified', 'music-streams',
     v_clear||'/'||v_master_clear||'/mp3-256.mp3',
     'mp3-256.mp3', 'audio/mpeg', 700, 9, now());

  UPDATE public.audio_items
  SET desired_music_master_asset_id = v_master_ready,
      active_music_delivery_asset_id = v_stream_ready
  WHERE id = v_ready;
  UPDATE public.audio_items
  SET desired_music_master_asset_id = v_master_clear,
      active_music_delivery_asset_id = v_stream_clear
  WHERE id = v_clear;

  INSERT INTO public.music_transcode_jobs (
    source_asset_id, status, output_asset_id, completed_at
  ) VALUES (
    v_master_ready, 'ready', v_stream_ready, now()
  );
  INSERT INTO public.music_transcode_jobs (
    source_asset_id, status, lease_token, lease_expires_at, attempt_count
  ) VALUES (
    v_master_uploading, 'processing', gen_random_uuid(), now() + interval '30 minutes', 1
  );
  INSERT INTO public.music_transcode_jobs (
    source_asset_id, status, error_code, completed_at
  ) VALUES (
    v_master_failed, 'failed', 'transcode_failed', now()
  );
  INSERT INTO public.music_transcode_jobs (
    source_asset_id, status, output_asset_id, completed_at
  ) VALUES (
    v_master_clear, 'ready', v_stream_clear, now()
  );

  -- Naive delete of a ready music track hits the output-null guard.
  v_raised := false;
  BEGIN
    DELETE FROM public.audio_items WHERE id = v_ready;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%invalid_music_transcode_ready_job%' THEN
        v_raised := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF v_raised IS NOT TRUE THEN
    RAISE EXCEPTION 'naive delete of ready draft track must fail invalid_music_transcode_ready_job';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audio_items WHERE id = v_ready) THEN
    RAISE EXCEPTION 'failed naive delete must keep the draft track';
  END IF;

  -- Successful delete of a ready draft track, including a legacy path with no storage object.
  v_result := public.teardown_music_track_delivery(v_ready, v_practice, true);
  IF v_result->>'status' IS DISTINCT FROM 'deleted' THEN
    RAISE EXCEPTION 'ready draft track delete must return deleted';
  END IF;
  IF v_result::text NOT LIKE '%music-masters%'
    OR v_result::text NOT LIKE '%music-streams%'
    OR v_result::text NOT LIKE '%practice-audio%' THEN
    RAISE EXCEPTION 'ready draft track delete must return storage objects';
  END IF;
  IF EXISTS (SELECT 1 FROM public.audio_items WHERE id = v_ready)
    OR EXISTS (SELECT 1 FROM public.music_audio_assets WHERE audio_item_id = v_ready)
    OR EXISTS (
      SELECT 1 FROM public.music_transcode_jobs
      WHERE source_asset_id = v_master_ready OR output_asset_id = v_stream_ready
    ) THEN
    RAISE EXCEPTION 'ready draft track rows must be gone';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audio_items WHERE id = v_other) THEN
    RAISE EXCEPTION 'deleting one track must keep the rest of the project';
  END IF;

  -- Second delete is not_found and does not raise.
  v_result := public.teardown_music_track_delivery(v_ready, v_practice, true);
  IF v_result->>'status' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'second delete must return not_found';
  END IF;

  -- Empty title does not block delete.
  v_result := public.teardown_music_track_delivery(v_untitled, v_practice, true);
  IF v_result->>'status' IS DISTINCT FROM 'deleted' THEN
    RAISE EXCEPTION 'track without title must delete';
  END IF;

  -- Interrupted upload (no duration, processing job) deletes.
  v_result := public.teardown_music_track_delivery(v_uploading, v_practice, true);
  IF v_result->>'status' IS DISTINCT FROM 'deleted' THEN
    RAISE EXCEPTION 'uploading draft track must delete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.music_transcode_jobs WHERE source_asset_id = v_master_uploading
  ) THEN
    RAISE EXCEPTION 'in-flight transcode job must be removed with the track';
  END IF;

  -- Failed upload deletes.
  v_result := public.teardown_music_track_delivery(v_failed, v_practice, true);
  IF v_result->>'status' IS DISTINCT FROM 'deleted' THEN
    RAISE EXCEPTION 'failed upload track must delete';
  END IF;

  -- Clear delivery keeps the track and drops masters even when the storage object is absent.
  v_result := public.teardown_music_track_delivery(v_clear, v_practice, false);
  IF v_result->>'status' IS DISTINCT FROM 'cleared' THEN
    RAISE EXCEPTION 'clear music delivery must return cleared';
  END IF;
  SELECT title, audio_path, active_music_delivery_asset_id, desired_music_master_asset_id
    INTO v_title, v_path, v_active, v_desired
  FROM public.audio_items WHERE id = v_clear;
  IF v_title IS DISTINCT FROM 'Оставить трек'
    OR v_path IS NOT NULL
    OR v_active IS NOT NULL
    OR v_desired IS NOT NULL THEN
    RAISE EXCEPTION 'clear must keep the track and drop delivery pointers';
  END IF;
  IF EXISTS (SELECT 1 FROM public.music_audio_assets WHERE audio_item_id = v_clear) THEN
    RAISE EXCEPTION 'clear must remove music assets';
  END IF;
  v_result := public.teardown_music_track_delivery(v_clear, v_practice, false);
  IF v_result->>'status' IS DISTINCT FROM 'cleared' THEN
    RAISE EXCEPTION 'second clear must succeed';
  END IF;

  -- Replace twice: latest generation wins; an older finalize must not steal desired.
  v_gen := public.claim_music_track_upload_generation(v_replace, v_practice, NULL);
  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, upload_generation
  ) VALUES (
    v_master_old, v_replace, NULL, 'master', 'uploading', 'music-masters',
    'practices/'||v_practice||'/audio/'||v_replace||'/masters/'||v_master_old||'.wav',
    'old.wav', 'audio/wav', v_gen
  );
  v_gen_b := public.claim_music_track_upload_generation(v_replace, v_practice, NULL);
  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, upload_generation
  ) VALUES (
    v_master_new, v_replace, NULL, 'master', 'uploading', 'music-masters',
    'practices/'||v_practice||'/audio/'||v_replace||'/masters/'||v_master_new||'.wav',
    'new.wav', 'audio/wav', v_gen_b
  );
  PERFORM public.finalize_music_master_asset(v_master_new, 2200, 14);
  SELECT desired_music_master_asset_id INTO v_desired FROM public.audio_items WHERE id = v_replace;
  IF v_desired IS DISTINCT FROM v_master_new THEN
    RAISE EXCEPTION 'newer master finalize must claim desired';
  END IF;
  PERFORM public.finalize_music_master_asset(v_master_old, 2100, 13);
  SELECT lifecycle_state INTO v_lifecycle FROM public.music_audio_assets WHERE id = v_master_old;
  SELECT desired_music_master_asset_id INTO v_desired FROM public.audio_items WHERE id = v_replace;
  IF v_lifecycle IS DISTINCT FROM 'abandoned' OR v_desired IS DISTINCT FROM v_master_new THEN
    RAISE EXCEPTION 'old upload completion must not corrupt the newer master';
  END IF;
  v_gen_c := public.claim_music_track_upload_generation(v_replace, v_practice, NULL);
  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, upload_generation
  ) VALUES (
    v_master_newer, v_replace, NULL, 'master', 'uploading', 'music-masters',
    'practices/'||v_practice||'/audio/'||v_replace||'/masters/'||v_master_newer||'.wav',
    'newer.wav', 'audio/wav', v_gen_c
  );
  PERFORM public.finalize_music_master_asset(v_master_newer, 2300, 15);
  PERFORM public.finalize_music_master_asset(v_master_new, 2200, 14);
  SELECT desired_music_master_asset_id INTO v_desired FROM public.audio_items WHERE id = v_replace;
  IF v_desired IS DISTINCT FROM v_master_newer THEN
    RAISE EXCEPTION 'replace twice must keep the latest master';
  END IF;

  -- Direct MP3: stale path must not replace the latest claim. No storage object is required.
  v_gen := public.claim_music_track_upload_generation(
    v_other, v_practice, 'practices/'||v_practice||'/audio/'||v_other||'-a.mp3'
  );
  IF public.activate_music_direct_mp3_delivery(
    v_other,
    'practices/'||v_practice||'/audio/'||v_other||'-a.mp3',
    11, 'a.mp3', 1000, 'draft'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'current MP3 claim must activate';
  END IF;
  v_gen_b := public.claim_music_track_upload_generation(
    v_other, v_practice, 'practices/'||v_practice||'/audio/'||v_other||'-b.mp3'
  );
  IF public.activate_music_direct_mp3_delivery(
    v_other,
    'practices/'||v_practice||'/audio/'||v_other||'-a.mp3',
    11, 'a.mp3', 1000, 'draft'
  ) IS NOT FALSE THEN
    RAISE EXCEPTION 'old MP3 completion must not apply';
  END IF;
  SELECT audio_path INTO v_path FROM public.audio_items WHERE id = v_other;
  IF v_path IS DISTINCT FROM 'practices/'||v_practice||'/audio/'||v_other||'-a.mp3' THEN
    RAISE EXCEPTION 'stale MP3 finalize must leave the previous file in place';
  END IF;
  IF public.activate_music_direct_mp3_delivery(
    v_other,
    'practices/'||v_practice||'/audio/'||v_other||'-b.mp3',
    12, 'b.mp3', 1100, 'draft'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'latest MP3 claim must replace delivery';
  END IF;
  SELECT audio_path INTO v_path FROM public.audio_items WHERE id = v_other;
  IF v_path IS DISTINCT FROM 'practices/'||v_practice||'/audio/'||v_other||'-b.mp3' THEN
    RAISE EXCEPTION 'replace twice must keep the latest MP3';
  END IF;

  SELECT count(*) INTO v_count FROM public.audio_items WHERE practice_id = v_practice;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'project must still have the tracks that were not deleted';
  END IF;
END
$$;

ROLLBACK;
