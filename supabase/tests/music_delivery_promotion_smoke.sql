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
  v_desired uuid;
  v_path text;
  v_jobs_before integer;
  v_jobs_after integer;
  v_master_c uuid := '461b0001-0000-4000-8000-000000000017';
  v_master_d uuid := '461b0001-0000-4000-8000-000000000018';
  v_master_e uuid := '461b0001-0000-4000-8000-000000000019';
  v_stream_e uuid := '461b0001-0000-4000-8000-00000000001a';
  v_buyer uuid := '461b0001-0000-4000-8000-0000000000b1';
  v_order uuid := '461b0001-0000-4000-8000-0000000000c1';
  v_entitlement uuid := '461b0001-0000-4000-8000-0000000000d1';
  v_locked boolean;
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

  -- J. processing WAV A, then direct MP3 B becomes current and clears pointers.
  -- Case F requeues master B after a non-permanent fail; clear leftover queued
  -- jobs so claim cannot steal B ahead of the fresh A job.
  UPDATE public.audio_items
  SET desired_music_master_asset_id = v_master_a,
      active_music_delivery_asset_id = v_stream_b,
      audio_path = 'legacy/track.mp3'
  WHERE id = v_audio;
  DELETE FROM public.music_transcode_jobs
  WHERE source_asset_id IN (v_master_a, v_master_b)
    AND status IN ('queued', 'processing');
  INSERT INTO public.music_transcode_jobs (source_asset_id, status, attempt_count)
  VALUES (v_master_a, 'queued', 0);
  SELECT * INTO v_job FROM public.claim_music_transcode_job(1800, 3);
  IF v_job.id IS NULL OR v_job.source_asset_id IS DISTINCT FROM v_master_a THEN
    RAISE EXCEPTION 'J expected claimed job for master A';
  END IF;

  IF to_regprocedure('public.activate_music_direct_mp3_delivery(uuid,text,numeric,text,bigint,text)') IS NULL THEN
    RAISE EXCEPTION 'missing activate_music_direct_mp3_delivery';
  END IF;
  IF has_function_privilege('anon', 'public.activate_music_direct_mp3_delivery(uuid,text,numeric,text,bigint,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.activate_music_direct_mp3_delivery(uuid,text,numeric,text,bigint,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.activate_music_direct_mp3_delivery(uuid,text,numeric,text,bigint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'activate rpc grants are not hardened';
  END IF;

  IF public.activate_music_direct_mp3_delivery(
    v_audio, 'legacy/replaced-b.mp3', 42, 'replaced-b.mp3', 12345, 'draft'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'J direct MP3 activation must succeed';
  END IF;
  SELECT active_music_delivery_asset_id, desired_music_master_asset_id, audio_path
    INTO v_active, v_desired, v_path
  FROM public.audio_items WHERE id = v_audio;
  IF v_active IS NOT NULL OR v_desired IS NOT NULL OR v_path IS DISTINCT FROM 'legacy/replaced-b.mp3' THEN
    RAISE EXCEPTION 'J MP3 activation must clear pointers and set audio_path';
  END IF;

  -- K. late stream A promote cannot override current MP3
  IF public.promote_music_item_delivery(v_audio, v_stream_a) IS NOT FALSE THEN
    RAISE EXCEPTION 'K stale stream A must not promote after MP3 current';
  END IF;
  SELECT active_music_delivery_asset_id, audio_path INTO v_active, v_path
  FROM public.audio_items WHERE id = v_audio;
  IF v_active IS NOT NULL OR v_path IS DISTINCT FROM 'legacy/replaced-b.mp3' THEN
    RAISE EXCEPTION 'K MP3 delivery must remain after rejected promote';
  END IF;

  -- L. stale complete may mark job ready but must not change active
  v_ok := public.complete_music_transcode_job(v_job.id, v_job.lease_token, v_stream_a);
  SELECT active_music_delivery_asset_id, audio_path INTO v_active, v_path
  FROM public.audio_items WHERE id = v_audio;
  IF v_active IS NOT NULL OR v_path IS DISTINCT FROM 'legacy/replaced-b.mp3' THEN
    RAISE EXCEPTION 'L stale complete must not change current MP3 delivery';
  END IF;

  -- M. finalize idempotency: first uploading→verified claims desired; verified retry does not steal
  UPDATE public.audio_items
  SET audio_path = 'legacy/track.mp3',
      desired_music_master_asset_id = NULL,
      active_music_delivery_asset_id = NULL
  WHERE id = v_audio;
  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds, verified_at
  ) VALUES (
    v_master_c, v_audio, NULL, 'master', 'uploading', 'music-masters',
    'practices/'||v_practice||'/audio/'||v_audio||'/masters/'||v_master_c||'.wav',
    'c.wav', 'audio/wav', NULL, NULL, NULL
  );
  PERFORM public.finalize_music_master_asset(v_master_c, 2000, 15);
  SELECT desired_music_master_asset_id INTO v_desired FROM public.audio_items WHERE id = v_audio;
  IF v_desired IS DISTINCT FROM v_master_c THEN
    RAISE EXCEPTION 'M first finalize C must set desired=C';
  END IF;
  SELECT count(*)::integer INTO v_jobs_before FROM public.music_transcode_jobs WHERE source_asset_id = v_master_c;
  IF v_jobs_before <> 1 THEN
    RAISE EXCEPTION 'M first finalize must create one job for C';
  END IF;
  PERFORM public.finalize_music_master_asset(v_master_c, 2000, 15);
  SELECT count(*)::integer INTO v_jobs_after FROM public.music_transcode_jobs WHERE source_asset_id = v_master_c;
  IF v_jobs_after <> 1 THEN
    RAISE EXCEPTION 'M verified retry must not grow job count';
  END IF;
  SELECT desired_music_master_asset_id INTO v_desired FROM public.audio_items WHERE id = v_audio;
  IF v_desired IS DISTINCT FROM v_master_c THEN
    RAISE EXCEPTION 'M verified retry must leave desired=C';
  END IF;

  -- N. finalize D then delayed retry finalize C must not steal desired
  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds, verified_at
  ) VALUES (
    v_master_d, v_audio, NULL, 'master', 'uploading', 'music-masters',
    'practices/'||v_practice||'/audio/'||v_audio||'/masters/'||v_master_d||'.wav',
    'd.wav', 'audio/wav', NULL, NULL, NULL
  );
  PERFORM public.finalize_music_master_asset(v_master_d, 2100, 16);
  SELECT desired_music_master_asset_id INTO v_desired FROM public.audio_items WHERE id = v_audio;
  IF v_desired IS DISTINCT FROM v_master_d THEN
    RAISE EXCEPTION 'N finalize D must set desired=D';
  END IF;
  PERFORM public.finalize_music_master_asset(v_master_c, 2000, 15);
  SELECT desired_music_master_asset_id INTO v_desired FROM public.audio_items WHERE id = v_audio;
  IF v_desired IS DISTINCT FROM v_master_d THEN
    RAISE EXCEPTION 'N delayed finalize(C) must not steal desired from D';
  END IF;

  -- ------------------------------------------------------------------
  -- Sale-lock current-audio coverage (canonical practice_is_content_locked)
  -- ------------------------------------------------------------------
  -- Compile stub auth.users may lack email columns referenced by sync triggers.
  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (v_buyer, 'slice3-sale-lock-buyer@example.com', now())
  ON CONFLICT (id) DO NOTHING;

  -- Reset item to a delivered active-WAV state with no legacy path.
  UPDATE public.audio_items
  SET audio_path = NULL,
      desired_music_master_asset_id = v_master_a,
      active_music_delivery_asset_id = v_stream_a
  WHERE id = v_audio;

  -- O. unlocked replacement still allowed before any entitlement/order.
  IF public.practice_is_content_locked_after_sale(v_practice) THEN
    RAISE EXCEPTION 'O practice must start unlocked';
  END IF;
  IF public.activate_music_direct_mp3_delivery(
    v_audio, 'legacy/unlocked-replace.mp3', 40, 'u.mp3', 1111, 'draft'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'O unlocked MP3 replacement must succeed';
  END IF;
  -- Restore active-WAV delivered state for lock tests.
  UPDATE public.audio_items
  SET audio_path = NULL,
      desired_music_master_asset_id = v_master_a,
      active_music_delivery_asset_id = v_stream_a
  WHERE id = v_audio;

  -- A. user_practices locks replacement.
  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_buyer, v_practice, 'purchase');
  IF NOT public.practice_is_content_locked_after_sale(v_practice) THEN
    RAISE EXCEPTION 'A user_practices must lock practice';
  END IF;
  BEGIN
    PERFORM public.activate_music_direct_mp3_delivery(
      v_audio, 'legacy/locked-a.mp3', 41, 'a.mp3', 2222, 'draft'
    );
    RAISE EXCEPTION 'A activate must raise PRODUCT_CONTENT_LOCKED_AFTER_SALE';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%PRODUCT_CONTENT_LOCKED_AFTER_SALE%' THEN
        RAISE EXCEPTION 'A expected PRODUCT_CONTENT_LOCKED_AFTER_SALE, got %', SQLERRM;
      END IF;
  END;
  SELECT active_music_delivery_asset_id, desired_music_master_asset_id, audio_path
    INTO v_active, v_desired, v_path
  FROM public.audio_items WHERE id = v_audio;
  IF v_active IS DISTINCT FROM v_stream_a OR v_desired IS DISTINCT FROM v_master_a OR v_path IS NOT NULL THEN
    RAISE EXCEPTION 'A blocked activate must leave pointers/path unchanged';
  END IF;
  DELETE FROM public.user_practices WHERE practice_id = v_practice;

  -- B. active studio_music_entitlements locks replacement.
  INSERT INTO public.studio_music_entitlements (id, user_id, practice_id, grant_source)
  VALUES (v_entitlement, v_buyer, v_practice, 'free');
  IF NOT public.practice_is_content_locked_after_sale(v_practice) THEN
    RAISE EXCEPTION 'B studio entitlement must lock practice';
  END IF;
  BEGIN
    PERFORM public.activate_music_direct_mp3_delivery(
      v_audio, 'legacy/locked-b.mp3', 41, 'b.mp3', 2223, 'draft'
    );
    RAISE EXCEPTION 'B activate must raise PRODUCT_CONTENT_LOCKED_AFTER_SALE';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%PRODUCT_CONTENT_LOCKED_AFTER_SALE%' THEN
        RAISE EXCEPTION 'B expected PRODUCT_CONTENT_LOCKED_AFTER_SALE, got %', SQLERRM;
      END IF;
  END;
  -- C path: paid order also locks (revoke studio first so only order remains).
  UPDATE public.studio_music_entitlements
  SET revoked_at = now(), revoke_reason = 'test'
  WHERE id = v_entitlement;
  IF public.practice_is_content_locked_after_sale(v_practice) THEN
    RAISE EXCEPTION 'D revoked studio entitlement alone must not lock';
  END IF;

  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    base_price_minor_snapshot, author_id_snapshot, idempotency_key, order_kind, paid_at
  ) VALUES (
    v_order, v_buyer, v_practice, 'paid', 10000, 'RUB',
    'Slice3 Delivery', 'slice3-music-delivery-smoke', 10000,
    10000, v_author, 'slice3-sale-lock-order', 'product_purchase', now()
  );
  IF NOT public.practice_is_content_locked_after_sale(v_practice) THEN
    RAISE EXCEPTION 'C paid order must lock practice';
  END IF;

  -- E/F/G. service-role RPCs cannot bypass; pointers unchanged; no new job.
  SELECT count(*)::integer INTO v_jobs_before FROM public.music_transcode_jobs;
  BEGIN
    PERFORM public.activate_music_direct_mp3_delivery(
      v_audio, 'legacy/locked-e.mp3', 41, 'e.mp3', 2224, 'draft'
    );
    RAISE EXCEPTION 'E activate must raise under paid lock';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%PRODUCT_CONTENT_LOCKED_AFTER_SALE%' THEN
        RAISE EXCEPTION 'E expected PRODUCT_CONTENT_LOCKED_AFTER_SALE, got %', SQLERRM;
      END IF;
  END;
  INSERT INTO public.music_audio_assets (
    id, audio_item_id, source_asset_id, asset_role, lifecycle_state, storage_bucket, storage_path,
    original_file_name, accepted_mime_type, size_bytes, duration_seconds, verified_at
  ) VALUES (
    v_master_e, v_audio, NULL, 'master', 'uploading', 'music-masters',
    'practices/'||v_practice||'/audio/'||v_audio||'/masters/'||v_master_e||'.wav',
    'e.wav', 'audio/wav', NULL, NULL, NULL
  );
  BEGIN
    PERFORM public.finalize_music_master_asset(v_master_e, 3000, 20);
    RAISE EXCEPTION 'F finalize must raise under paid lock';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%PRODUCT_CONTENT_LOCKED_AFTER_SALE%' THEN
        RAISE EXCEPTION 'F expected PRODUCT_CONTENT_LOCKED_AFTER_SALE, got %', SQLERRM;
      END IF;
  END;
  SELECT active_music_delivery_asset_id, desired_music_master_asset_id, audio_path
    INTO v_active, v_desired, v_path
  FROM public.audio_items WHERE id = v_audio;
  IF v_active IS DISTINCT FROM v_stream_a OR v_desired IS DISTINCT FROM v_master_a OR v_path IS NOT NULL THEN
    RAISE EXCEPTION 'G blocked RPCs must leave path/active/desired unchanged';
  END IF;
  SELECT count(*)::integer INTO v_jobs_after FROM public.music_transcode_jobs;
  IF v_jobs_after <> v_jobs_before THEN
    RAISE EXCEPTION 'G blocked finalize must not create a transcode job';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.music_audio_assets
    WHERE id = v_master_e AND lifecycle_state = 'verified'
  ) THEN
    RAISE EXCEPTION 'F blocked finalize must leave master uploading/unverified';
  END IF;

  -- H. first-ever audio under lock is still allowed.
  UPDATE public.audio_items
  SET audio_path = NULL,
      desired_music_master_asset_id = NULL,
      active_music_delivery_asset_id = NULL
  WHERE id = v_audio;
  IF public.activate_music_direct_mp3_delivery(
    v_audio, 'legacy/first-ever.mp3', 33, 'first.mp3', 3333, 'draft'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'H first-ever MP3 under lock must succeed';
  END IF;
  SELECT audio_path, active_music_delivery_asset_id, desired_music_master_asset_id
    INTO v_path, v_active, v_desired
  FROM public.audio_items WHERE id = v_audio;
  IF v_path IS DISTINCT FROM 'legacy/first-ever.mp3' OR v_active IS NOT NULL OR v_desired IS NOT NULL THEN
    RAISE EXCEPTION 'H first-ever must set path and keep pointers null';
  END IF;

  -- I/J. sale-lock appears while replacement WAV is processing: late stream must not replace.
  -- Temporarily drop the paid lock so the fixture can reset to an active-WAV
  -- delivered state, then re-apply the lock before late promote.
  DELETE FROM public.orders WHERE id = v_order;
  UPDATE public.audio_items
  SET audio_path = NULL,
      desired_music_master_asset_id = v_master_b,
      active_music_delivery_asset_id = v_stream_a
  WHERE id = v_audio;
  INSERT INTO public.orders (
    id, user_id, practice_id, status, amount_minor, currency,
    practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
    base_price_minor_snapshot, author_id_snapshot, idempotency_key, order_kind, paid_at
  ) VALUES (
    v_order, v_buyer, v_practice, 'paid', 10000, 'RUB',
    'Slice3 Delivery', 'slice3-music-delivery-smoke', 10000,
    10000, v_author, 'slice3-sale-lock-order-i', 'product_purchase', now()
  );
  IF public.promote_music_item_delivery(v_audio, v_stream_b) IS NOT FALSE THEN
    RAISE EXCEPTION 'I locked promote must not replace delivered stream A';
  END IF;
  SELECT active_music_delivery_asset_id, desired_music_master_asset_id, audio_path
    INTO v_active, v_desired, v_path
  FROM public.audio_items WHERE id = v_audio;
  IF v_active IS DISTINCT FROM v_stream_a THEN
    RAISE EXCEPTION 'J active delivery must remain stream A';
  END IF;
  IF v_desired IS NOT NULL THEN
    RAISE EXCEPTION 'J blocked promote should clear stale desired';
  END IF;
  IF v_path IS NOT NULL THEN
    RAISE EXCEPTION 'J path must remain null';
  END IF;
END
$$;

ROLLBACK;
