-- Isolated smoke for Music Rights Foundation (A4) + legal-history hardening.
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  author_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  practice_music uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  practice_med uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  audio_music uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  audio_music2 uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  audio_med uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  audio_naked uuid := '12121212-1212-4121-8121-121212121212';
  rh1 uuid;
  rh2 uuid;
  g_rec uuid;
  g_comp uuid;
  g_country uuid;
  g_ww uuid;
  g_ww_ex uuid;
  g_draft_terr uuid;
  g_v1 uuid;
  g_v2 uuid;
  g_v2b uuid;
  g_del uuid;
  passport jsonb;
  cnt integer;
  raised boolean;
  v_err text;
  v_status text;
  v_verified_at timestamptz;
BEGIN
  -- Case 1: tables exist
  IF to_regclass('public.music_rightsholders') IS NULL
     OR to_regclass('public.music_rights_grants') IS NULL
     OR to_regclass('public.music_rights_grant_countries') IS NULL THEN
    RAISE EXCEPTION 'Case1: rights tables missing';
  END IF;

  INSERT INTO public.authors (id, name, slug)
  VALUES (author_id, 'Creator Author', 'creator-author');

  INSERT INTO public.practices (id, author_id, title, slug, product_kind, music_usage_permission, status)
  VALUES
    (practice_music, author_id, 'Music Track', 'music-track', 'music', 'platform_reuse_allowed', 'published'),
    (practice_med, author_id, 'Meditation', 'meditation-x', 'practice', NULL, 'published');

  INSERT INTO public.audio_items (id, practice_id, title, music_track_code)
  VALUES
    (audio_music, practice_music, 'Song A', 'AL-T-000000001'),
    (audio_music2, practice_music, 'Song B', 'AL-T-000000002'),
    (audio_med, practice_med, 'Med Audio', NULL),
    (audio_naked, practice_music, 'Naked', 'AL-T-000000099');

  -- Case 2–3: Rightsholder separate from Author; no author_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'music_rightsholders' AND column_name = 'author_id'
  ) THEN
    RAISE EXCEPTION 'Case3: rightsholder must not require author_id';
  END IF;

  INSERT INTO public.music_rightsholders (display_name, entity_type)
  VALUES ('Rights Holder One', 'person')
  RETURNING id INTO rh1;

  INSERT INTO public.music_rightsholders (display_name, entity_type)
  VALUES ('Rights Org Two', 'organization')
  RETURNING id INTO rh2;

  SELECT count(*) INTO cnt FROM public.music_rightsholders;
  IF cnt < 2 THEN RAISE EXCEPTION 'Case2: rightsholders missing'; END IF;

  -- Case 4–5: recording + composition for same Track (worldwide insert-as-verified OK)
  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at
  ) VALUES (
    audio_music, rh1, 'recording', 'business_background_playback', 'worldwide',
    now() - interval '1 day', 'direct_license', 'verified', now()
  ) RETURNING id INTO g_rec;

  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at
  ) VALUES (
    audio_music, rh1, 'composition', 'business_background_playback', 'worldwide',
    now() - interval '1 day', 'direct_license', 'verified', now()
  ) RETURNING id INTO g_comp;

  IF g_rec = g_comp THEN RAISE EXCEPTION 'Case5: recording/composition must be separate rows'; END IF;

  -- Case 6–7: one RH many grants; many RH one Track
  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at
  ) VALUES (
    audio_music, rh1, 'recording', 'on_demand_playback', 'worldwide',
    now() - interval '1 day', 'platform_agreement', 'verified', now()
  );

  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at
  ) VALUES (
    audio_music, rh2, 'recording', 'public_performance_context', 'worldwide',
    now() - interval '1 day', 'cmo_pro', 'verified', now()
  );

  -- Case 8–10: use_type isolation vocabulary
  SELECT count(*) INTO cnt FROM public.music_rights_grants
  WHERE id = g_rec AND use_type = 'business_background_playback';
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case8: background use_type missing'; END IF;

  SELECT count(*) INTO cnt FROM public.music_rights_grants
  WHERE audio_item_id = audio_music
    AND use_type = 'business_background_playback'
    AND use_type = 'offline_storage_cache';
  IF cnt <> 0 THEN RAISE EXCEPTION 'Case9: background must not imply offline'; END IF;

  SELECT count(*) INTO cnt FROM public.music_rights_grants
  WHERE id = g_rec AND use_type IN ('advertising_adjacency', 'advertising_synchronization');
  IF cnt <> 0 THEN RAISE EXCEPTION 'Case10: playback grant is not advertising'; END IF;

  -- Case H/I: countries grant — draft → territory → verify (not verified-before-rows)
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grants (
      audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, source_type, status, verified_at
    ) VALUES (
      audio_music2, rh1, 'recording', 'business_background_playback', 'countries',
      now() - interval '1 day', 'contract', 'verified', now()
    );
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_territory_incomplete' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseH: countries cannot insert as verified with zero includes got %', v_err;
  END IF;

  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at
  ) VALUES (
    audio_music2, rh1, 'recording', 'business_background_playback', 'countries',
    now() - interval '1 day', 'contract', 'draft', NULL
  ) RETURNING id INTO g_country;

  -- Case G: draft territory editable
  INSERT INTO public.music_rights_grant_countries (grant_id, country_code, effect)
  VALUES (g_country, 'DE', 'include');
  UPDATE public.music_rights_grant_countries
  SET country_code = 'FR'
  WHERE grant_id = g_country AND country_code = 'DE';
  INSERT INTO public.music_rights_grant_countries (grant_id, country_code, effect)
  VALUES (g_country, 'DE', 'include');

  -- verify with includes (Case I / Case 11)
  UPDATE public.music_rights_grants
  SET status = 'verified', verified_at = now()
  WHERE id = g_country;

  -- Case J: worldwide zero excludes can verify (insert-as-verified)
  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at
  ) VALUES (
    audio_music2, rh2, 'composition', 'business_background_playback', 'worldwide',
    now() - interval '1 day', 'distributor', 'verified', now()
  ) RETURNING id INTO g_ww;

  -- Case K / 12–13: worldwide + excludes — draft → exclude → verify
  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at
  ) VALUES (
    audio_music2, rh2, 'recording', 'offline_storage_cache', 'worldwide',
    now() - interval '1 day', 'distributor', 'draft', NULL
  ) RETURNING id INTO g_ww_ex;

  INSERT INTO public.music_rights_grant_countries (grant_id, country_code, effect)
  VALUES (g_ww_ex, 'US', 'exclude');

  UPDATE public.music_rights_grants
  SET status = 'verified', verified_at = now()
  WHERE id = g_ww_ex;

  -- Case 14: invalid country on a fresh draft
  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at
  ) VALUES (
    audio_music2, rh1, 'recording', 'loop', 'countries',
    now(), 'other', 'draft', NULL
  ) RETURNING id INTO g_draft_terr;

  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grant_countries (grant_id, country_code, effect)
    VALUES (g_draft_terr, 'deu', 'include');
  EXCEPTION WHEN check_violation OR others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case14: invalid country must fail'; END IF;

  -- Case 15: valid_until <= valid_from
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grants (
      audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, valid_until, source_type, status, verified_at
    ) VALUES (
      audio_music2, rh1, 'recording', 'crossfade', 'worldwide',
      now(), now() - interval '1 hour', 'other', 'draft', NULL
    );
  EXCEPTION WHEN check_violation OR others THEN
    raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case15: invalid validity range must fail'; END IF;

  -- Case 16–17: verified without verified_at
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grants (
      audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, source_type, status, verified_at
    ) VALUES (
      audio_music2, rh1, 'recording', 'tempo_adjustment', 'worldwide',
      now(), 'other', 'verified', NULL
    );
  EXCEPTION WHEN check_violation OR others THEN
    raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case17: verified without verified_at must fail'; END IF;

  -- Case 18–19 / Q–U: versioning — draft → verify → successor → supersede
  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at, version
  ) VALUES (
    audio_music2, rh1, 'recording', 'tempo_adjustment', 'worldwide',
    now(), 'other', 'draft', NULL, 1
  ) RETURNING id INTO g_v1;

  UPDATE public.music_rights_grants
  SET status = 'verified', verified_at = now()
  WHERE id = g_v1
  RETURNING verified_at INTO v_verified_at;

  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, version, supersedes_grant_id, verified_at
  ) VALUES (
    audio_music2, rh1, 'recording', 'tempo_adjustment', 'worldwide',
    now(), 'other', 'verified', 2, g_v1, now()
  ) RETURNING id INTO g_v2;

  UPDATE public.music_rights_grants
  SET status = 'superseded'
  WHERE id = g_v1;

  SELECT status INTO v_status FROM public.music_rights_grants WHERE id = g_v1;
  IF v_status IS DISTINCT FROM 'superseded' THEN
    RAISE EXCEPTION 'Case18: old grant should be superseded got %', v_status;
  END IF;

  SELECT count(*) INTO cnt FROM public.music_rights_grants WHERE id = g_v1;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case19: old version must remain queryable'; END IF;

  -- Case Q: wrong version rejected
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grants (
      audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, source_type, status, version, supersedes_grant_id, verified_at
    ) VALUES (
      audio_music2, rh1, 'recording', 'tempo_adjustment', 'worldwide',
      now(), 'other', 'draft', 9, g_v2, NULL
    );
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('supersedes_version_mismatch' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseQ: version must be predecessor+1 got %', v_err;
  END IF;

  -- Case R: successor Track mismatch
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grants (
      audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, source_type, status, version, supersedes_grant_id, verified_at
    ) VALUES (
      audio_music, rh1, 'recording', 'tempo_adjustment', 'worldwide',
      now(), 'other', 'draft', 3, g_v2, NULL
    );
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('supersedes_audio_item_mismatch' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseR: Track mismatch must fail got %', v_err;
  END IF;

  -- Case S: rights_layer mismatch
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grants (
      audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, source_type, status, version, supersedes_grant_id, verified_at
    ) VALUES (
      audio_music2, rh1, 'composition', 'tempo_adjustment', 'worldwide',
      now(), 'other', 'draft', 3, g_v2, NULL
    );
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('supersedes_rights_layer_mismatch' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseS: rights_layer mismatch must fail got %', v_err;
  END IF;

  -- Case T: use_type mismatch
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grants (
      audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, source_type, status, version, supersedes_grant_id, verified_at
    ) VALUES (
      audio_music2, rh1, 'recording', 'stem_use', 'worldwide',
      now(), 'other', 'draft', 3, g_v2, NULL
    );
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('supersedes_use_type_mismatch' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseT: use_type mismatch must fail got %', v_err;
  END IF;

  -- Case U: second successor of same predecessor rejected
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grants (
      audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, source_type, status, version, supersedes_grant_id, verified_at
    ) VALUES (
      audio_music2, rh2, 'recording', 'tempo_adjustment', 'worldwide',
      now(), 'other', 'verified', 2, g_v1, now()
    ) RETURNING id INTO g_v2b;
  EXCEPTION WHEN unique_violation OR others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'CaseU: second successor must fail'; END IF;

  -- Protect legal fields on verified
  raised := false;
  BEGIN
    UPDATE public.music_rights_grants SET use_type = 'stem_use' WHERE id = g_rec;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Case18b: verified legal fields must be immutable'; END IF;

  -- Case A: verified DELETE rejected
  raised := false;
  BEGIN
    DELETE FROM public.music_rights_grants WHERE id = g_rec;
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_history_immutable' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseA: verified DELETE must fail got %', v_err;
  END IF;

  -- Case B: superseded DELETE rejected
  raised := false;
  BEGIN
    DELETE FROM public.music_rights_grants WHERE id = g_v1;
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_history_immutable' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseB: superseded DELETE must fail got %', v_err;
  END IF;

  -- Case C: revoked DELETE rejected
  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, verified_at
  ) VALUES (
    audio_music2, rh1, 'recording', 'remix_derivative', 'worldwide',
    now(), 'other', 'verified', now()
  ) RETURNING id INTO g_del;
  UPDATE public.music_rights_grants SET status = 'revoked' WHERE id = g_del;
  raised := false;
  BEGIN
    DELETE FROM public.music_rights_grants WHERE id = g_del;
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_history_immutable' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseC: revoked DELETE must fail got %', v_err;
  END IF;

  -- Case D/E/F: territory mutations on verified rejected
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grant_countries (grant_id, country_code, effect)
    VALUES (g_rec, 'RU', 'exclude');
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_territory_immutable' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseD: territory INSERT on verified must fail got %', v_err;
  END IF;

  raised := false;
  BEGIN
    UPDATE public.music_rights_grant_countries
    SET country_code = 'CA'
    WHERE grant_id = g_ww_ex AND country_code = 'US';
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_territory_immutable' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseE: territory UPDATE on verified must fail got %', v_err;
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.music_rights_grant_countries
    WHERE grant_id = g_ww_ex AND country_code = 'US';
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_territory_immutable' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseF: territory DELETE on verified must fail got %', v_err;
  END IF;

  -- Case L: verified → draft rejected
  raised := false;
  BEGIN
    UPDATE public.music_rights_grants SET status = 'draft', verified_at = NULL WHERE id = g_rec;
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'CaseL: verified→draft must fail'; END IF;

  -- Case M: superseded → verified rejected
  raised := false;
  BEGIN
    UPDATE public.music_rights_grants SET status = 'verified' WHERE id = g_v1;
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_lifecycle_forbidden' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseM: superseded→verified must fail got %', v_err;
  END IF;

  -- Case N: revoked → verified rejected
  raised := false;
  BEGIN
    UPDATE public.music_rights_grants SET status = 'verified' WHERE id = g_del;
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_lifecycle_forbidden' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseN: revoked→verified must fail got %', v_err;
  END IF;

  -- Case O: draft → superseded/revoked rejected
  raised := false;
  BEGIN
    UPDATE public.music_rights_grants SET status = 'superseded', verified_at = now()
    WHERE id = g_draft_terr;
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_lifecycle_forbidden' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseO: draft→superseded must fail got %', v_err;
  END IF;

  raised := false;
  BEGIN
    UPDATE public.music_rights_grants SET status = 'revoked', verified_at = now()
    WHERE id = g_draft_terr;
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('grant_lifecycle_forbidden' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseO2: draft→revoked must fail got %', v_err;
  END IF;

  -- Case P: verified_at cannot be rewritten
  raised := false;
  BEGIN
    UPDATE public.music_rights_grants
    SET verified_at = v_verified_at - interval '1 day'
    WHERE id = g_v2;
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('verified_at_immutable' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseP: verified_at rewrite must fail got %', v_err;
  END IF;

  -- Case 20–22: passport projection
  passport := public.get_music_rights_passport_basic(audio_music, now());
  IF passport->>'review_status' IS DISTINCT FROM 'HAS_VERIFIED_GRANTS' THEN
    RAISE EXCEPTION 'Case20: expected HAS_VERIFIED_GRANTS got %', passport;
  END IF;
  IF passport ? 'eligible' OR passport ? 'eligibility' THEN
    RAISE EXCEPTION 'Case22: passport must not return eligibility boolean';
  END IF;
  IF passport->>'track_code' IS DISTINCT FROM 'AL-T-000000001' THEN
    RAISE EXCEPTION 'Case20: track_code missing %', passport;
  END IF;

  -- Case 21 / CaseX: existing music Track no grants → REVIEW_REQUIRED
  passport := public.get_music_rights_passport_basic(audio_naked, now());
  IF passport->>'review_status' IS DISTINCT FROM 'REVIEW_REQUIRED' THEN
    RAISE EXCEPTION 'Case21/CaseX: expected REVIEW_REQUIRED got %', passport;
  END IF;

  -- Case V: missing audio_item → audio_item_not_found
  raised := false;
  BEGIN
    passport := public.get_music_rights_passport_basic('99999999-9999-4999-8999-999999999999'::uuid, now());
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('audio_item_not_found' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseV: missing track must raise audio_item_not_found got %', v_err;
  END IF;

  -- Case W: non-music → audio_item_not_music
  raised := false;
  BEGIN
    passport := public.get_music_rights_passport_basic(audio_med, now());
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('audio_item_not_music' in v_err) = 0 THEN
    RAISE EXCEPTION 'CaseW: non-music passport must fail got %', v_err;
  END IF;

  -- Case 23–24: no auto-backfill / no Studio map
  SELECT count(*) INTO cnt FROM public.music_rights_grants
  WHERE audio_item_id = audio_naked;
  IF cnt <> 0 THEN RAISE EXCEPTION 'Case23: auto-backfill must not exist'; END IF;

  SELECT count(*) INTO cnt FROM public.practices
  WHERE id = practice_music AND music_usage_permission = 'platform_reuse_allowed';
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case24 setup: platform_reuse_allowed present'; END IF;

  -- Case 25–27: anon/authenticated no access
  EXECUTE 'SET ROLE anon';
  raised := false;
  BEGIN
    PERFORM count(*) FROM public.music_rights_grants;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    raised := true;
  END;
  IF NOT raised THEN
    SELECT has_table_privilege('anon', 'public.music_rights_grants', 'SELECT') INTO raised;
    IF raised THEN
      RAISE EXCEPTION 'Case25: anon must not SELECT rights grants';
    END IF;
  END IF;
  RESET ROLE;

  IF has_table_privilege('anon', 'public.music_rightsholders', 'SELECT')
     OR has_table_privilege('authenticated', 'public.music_rights_grants', 'SELECT')
     OR has_table_privilege('authenticated', 'public.music_rights_grants', 'INSERT')
     OR has_table_privilege('anon', 'public.music_rights_grant_countries', 'UPDATE')
  THEN
    RAISE EXCEPTION 'Case25-27: browser roles must not have table privileges';
  END IF;

  -- Case 28: service_role / postgres can access
  IF NOT has_table_privilege('service_role', 'public.music_rights_grants', 'SELECT') THEN
    RAISE EXCEPTION 'Case28: service_role SELECT missing';
  END IF;

  -- Case 29: no licensed boolean source-of-truth
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name LIKE 'music_rights%'
      AND column_name IN ('licensed', 'is_licensed', 'eligible')
  ) THEN
    RAISE EXCEPTION 'Case29: licensed/eligible column must not exist';
  END IF;

  -- Case 30: deleting track must not CASCADE-erase grants (no destructive FK)
  SELECT count(*) INTO cnt FROM public.music_rights_grants WHERE audio_item_id = audio_music;
  IF cnt < 1 THEN RAISE EXCEPTION 'Case30 setup'; END IF;
  DELETE FROM public.audio_items WHERE id = audio_music;
  SELECT count(*) INTO cnt FROM public.music_rights_grants WHERE audio_item_id = audio_music;
  IF cnt < 1 THEN RAISE EXCEPTION 'Case30: grants vanished with track delete'; END IF;

  -- Case 31: playback/economics untouched — no A4 tables named playback_usage
  IF to_regclass('public.playback_usage_facts') IS NOT NULL THEN
    RAISE EXCEPTION 'Case31: stub must not include playback ledger (isolation)';
  END IF;

  -- Non-music grant reject
  raised := false;
  BEGIN
    INSERT INTO public.music_rights_grants (
      audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, source_type, status, verified_at
    ) VALUES (
      audio_med, rh1, 'recording', 'business_background_playback', 'worldwide',
      now(), 'other', 'verified', now()
    );
  EXCEPTION WHEN others THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('audio_item_not_music' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case4b: non-music must fail got %', v_err;
  END IF;

  -- Draft grant can still be deleted (positive control)
  DELETE FROM public.music_rights_grants WHERE id = g_draft_terr;

  RAISE NOTICE 'music_rights_foundation_smoke: all cases ok';
END;
$$;
