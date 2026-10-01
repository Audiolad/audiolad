-- Isolated smoke for Music Passport Basic (P1-01).
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  author_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  practice_music uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
  practice_med uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
  audio_music uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
  audio_naked uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';
  audio_med uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd03';
  v_payload jsonb;
  v_hist jsonb;
  v_early jsonb;
  v_v1_at timestamptz;
  v_v2_at timestamptz;
  v_ceased timestamptz;
  v_count integer;
  v_attrs jsonb;
BEGIN
  IF to_regclass('public.music_passport_versions') IS NULL
     OR to_regclass('public.music_passport_attributes') IS NULL THEN
    RAISE EXCEPTION 'Case1: passport tables missing';
  END IF;

  IF to_regclass('public.music_rights_grants') IS NOT NULL
     OR to_regclass('public.music_lab_experiments') IS NOT NULL THEN
    RAISE EXCEPTION 'Case1b: rights or lab tables must not be created by this migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('music_passport_versions', 'music_passport_attributes')
      AND column_name IN ('eligible', 'licensed', 'review_status')
  ) THEN
    RAISE EXCEPTION 'Case1c: passport tables must not carry rights decision columns';
  END IF;

  INSERT INTO public.authors (id, name, slug)
  VALUES (author_id, 'Passport Author', 'passport-author');

  INSERT INTO public.practices (id, author_id, title, slug, product_kind, status)
  VALUES
    (practice_music, author_id, 'Music Track', 'passport-music', 'music', 'published'),
    (practice_med, author_id, 'Meditation', 'passport-med', 'practice', 'published');

  INSERT INTO public.audio_items (id, practice_id, title, music_track_code)
  VALUES
    (audio_music, practice_music, 'Song A', 'AL-T-000000041'),
    (audio_naked, practice_music, 'Song Naked', NULL),
    (audio_med, practice_med, 'Meditation Take', NULL);

  -- Case 2: fail closed before any snapshot
  v_payload := public.get_music_passport_basic(audio_music, now());
  IF v_payload->>'object' IS DISTINCT FROM 'music_passport_basic'
     OR v_payload->>'status' IS DISTINCT FROM 'NO_PASSPORT'
     OR jsonb_typeof(v_payload->'passport') IS DISTINCT FROM 'null'
     OR v_payload->>'track_code' IS DISTINCT FROM 'AL-T-000000041'
     OR v_payload ? 'review_status'
     OR v_payload ? 'active_grants'
     OR v_payload ? 'eligible' THEN
    RAISE EXCEPTION 'Case2: empty read must be NO_PASSPORT, got %', v_payload;
  END IF;
  IF v_payload::text ILIKE '%bpm%' OR v_payload::text ILIKE '%genre_class%' THEN
    RAISE EXCEPTION 'Case2b: NO_PASSPORT must not invent attributes: %', v_payload;
  END IF;

  -- Case 3–5: identity gates
  BEGIN
    PERFORM public.get_music_passport_basic(NULL, now());
    RAISE EXCEPTION 'Case3: null id must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%audio_item_id_required%' THEN
      RAISE EXCEPTION 'Case3: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.get_music_passport_basic('99999999-9999-4999-8999-999999999999'::uuid, now());
    RAISE EXCEPTION 'Case4: missing track must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%audio_item_not_found%' THEN
      RAISE EXCEPTION 'Case4: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.get_music_passport_basic(audio_med, now());
    RAISE EXCEPTION 'Case5: non-music must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%audio_item_not_music%' THEN
      RAISE EXCEPTION 'Case5: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.get_music_passport_basic(audio_naked, now());
    RAISE EXCEPTION 'Case6: music without track code must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_track_code_required%' THEN
      RAISE EXCEPTION 'Case6: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.upsert_music_passport_basic(
      audio_med,
      'stage1.v1',
      now() - interval '1 minute',
      jsonb_build_array(jsonb_build_object(
        'attribute_key', 'bpm',
        'origin', 'measured',
        'value_numeric', 90,
        'confidence', 0.5,
        'provenance', 'analyzer'
      ))
    );
    RAISE EXCEPTION 'Case7: upsert non-music must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%audio_item_not_music%' THEN
      RAISE EXCEPTION 'Case7: %', SQLERRM;
    END IF;
  END;

  -- Case 8: measured confidence required
  BEGIN
    PERFORM public.upsert_music_passport_basic(
      audio_music,
      'stage1.v1',
      now() - interval '1 minute',
      jsonb_build_array(jsonb_build_object(
        'attribute_key', 'bpm',
        'origin', 'measured',
        'value_numeric', 96,
        'provenance', 'analyzer'
      ))
    );
    RAISE EXCEPTION 'Case8: measured without confidence must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_passport_measured_confidence_required%' THEN
      RAISE EXCEPTION 'Case8: %', SQLERRM;
    END IF;
  END;

  -- Case 9: unknown attribute (rights-shaped key) rejected
  BEGIN
    PERFORM public.upsert_music_passport_basic(
      audio_music,
      'stage1.v1',
      now() - interval '1 minute',
      jsonb_build_array(jsonb_build_object(
        'attribute_key', 'eligible',
        'origin', 'interpreted',
        'value_text', 'true',
        'provenance', 'manual'
      ))
    );
    RAISE EXCEPTION 'Case9: eligible key must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_passport_attribute_unknown%' THEN
      RAISE EXCEPTION 'Case9: %', SQLERRM;
    END IF;
  END;

  -- Case 10: empty attribute list
  BEGIN
    PERFORM public.upsert_music_passport_basic(
      audio_music, 'stage1.v1', now() - interval '1 minute', '[]'::jsonb
    );
    RAISE EXCEPTION 'Case10: empty attributes must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_passport_attributes_required%' THEN
      RAISE EXCEPTION 'Case10: %', SQLERRM;
    END IF;
  END;

  v_attrs := jsonb_build_array(
    jsonb_build_object(
      'attribute_key', 'bpm',
      'origin', 'measured',
      'value_numeric', 96.5,
      'confidence', 0.91,
      'provenance', 'analyzer',
      'source_ref', 'stage1'
    ),
    jsonb_build_object(
      'attribute_key', 'musical_key',
      'origin', 'measured',
      'value_text', 'D',
      'confidence', 0.8,
      'provenance', 'analyzer'
    ),
    jsonb_build_object(
      'attribute_key', 'mode',
      'origin', 'measured',
      'value_text', 'minor',
      'confidence', 0.77,
      'provenance', 'analyzer'
    ),
    jsonb_build_object(
      'attribute_key', 'energy',
      'origin', 'measured',
      'value_numeric', 0.35,
      'confidence', 0.66,
      'provenance', 'analyzer'
    ),
    jsonb_build_object(
      'attribute_key', 'loudness_lufs',
      'origin', 'measured',
      'value_numeric', -16.2,
      'confidence', 0.99,
      'provenance', 'analyzer'
    ),
    jsonb_build_object(
      'attribute_key', 'vocal_role',
      'origin', 'measured',
      'value_text', 'instrumental',
      'confidence', 0.88,
      'provenance', 'analyzer'
    ),
    jsonb_build_object(
      'attribute_key', 'genre_class',
      'origin', 'measured',
      'value_text', 'ambient',
      'confidence', 0.7,
      'provenance', 'analyzer'
    ),
    jsonb_build_object(
      'attribute_key', 'mood',
      'origin', 'measured',
      'value_text', 'calm',
      'confidence', 0.64,
      'provenance', 'analyzer'
    ),
    jsonb_build_object(
      'attribute_key', 'instrument',
      'origin', 'measured',
      'value_text', 'piano',
      'confidence', 0.6,
      'provenance', 'analyzer'
    ),
    jsonb_build_object(
      'attribute_key', 'mood',
      'origin', 'interpreted',
      'value_text', 'warm',
      'provenance', 'manual',
      'source_ref', 'operator-note'
    ),
    jsonb_build_object(
      'attribute_key', 'genre_class',
      'origin', 'interpreted',
      'value_text', 'lounge',
      'confidence', 0.4,
      'provenance', 'manual'
    )
  );

  v_payload := public.upsert_music_passport_basic(
    audio_music,
    'stage1.v1',
    now() - interval '2 minutes',
    v_attrs
  );

  IF v_payload->>'status' IS DISTINCT FROM 'HAS_PASSPORT'
     OR (v_payload->'passport'->>'version')::integer <> 1
     OR v_payload->'passport'->>'analysis_version' IS DISTINCT FROM 'stage1.v1' THEN
    RAISE EXCEPTION 'Case11: write/read status, got %', v_payload;
  END IF;

  IF (v_payload->'passport'->'measured'->'bpm'->>'value_numeric')::numeric <> 96.5
     OR (v_payload->'passport'->'measured'->'bpm'->>'confidence')::numeric <> 0.91
     OR v_payload->'passport'->'measured'->'musical_key'->>'value_text' IS DISTINCT FROM 'D'
     OR v_payload->'passport'->'measured'->'mode'->>'value_text' IS DISTINCT FROM 'minor'
     OR (v_payload->'passport'->'measured'->'energy'->>'value_numeric')::numeric <> 0.35
     OR (v_payload->'passport'->'measured'->'loudness_lufs'->>'value_numeric')::numeric <> -16.2
     OR v_payload->'passport'->'measured'->'vocal_role'->>'value_text' IS DISTINCT FROM 'instrumental'
     OR jsonb_array_length(v_payload->'passport'->'measured'->'genre_class') <> 1
     OR v_payload->'passport'->'measured'->'genre_class'->0->>'value_text' IS DISTINCT FROM 'ambient'
     OR v_payload->'passport'->'measured'->'mood'->0->>'value_text' IS DISTINCT FROM 'calm'
     OR v_payload->'passport'->'measured'->'instrument'->0->>'value_text' IS DISTINCT FROM 'piano' THEN
    RAISE EXCEPTION 'Case12: measured roundtrip, got %', v_payload->'passport'->'measured';
  END IF;

  IF v_payload->'passport'->'interpreted'->'mood'->0->>'value_text' IS DISTINCT FROM 'warm'
     OR v_payload->'passport'->'interpreted'->'mood'->0->>'confidence' IS NOT NULL
     OR v_payload->'passport'->'interpreted'->'mood'->0->>'provenance' IS DISTINCT FROM 'manual'
     OR v_payload->'passport'->'measured'->'mood'->0->>'value_text' IS DISTINCT FROM 'calm' THEN
    RAISE EXCEPTION 'Case13: measured mood must stay distinct from interpreted mood, got %', v_payload->'passport';
  END IF;

  IF v_payload->'passport'->'measured' ? 'danceability'
     OR (v_payload->'passport'->'measured'->'bpm'->>'value_numeric') IS NULL THEN
    RAISE EXCEPTION 'Case14: unexpected measured shape %', v_payload->'passport'->'measured';
  END IF;

  v_v1_at := (v_payload->'passport'->>'activated_at')::timestamptz;

  v_early := public.get_music_passport_basic(audio_music, v_v1_at - interval '1 second');
  IF v_early->>'status' IS DISTINCT FROM 'NO_PASSPORT'
     OR jsonb_typeof(v_early->'passport') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'Case15: before activation must be NO_PASSPORT, got %', v_early;
  END IF;

  -- Case 16: second version supersedes; history remains
  v_payload := public.upsert_music_passport_basic(
    audio_music,
    'stage1.v1',
    v_v1_at - interval '30 seconds',
    jsonb_build_array(jsonb_build_object(
      'attribute_key', 'bpm',
      'origin', 'measured',
      'value_numeric', 100,
      'confidence', 0.5,
      'provenance', 'manual'
    ))
  );

  IF (v_payload->'passport'->>'version')::integer <> 2
     OR (v_payload->'passport'->'measured'->'bpm'->>'value_numeric')::numeric <> 100
     OR v_payload->'passport'->'measured' ? 'energy' THEN
    RAISE EXCEPTION 'Case16: version 2 must be a full snapshot without copied energy, got %', v_payload;
  END IF;

  v_v2_at := (v_payload->'passport'->>'activated_at')::timestamptz;

  v_hist := public.get_music_passport_basic(audio_music, v_v1_at);
  IF (v_hist->'passport'->>'version')::integer <> 1
     OR (v_hist->'passport'->'measured'->'bpm'->>'value_numeric')::numeric <> 96.5
     OR v_hist->'passport'->'interpreted'->'mood'->0->>'value_text' IS DISTINCT FROM 'warm' THEN
    RAISE EXCEPTION 'Case17: historical read must keep version 1, got %', v_hist;
  END IF;

  v_payload := public.get_music_passport_basic(audio_music, v_v2_at);
  IF (v_payload->'passport'->>'version')::integer <> 2 THEN
    RAISE EXCEPTION 'Case18: as_of at version 2 must read version 2, got %', v_payload;
  END IF;

  SELECT ceased_at INTO v_ceased
  FROM public.music_passport_versions
  WHERE audio_item_id = audio_music AND version = 1;

  IF v_ceased IS DISTINCT FROM v_v2_at THEN
    RAISE EXCEPTION 'Case19: version 1 ceased_at must equal version 2 activated_at';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.music_passport_versions
  WHERE audio_item_id = audio_music AND status = 'active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Case20: one active snapshot required, got %', v_count;
  END IF;

  -- Case 21: direct writes are closed
  PERFORM set_config('audiolad.music_passport_write', '', true);

  BEGIN
    UPDATE public.music_passport_versions
    SET analysis_version = 'tamper'
    WHERE audio_item_id = audio_music AND version = 2;
    RAISE EXCEPTION 'Case21: direct update must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_passport_write_path%' THEN
      RAISE EXCEPTION 'Case21: %', SQLERRM;
    END IF;
  END;

  BEGIN
    DELETE FROM public.music_passport_versions
    WHERE audio_item_id = audio_music AND version = 1;
    RAISE EXCEPTION 'Case22: delete must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_passport_history_immutable%' THEN
      RAISE EXCEPTION 'Case22: %', SQLERRM;
    END IF;
  END;

  PERFORM set_config('audiolad.music_passport_write', 'upsert', true);
  BEGIN
    UPDATE public.music_passport_attributes
    SET confidence = 0.1
    WHERE attribute_key = 'bpm';
    RAISE EXCEPTION 'Case23: attribute update must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_passport_attribute_immutable%' THEN
      RAISE EXCEPTION 'Case23: %', SQLERRM;
    END IF;
  END;

  BEGIN
    INSERT INTO public.music_passport_attributes (
      passport_id, attribute_key, origin, value_numeric, confidence, provenance
    )
    SELECT id, 'energy', 'measured', 0.2, 0.2, 'manual'
    FROM public.music_passport_versions
    WHERE audio_item_id = audio_music AND version = 2;
    RAISE EXCEPTION 'Case24: sealed attribute insert must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_passport_attribute_sealed%' THEN
      RAISE EXCEPTION 'Case24: %', SQLERRM;
    END IF;
  END;

  BEGIN
    UPDATE public.music_passport_versions
    SET analysis_version = 'tamper',
        updated_at = clock_timestamp()
    WHERE audio_item_id = audio_music AND version = 2;
    RAISE EXCEPTION 'Case25: sealed content update must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_passport_immutable%' THEN
      RAISE EXCEPTION 'Case25: %', SQLERRM;
    END IF;
  END;

  PERFORM set_config('audiolad.music_passport_write', '', true);

  -- Case 26: privileges
  IF has_function_privilege('anon', 'public.get_music_passport_basic(uuid, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_music_passport_basic(uuid, timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.upsert_music_passport_basic(uuid, text, timestamptz, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.upsert_music_passport_basic(uuid, text, timestamptz, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_music_passport_basic(uuid, timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.upsert_music_passport_basic(uuid, text, timestamptz, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Case26: RPC grants must be service_role only';
  END IF;

  IF has_table_privilege('anon', 'public.music_passport_versions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.music_passport_attributes', 'INSERT')
     OR has_table_privilege('anon', 'public.music_passport_attributes', 'SELECT') THEN
    RAISE EXCEPTION 'Case27: anon/authenticated must not touch passport tables';
  END IF;

  -- Case 28: future observation rejected and leaves the sealed snapshot in place
  BEGIN
    PERFORM public.upsert_music_passport_basic(
      audio_music,
      'stage1.v1',
      clock_timestamp() + interval '1 day',
      jsonb_build_array(jsonb_build_object(
        'attribute_key', 'bpm',
        'origin', 'measured',
        'value_numeric', 110,
        'confidence', 0.5,
        'provenance', 'analyzer'
      ))
    );
    RAISE EXCEPTION 'Case28: future observed_at must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%music_passport_observed_at_future%' THEN
      RAISE EXCEPTION 'Case28: %', SQLERRM;
    END IF;
  END;

  SELECT count(*) INTO v_count
  FROM public.music_passport_versions
  WHERE audio_item_id = audio_music;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Case29: failed write must not append a version, got %', v_count;
  END IF;

  -- Track identity column untouched
  IF (SELECT music_track_code FROM public.audio_items WHERE id = audio_music) IS DISTINCT FROM 'AL-T-000000041' THEN
    RAISE EXCEPTION 'Case30: music_track_code must stay unchanged';
  END IF;

  RAISE NOTICE 'music_passport_basic_smoke: ok';
END
$$;
