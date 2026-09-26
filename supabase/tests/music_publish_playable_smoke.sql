-- Disposable music publish/readiness smoke after 20261007180000. Localhost only.
BEGIN;

DO $$
DECLARE
  v_author uuid := '461c0001-0000-4000-8000-000000000001';
  v_owner uuid := '461c0001-0000-4000-8000-0000000000a1';
  v_practice uuid := '461c0001-0000-4000-8000-000000000002';
  v_practice_ready uuid := '461c0001-0000-4000-8000-000000000022';
  v_practice_pub uuid := '461c0001-0000-4000-8000-000000000032';
  v_practice_mixed uuid := '461c0001-0000-4000-8000-000000000042';
  v_audio uuid := '461c0001-0000-4000-8000-000000000003';
  v_audio_ready uuid := '461c0001-0000-4000-8000-000000000023';
  v_audio_pub uuid := '461c0001-0000-4000-8000-000000000033';
  v_audio_mp3 uuid := '461c0001-0000-4000-8000-000000000043';
  v_audio_wav uuid := '461c0001-0000-4000-8000-000000000044';
  v_master uuid := '461c0001-0000-4000-8000-000000000004';
  v_master_ready uuid := '461c0001-0000-4000-8000-000000000024';
  v_master_pub uuid := '461c0001-0000-4000-8000-000000000034';
  v_master_wav uuid := '461c0001-0000-4000-8000-000000000045';
  v_stream uuid := '461c0001-0000-4000-8000-000000000005';
  v_stream_ready uuid := '461c0001-0000-4000-8000-000000000025';
  v_stream_pub uuid := '461c0001-0000-4000-8000-000000000035';
  v_stream_wav uuid := '461c0001-0000-4000-8000-000000000046';
  v_raised boolean;
  v_detail text;
  v_duration numeric;
  v_minutes integer;
  v_status text;
BEGIN
  IF to_regprocedure('public.promote_music_item_delivery(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing promote rpc';
  END IF;
  IF to_regprocedure('public.assert_practice_moderation_ready(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing assert_practice_moderation_ready';
  END IF;

  INSERT INTO public.authors (id, name, slug, access_status)
  VALUES (v_author, 'Проверка публикации', 'music-publish-playable-smoke', 'commercial');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class
  ) VALUES (
    v_practice, v_author, 'Publish WAV Music', 'music-publish-playable-smoke',
    'draft', true, 0, 'music', 'release'
  );

  INSERT INTO public.audio_items (id, practice_id, title, position, audio_path, duration_seconds)
  VALUES (v_audio, v_practice, 'Track 1', 1, NULL, NULL);

  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds, verified_at
  ) VALUES
    (v_master, v_audio, NULL, 'master', 'verified', 'music-masters',
     'practices/'||v_practice||'/audio/'||v_audio||'/masters/'||v_master||'.wav',
     'a.wav', 'audio/wav', 2048, 42, now()),
    (v_stream, v_audio, v_master, 'stream', 'verified', 'music-streams',
     v_audio||'/'||v_master||'/mp3-256.mp3',
     'mp3-256.mp3', 'audio/mpeg', 1024, 42, now());

  UPDATE public.audio_items
  SET desired_music_master_asset_id = v_master
  WHERE id = v_audio;

  -- music WAV processing without active must fail incomplete_audio.
  v_raised := false;
  BEGIN
    PERFORM public.assert_practice_moderation_ready(v_practice);
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      v_raised := true;
      IF v_detail IS DISTINCT FROM 'incomplete_audio' THEN
        RAISE EXCEPTION 'music WAV processing without active must fail incomplete_audio, got %', v_detail;
      END IF;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'music WAV processing without active must fail incomplete_audio';
  END IF;

  IF public.promote_music_item_delivery(v_audio, v_stream) IS NOT TRUE THEN
    RAISE EXCEPTION 'promote must succeed for current verified stream';
  END IF;

  SELECT duration_seconds INTO v_duration FROM public.audio_items WHERE id = v_audio;
  IF v_duration IS NULL OR v_duration <= 0 THEN
    RAISE EXCEPTION 'promote must copy stream duration onto audio_items';
  END IF;

  -- music WAV active stream must be moderation-ready.
  PERFORM public.assert_practice_moderation_ready(v_practice);

  -- post-assignment invalidation: verified STREAM is not covered by
  -- verified_music_master_immutable (masters only). If the UPDATE is allowed,
  -- readiness must fail while the active pointer remains. If an invariant
  -- blocks the UPDATE, prove the rejection and keep readiness passing.
  v_raised := false;
  v_detail := NULL;
  BEGIN
    UPDATE public.music_audio_assets
    SET lifecycle_state = 'rejected',
        verified_at = NULL
    WHERE id = v_stream;
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_detail = MESSAGE_TEXT;
      v_raised := true;
  END;

  IF (SELECT active_music_delivery_asset_id FROM public.audio_items WHERE id = v_audio)
       IS DISTINCT FROM v_stream THEN
    RAISE EXCEPTION 'post-assignment invalidation must leave the active pointer in place';
  END IF;

  IF v_raised THEN
    RAISE NOTICE 'stream mutation blocked after assignment: %', v_detail;
    PERFORM public.assert_practice_moderation_ready(v_practice);
  ELSE
    v_raised := false;
    BEGIN
      PERFORM public.assert_practice_moderation_ready(v_practice);
    EXCEPTION
      WHEN others THEN
        GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
        v_raised := true;
        IF v_detail IS DISTINCT FROM 'incomplete_audio' THEN
          RAISE EXCEPTION 'invalidated stream must fail incomplete_audio, got %', v_detail;
        END IF;
    END;
    IF NOT v_raised THEN
      RAISE EXCEPTION 'invalidated stream must fail incomplete_audio';
    END IF;
  END IF;

  -- ready job + verified stream, but no active pointer, must still fail incomplete_audio.
  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class
  ) VALUES (
    v_practice_ready, v_author, 'Ready Job Only', 'music-publish-ready-job',
    'draft', true, 0, 'music', 'release'
  );
  INSERT INTO public.audio_items (id, practice_id, title, position, audio_path, duration_seconds)
  VALUES (v_audio_ready, v_practice_ready, 'Track', 1, NULL, NULL);
  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds, verified_at
  ) VALUES
    (v_master_ready, v_audio_ready, NULL, 'master', 'verified', 'music-masters',
     'practices/'||v_practice_ready||'/audio/'||v_audio_ready||'/masters/'||v_master_ready||'.wav',
     'b.wav', 'audio/wav', 2048, 33, now()),
    (v_stream_ready, v_audio_ready, v_master_ready, 'stream', 'verified', 'music-streams',
     v_audio_ready||'/'||v_master_ready||'/mp3-256.mp3',
     'mp3-256.mp3', 'audio/mpeg', 900, 33, now());
  UPDATE public.audio_items
  SET desired_music_master_asset_id = v_master_ready
  WHERE id = v_audio_ready;
  INSERT INTO public.music_transcode_jobs (
    source_asset_id, status, output_asset_id, completed_at, attempt_count
  ) VALUES (
    v_master_ready, 'ready', v_stream_ready, now(), 1
  );

  v_raised := false;
  BEGIN
    PERFORM public.assert_practice_moderation_ready(v_practice_ready);
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      v_raised := true;
      IF v_detail IS DISTINCT FROM 'incomplete_audio' THEN
        RAISE EXCEPTION 'ready job without active must fail incomplete_audio, got %', v_detail;
      END IF;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'ready job without active must fail incomplete_audio';
  END IF;

  -- ------------------------------------------------------------------
  -- Publish duration: stream-only with NULL audio_items.duration_seconds
  -- ------------------------------------------------------------------
  IF to_regprocedure('public.publish_audio_product(uuid,timestamptz)') IS NULL
     AND to_regprocedure('public.publish_audio_product(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing publish_audio_product';
  END IF;
  IF to_regprocedure('public.music_item_effective_publish_duration_seconds(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing music_item_effective_publish_duration_seconds';
  END IF;

  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (v_owner, 'music-publish-duration-owner@example.com', now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author, v_owner, 'owner')
  ON CONFLICT ON CONSTRAINT author_members_author_user_unique DO NOTHING;

  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class,
    moderation_status
  ) VALUES (
    v_practice_pub, v_author, 'Publish Stream Duration', 'music-publish-stream-duration',
    'draft', true, 0, 'music', 'release', 'approved'
  );
  INSERT INTO public.audio_items (id, practice_id, title, position, audio_path, duration_seconds)
  VALUES (v_audio_pub, v_practice_pub, 'Stream Track', 1, NULL, NULL);
  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds, verified_at
  ) VALUES
    (v_master_pub, v_audio_pub, NULL, 'master', 'verified', 'music-masters',
     'practices/'||v_practice_pub||'/audio/'||v_audio_pub||'/masters/'||v_master_pub||'.wav',
     'pub.wav', 'audio/wav', 2048, 42, now()),
    (v_stream_pub, v_audio_pub, v_master_pub, 'stream', 'verified', 'music-streams',
     v_audio_pub||'/'||v_master_pub||'/mp3-256.mp3',
     'mp3-256.mp3', 'audio/mpeg', 1024, 42, now());
  UPDATE public.audio_items
  SET desired_music_master_asset_id = v_master_pub
  WHERE id = v_audio_pub;
  IF public.promote_music_item_delivery(v_audio_pub, v_stream_pub) IS NOT TRUE THEN
    RAISE EXCEPTION 'publish-duration promote must succeed';
  END IF;
  -- Intentional gap: item duration cleared while validated stream still has 42s.
  UPDATE public.audio_items
  SET duration_seconds = NULL
  WHERE id = v_audio_pub;
  IF (SELECT duration_seconds FROM public.audio_items WHERE id = v_audio_pub) IS NOT NULL THEN
    RAISE EXCEPTION 'publish-duration fixture must clear audio_items.duration_seconds';
  END IF;
  IF (SELECT duration_seconds FROM public.music_audio_assets WHERE id = v_stream_pub) IS DISTINCT FROM 42 THEN
    RAISE EXCEPTION 'publish-duration stream duration must stay 42';
  END IF;
  PERFORM public.assert_practice_moderation_ready(v_practice_pub);

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.publish_audio_product(v_practice_pub);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT status, duration_minutes
  INTO v_status, v_minutes
  FROM public.practices
  WHERE id = v_practice_pub;
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'stream-only publish must set status=published, got %', v_status;
  END IF;
  IF v_minutes IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'stream-only null item duration publish must set duration_minutes=1, got %', v_minutes;
  END IF;

  -- Mixed MP3 + validated WAV stream with NULL item duration.
  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, product_kind, publication_class,
    moderation_status
  ) VALUES (
    v_practice_mixed, v_author, 'Publish Mixed Duration', 'music-publish-mixed-duration',
    'draft', true, 0, 'music', 'release', 'approved'
  );
  INSERT INTO public.audio_items (id, practice_id, title, position, audio_path, duration_seconds)
  VALUES
    (v_audio_mp3, v_practice_mixed, 'MP3 Track', 1, 'practices/'||v_practice_mixed||'/a.mp3', 70),
    (v_audio_wav, v_practice_mixed, 'WAV Track', 2, NULL, NULL);
  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds, verified_at
  ) VALUES
    (v_master_wav, v_audio_wav, NULL, 'master', 'verified', 'music-masters',
     'practices/'||v_practice_mixed||'/audio/'||v_audio_wav||'/masters/'||v_master_wav||'.wav',
     'mix.wav', 'audio/wav', 2048, 50, now()),
    (v_stream_wav, v_audio_wav, v_master_wav, 'stream', 'verified', 'music-streams',
     v_audio_wav||'/'||v_master_wav||'/mp3-256.mp3',
     'mp3-256.mp3', 'audio/mpeg', 900, 50, now());
  UPDATE public.audio_items
  SET desired_music_master_asset_id = v_master_wav
  WHERE id = v_audio_wav;
  IF public.promote_music_item_delivery(v_audio_wav, v_stream_wav) IS NOT TRUE THEN
    RAISE EXCEPTION 'mixed promote must succeed';
  END IF;
  UPDATE public.audio_items
  SET duration_seconds = NULL
  WHERE id = v_audio_wav;
  PERFORM public.assert_practice_moderation_ready(v_practice_mixed);

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.publish_audio_product(v_practice_mixed);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT status, duration_minutes
  INTO v_status, v_minutes
  FROM public.practices
  WHERE id = v_practice_mixed;
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'mixed publish must set status=published, got %', v_status;
  END IF;
  IF v_minutes IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'mixed MP3+WAV publish duration_minutes must be 2, got %', v_minutes;
  END IF;
END $$;

ROLLBACK;
