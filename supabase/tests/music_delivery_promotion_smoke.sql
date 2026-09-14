-- Disposable Slice 3 promotion smoke. Localhost compile database only.
BEGIN;

DO $$
DECLARE
  v_author uuid := '461b0001-0000-4000-8000-000000000001';
  v_practice uuid := '461b0001-0000-4000-8000-000000000002';
  v_audio uuid := '461b0001-0000-4000-8000-000000000003';
  v_audio_other uuid := '461b0001-0000-4000-8000-000000000013';
  v_master_a uuid := '461b0001-0000-4000-8000-000000000004';
  v_master_b uuid := '461b0001-0000-4000-8000-000000000014';
  v_stream_a uuid := '461b0001-0000-4000-8000-000000000005';
  v_stream_b uuid := '461b0001-0000-4000-8000-000000000015';
  v_stream_unverified uuid := '461b0001-0000-4000-8000-000000000006';
  v_master_other uuid := '461b0001-0000-4000-8000-000000000016';
  v_stream_other_item uuid := '461b0001-0000-4000-8000-000000000007';
  v_stream_other_source uuid := '461b0001-0000-4000-8000-000000000008';
  v_job public.music_transcode_jobs;
  v_ok boolean;
  v_active uuid;
  v_fn text;
BEGIN
  IF to_regprocedure('public.promote_music_item_delivery(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing promote rpc';
  END IF;
  IF has_function_privilege('anon', 'public.promote_music_item_delivery(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.promote_music_item_delivery(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.promote_music_item_delivery(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'promote rpc grants are not hardened';
  END IF;

  INSERT INTO public.authors (id, name, slug)
  VALUES (v_author, 'Slice3 Smoke', 'slice3-music-delivery-smoke');
  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class
  ) VALUES (
    v_practice, v_author, 'Slice3 Delivery', 'slice3-music-delivery-smoke',
    'draft', true, 0, 'music', 'release'
  );
  INSERT INTO public.audio_items (id, practice_id, title, position, audio_path)
  VALUES
    (v_audio, v_practice, 'Track', 1, 'legacy/track.mp3'),
    (v_audio_other, v_practice, 'Other', 2, 'legacy/other.mp3');

  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds, verified_at
  ) VALUES
    (v_master_a, v_audio, NULL, 'master', 'verified', 'music-masters', 'practices/'||v_practice||'/audio/'||v_audio||'/masters/'||v_master_a||'.wav',
     'a.wav', 'audio/wav', 1000, 12, now()),
    (v_master_b, v_audio, NULL, 'master', 'verified', 'music-masters', 'practices/'||v_practice||'/audio/'||v_audio||'/masters/'||v_master_b||'.wav',
     'b.wav', 'audio/wav', 1100, 13, now()),
    (v_master_other, v_audio_other, NULL, 'master', 'verified', 'music-masters', 'practices/'||v_practice||'/audio/'||v_audio_other||'/masters/'||v_master_other||'.wav',
     'other.wav', 'audio/wav', 1000, 12, now()),
    (v_stream_a, v_audio, v_master_a, 'stream', 'verified', 'music-streams', v_audio||'/'||v_master_a||'/mp3-256.mp3',
     'mp3-256.mp3', 'audio/mpeg', 800, 12, now()),
    (v_stream_b, v_audio, v_master_b, 'stream', 'verified', 'music-streams', v_audio||'/'||v_master_b||'/mp3-256.mp3',
     'mp3-256.mp3', 'audio/mpeg', 820, 13, now()),
    (v_stream_unverified, v_audio, v_master_a, 'stream', 'uploading', 'music-streams', v_audio||'/'||v_master_a||'/pending.mp3',
     'pending.mp3', 'audio/mpeg', 10, 1, NULL),
    (v_stream_other_item, v_audio_other, v_master_other, 'stream', 'verified', 'music-streams', v_audio_other||'/'||v_master_other||'/mp3-256.mp3',
     'mp3-256.mp3', 'audio/mpeg', 800, 12, now()),
    (v_stream_other_source, v_audio, v_master_b, 'stream', 'verified', 'music-streams', v_audio||'/'||v_master_b||'/wrong-source.mp3',
     'wrong.mp3', 'audio/mpeg', 800, 12, now());

  UPDATE public.audio_items SET desired_music_master_asset_id = v_master_a WHERE id = v_audio;

  -- A. verified current stream can become active
  IF public.promote_music_item_delivery(v_audio, v_stream_a) IS NOT TRUE THEN
    RAISE EXCEPTION 'A current verified stream must promote';
  END IF;
  SELECT active_music_delivery_asset_id INTO v_active FROM public.audio_items WHERE id = v_audio;
  IF v_active IS DISTINCT FROM v_stream_a THEN
    RAISE EXCEPTION 'A pointer must be stream A';
  END IF;

  -- B. unverified stream cannot
  IF public.promote_music_item_delivery(v_audio, v_stream_unverified) IS NOT FALSE THEN
    RAISE EXCEPTION 'B unverified stream must not promote';
  END IF;

  -- C. stream of another audio_item cannot
  IF public.promote_music_item_delivery(v_audio, v_stream_other_item) IS NOT FALSE THEN
    RAISE EXCEPTION 'C other audio_item stream must not promote';
  END IF;

  -- D. stream of another source cannot while desired is A
  IF public.promote_music_item_delivery(v_audio, v_stream_other_source) IS NOT FALSE THEN
    RAISE EXCEPTION 'D other source stream must not promote';
  END IF;
  SELECT active_music_delivery_asset_id INTO v_active FROM public.audio_items WHERE id = v_audio;
  IF v_active IS DISTINCT FROM v_stream_a THEN
    RAISE EXCEPTION 'D old active must remain';
  END IF;

  -- E. stale old master completion cannot overwrite newer desired B
  UPDATE public.audio_items SET desired_music_master_asset_id = v_master_b WHERE id = v_audio;
  IF public.promote_music_item_delivery(v_audio, v_stream_a) IS NOT FALSE THEN
    RAISE EXCEPTION 'E stale source A must not overwrite desired B';
  END IF;
  SELECT active_music_delivery_asset_id INTO v_active FROM public.audio_items WHERE id = v_audio;
  IF v_active IS DISTINCT FROM v_stream_a THEN
    RAISE EXCEPTION 'E pointer must stay on previous active A until B succeeds';
  END IF;

  -- F. failed replacement leaves old active (fail path never calls promote)
  INSERT INTO public.music_transcode_jobs (source_asset_id, status, attempt_count)
  VALUES (v_master_b, 'queued', 0);
  SELECT * INTO v_job FROM public.claim_music_transcode_job(1800, 3);
  v_ok := public.fail_music_transcode_job(v_job.id, v_job.lease_token, 'transcode_failed', '', 3);
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'F fail must succeed';
  END IF;
  SELECT active_music_delivery_asset_id INTO v_active FROM public.audio_items WHERE id = v_audio;
  IF v_active IS DISTINCT FROM v_stream_a THEN
    RAISE EXCEPTION 'F failed replacement must keep old active';
  END IF;

  -- G. successful current master B atomically replaces A
  IF public.promote_music_item_delivery(v_audio, v_stream_b) IS NOT TRUE THEN
    RAISE EXCEPTION 'G current B stream must promote';
  END IF;
  SELECT active_music_delivery_asset_id INTO v_active FROM public.audio_items WHERE id = v_audio;
  IF v_active IS DISTINCT FROM v_stream_b THEN
    RAISE EXCEPTION 'G pointer must be stream B';
  END IF;

  -- H. browser roles cannot promote
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    UPDATE public.audio_items SET active_music_delivery_asset_id = v_stream_a WHERE id = v_audio;
    EXECUTE 'RESET ROLE';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR integrity_constraint_violation THEN
      EXECUTE 'RESET ROLE';
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      IF SQLSTATE <> '42501' THEN
        RAISE;
      END IF;
  END;
  SELECT active_music_delivery_asset_id INTO v_active FROM public.audio_items WHERE id = v_audio;
  IF v_active IS DISTINCT FROM v_stream_b THEN
    RAISE EXCEPTION 'H authenticated must not update delivery pointer';
  END IF;

  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM public.promote_music_item_delivery(v_audio, v_stream_a);
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'H anon must not execute promote';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      RAISE;
  END;

  -- I. service_role can via RPC (already used above)
  IF public.promote_music_item_delivery(v_audio, v_stream_b) IS NOT TRUE THEN
    RAISE EXCEPTION 'I service_role promote of current stream must remain true';
  END IF;
END
$$;

ROLLBACK;
