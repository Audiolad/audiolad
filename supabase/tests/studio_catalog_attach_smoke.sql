-- Isolated executable smoke for catalog attach.
-- Scratch database only. Never apply to production.
-- Would have caught PR4: attach INSERT omitted id while the column
-- has no default (SQLSTATE 23502).

DO $$
DECLARE
  author uuid := 'a1111111-1111-4111-8111-111111111111';
  owner_user uuid := 'a2222222-2222-4222-8222-222222222222';
  entitled uuid := 'b1111111-1111-4111-8111-111111111111';
  listener uuid := 'b2222222-2222-4222-8222-222222222222';
  stranger uuid := 'c1111111-1111-4111-8111-111111111111';
  other_entitled uuid := 'c2222222-2222-4222-8222-222222222222';
  music uuid := 'd1111111-1111-4111-8111-111111111111';
  audio uuid := 'e1111111-1111-4111-8111-111111111111';
  audio_legacy uuid := 'e2222222-2222-4222-8222-222222222222';
  audio_unauth uuid := 'e3333333-3333-4333-8333-333333333333';
  audio_listener uuid := 'e4444444-4444-4444-8444-444444444444';
  project uuid := 'f1111111-1111-4111-8111-111111111111';
  upload_asset uuid := 'f2222222-2222-4222-8222-222222222222';
  recording_asset uuid := 'f3333333-3333-4333-8333-333333333333';
  v_asset public.studio_project_assets;
  v_again public.studio_project_assets;
  v_owner public.studio_project_assets;
  v_legacy public.studio_project_assets;
  v_upload public.studio_project_assets;
  v_sqlstate text;
  v_message text;
  v_count integer;
  v_storage_before integer;
  v_storage_after integer;
  v_default text;
  v_schema integer;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'studio_project_assets'
    AND column_name = 'id';
  IF v_default IS NOT NULL THEN
    RAISE EXCEPTION 'schema fixture: studio_project_assets.id must have no column default, got %', v_default;
  END IF;

  IF to_regprocedure('public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric)') IS NULL THEN
    RAISE EXCEPTION 'attach_studio_catalog_project_asset missing from pg_proc';
  END IF;

  INSERT INTO auth.users (id) VALUES (owner_user), (entitled), (listener), (stranger), (other_entitled);
  INSERT INTO public.authors (id, name) VALUES (author, 'Musician');
  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (author, owner_user, 'owner');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, price, is_free, product_kind,
    publication_class, music_usage_permission, catalog_visibility
  ) VALUES (
    music, author, 'Dawn', 'dawn-music', 'published', 500, false,
    'music', 'release', 'platform_reuse_allowed', 'listed'
  );

  INSERT INTO public.audio_items (id, practice_id, title, position)
  VALUES
    (audio, music, 'Dawn track', 0),
    (audio_legacy, music, 'Legacy track', 1),
    (audio_unauth, music, 'Unauth track', 2),
    (audio_listener, music, 'Listener track', 3);

  INSERT INTO public.studio_music_entitlements (
    user_id, practice_id, grant_source
  ) VALUES
    (entitled, music, 'free'),
    (other_entitled, music, 'free');

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (listener, music, 'purchase');

  INSERT INTO public.studio_projects (
    id, author_id, name, status, project_data, schema_version
  ) VALUES (
    project,
    author,
    'Catalog project',
    'active',
    '{"schemaVersion":2,"studioVersion":1,"editor":{"currentTime":0},"slots":[],"tracks":[]}'::jsonb,
    2
  );

  SELECT count(*) INTO v_storage_before FROM storage.objects;

  SELECT * INTO v_asset
  FROM public.attach_studio_catalog_project_asset(
    project,
    entitled,
    music,
    audio,
    'Dawn track',
    'audio/mpeg',
    120
  );

  IF v_asset.id IS NULL THEN
    RAISE EXCEPTION 'returned asset.id must not be null';
  END IF;
  IF v_asset.id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'returned asset.id is not a valid UUID: %', v_asset.id;
  END IF;
  IF v_asset.source_type IS DISTINCT FROM 'catalog'
     OR v_asset.source_id IS NOT NULL
     OR v_asset.storage_path IS NOT NULL
     OR v_asset.size_bytes IS DISTINCT FROM 0
     OR v_asset.upload_state IS DISTINCT FROM 'ready'
     OR v_asset.catalog_practice_id IS DISTINCT FROM music
    OR v_asset.catalog_audio_item_id IS DISTINCT FROM audio
    OR v_asset.catalog_access_user_id IS DISTINCT FROM entitled
    OR v_asset.duration_seconds IS DISTINCT FROM 120
  THEN
    RAISE EXCEPTION 'catalog row fields mismatch: %', to_json(v_asset);
  END IF;

  SELECT * INTO v_again
  FROM public.attach_studio_catalog_project_asset(
    project,
    entitled,
    music,
    audio,
    'Dawn track',
    'audio/mpeg',
    120
  );
  IF v_again.id IS DISTINCT FROM v_asset.id THEN
    RAISE EXCEPTION 'second attach must reuse the same active id, got % then %', v_asset.id, v_again.id;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.studio_project_assets
  WHERE project_id = project
    AND source_type = 'catalog'
    AND deleted_at IS NULL;
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'expected one active catalog row, got %', v_count;
  END IF;

  SELECT count(*) INTO v_storage_after FROM storage.objects;
  IF v_storage_after IS DISTINCT FROM v_storage_before THEN
    RAISE EXCEPTION 'attach must not copy into storage.objects';
  END IF;

  SELECT (project_data ->> 'schemaVersion')::integer INTO v_schema
  FROM public.studio_projects
  WHERE id = project;
  IF v_schema IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'project_data schemaVersion must stay 2, got %', v_schema;
  END IF;

  BEGIN
    PERFORM public.attach_studio_catalog_project_asset(
      project,
      stranger,
      music,
      audio,
      'Dawn track',
      'audio/mpeg',
      120
    );
    RAISE EXCEPTION 'no entitlement must be denied';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
      IF v_message IS DISTINCT FROM 'catalog_music_forbidden' THEN
        RAISE EXCEPTION 'no entitlement expected catalog_music_forbidden, got % %', v_sqlstate, v_message;
      END IF;
  END;

  BEGIN
    PERFORM public.attach_studio_catalog_project_asset(
      project,
      listener,
      music,
      audio,
      'Dawn track',
      'audio/mpeg',
      120
    );
    RAISE EXCEPTION 'user_practices-only must be denied';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
      IF v_message IS DISTINCT FROM 'catalog_music_forbidden' THEN
        RAISE EXCEPTION 'user_practices-only expected catalog_music_forbidden, got % %', v_sqlstate, v_message;
      END IF;
  END;

  SELECT count(*) INTO v_count
  FROM public.studio_project_assets
  WHERE project_id = project
    AND source_type = 'catalog'
    AND deleted_at IS NULL;
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'denied attaches must not create extra catalog rows, got %', v_count;
  END IF;

  IF v_again.catalog_access_user_id IS DISTINCT FROM entitled THEN
    RAISE EXCEPTION 'idempotent attach must preserve principal, got %', v_again.catalog_access_user_id;
  END IF;

  SELECT * INTO v_owner
  FROM public.attach_studio_catalog_project_asset(
    project,
    other_entitled,
    music,
    audio,
    'Dawn track',
    'audio/mpeg',
    120
  );
  IF v_owner.id IS DISTINCT FROM v_asset.id
     OR v_owner.catalog_access_user_id IS DISTINCT FROM entitled
  THEN
    RAISE EXCEPTION 'other authorized user must not overwrite principal, got % %', v_owner.id, v_owner.catalog_access_user_id;
  END IF;

  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type,
    size_bytes, duration_seconds, source_type, upload_state, upload_state_changed_at,
    catalog_practice_id, catalog_audio_item_id, catalog_access_user_id
  ) VALUES (
    gen_random_uuid(), project, NULL, NULL, 'Legacy', 'audio/mpeg',
    0, 60, 'catalog', 'ready', now(), music, audio_legacy, NULL
  );

  SELECT * INTO v_legacy
  FROM public.attach_studio_catalog_project_asset(
    project,
    entitled,
    music,
    audio_legacy,
    'Legacy',
    'audio/mpeg',
    60
  );
  IF v_legacy.catalog_access_user_id IS DISTINCT FROM entitled THEN
    RAISE EXCEPTION 'legacy NULL must be adopted by authorized user, got %', v_legacy.catalog_access_user_id;
  END IF;

  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type,
    size_bytes, duration_seconds, source_type, upload_state, upload_state_changed_at,
    catalog_practice_id, catalog_audio_item_id, catalog_access_user_id
  ) VALUES (
    gen_random_uuid(), project, NULL, NULL, 'Unauth', 'audio/mpeg',
    0, 60, 'catalog', 'ready', now(), music, audio_unauth, NULL
  );

  BEGIN
    PERFORM public.attach_studio_catalog_project_asset(
      project,
      stranger,
      music,
      audio_unauth,
      'Unauth',
      'audio/mpeg',
      60
    );
    RAISE EXCEPTION 'unauthorized must not adopt legacy NULL principal';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
      IF v_message IS DISTINCT FROM 'catalog_music_forbidden' THEN
        RAISE EXCEPTION 'unauthorized adopt expected catalog_music_forbidden, got % %', v_sqlstate, v_message;
      END IF;
  END;

  SELECT catalog_access_user_id INTO v_default
  FROM public.studio_project_assets
  WHERE catalog_audio_item_id = audio_unauth
    AND deleted_at IS NULL;
  IF v_default IS NOT NULL THEN
    RAISE EXCEPTION 'unauthorized must leave legacy principal NULL, got %', v_default;
  END IF;

  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type,
    size_bytes, duration_seconds, source_type, upload_state, upload_state_changed_at,
    catalog_practice_id, catalog_audio_item_id, catalog_access_user_id
  ) VALUES (
    gen_random_uuid(), project, NULL, NULL, 'Listener', 'audio/mpeg',
    0, 60, 'catalog', 'ready', now(), music, audio_listener, NULL
  );

  BEGIN
    PERFORM public.attach_studio_catalog_project_asset(
      project,
      listener,
      music,
      audio_listener,
      'Listener',
      'audio/mpeg',
      60
    );
    RAISE EXCEPTION 'user_practices-only must not adopt principal';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
      IF v_message IS DISTINCT FROM 'catalog_music_forbidden' THEN
        RAISE EXCEPTION 'user_practices-only adopt expected catalog_music_forbidden, got % %', v_sqlstate, v_message;
      END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.studio_project_assets
    WHERE catalog_audio_item_id = audio_listener
      AND catalog_access_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'user_practices-only must not receive catalog_access_user_id';
  END IF;

  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type,
    size_bytes, duration_seconds, source_type, upload_state, upload_state_changed_at
  ) VALUES (
    upload_asset,
    project,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'studio/a1111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/f2222222-2222-4222-8222-222222222222/voice.wav',
    'voice.wav',
    'audio/wav',
    1024,
    10,
    'upload',
    'ready',
    now()
  );

  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type,
    size_bytes, duration_seconds, source_type, upload_state, upload_state_changed_at
  ) VALUES (
    recording_asset,
    project,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'studio/a1111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/f3333333-3333-4333-8333-333333333333/take.wav',
    'take.wav',
    'audio/wav',
    2048,
    8,
    'recording',
    'ready',
    now()
  );

  SELECT * INTO v_upload
  FROM public.studio_project_assets
  WHERE id = upload_asset;
  IF v_upload.catalog_access_user_id IS NOT NULL
     OR v_upload.catalog_practice_id IS NOT NULL
     OR v_upload.source_type IS DISTINCT FROM 'upload'
  THEN
    RAISE EXCEPTION 'upload row must stay unaffected: %', to_json(v_upload);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.studio_project_assets
    WHERE id = recording_asset AND catalog_access_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'recording row must stay unaffected';
  END IF;
END
$$;
