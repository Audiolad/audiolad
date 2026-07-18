-- Regression: replace_playlist_cover_path accepts legacy + versioned variant paths.
-- Usage: docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_owner_id uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_other_id uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_foreign_pl uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  pl uuid;
  legacy_a text;
  legacy_b text;
  version_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  variant_lg text;
  variant_md text;
  foreign_legacy text;
  r record;
BEGIN
  IF to_regprocedure('public.replace_playlist_cover_path(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'replace_playlist_cover_path missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_owner_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'playlist.variant.cas.owner@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_other_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_other_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'playlist.variant.cas.other@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  DELETE FROM public.playlists
  WHERE user_id IN (v_owner_id, v_other_id) AND title LIKE 'PLAYLIST VARIANT CAS%';

  INSERT INTO public.playlists (user_id, title, visibility)
  VALUES (v_owner_id, 'PLAYLIST VARIANT CAS PL', 'private')
  RETURNING id INTO pl;

  legacy_a := v_owner_id::text || '/' || pl::text || '/' || gen_random_uuid()::text || '.webp';
  legacy_b := v_owner_id::text || '/' || pl::text || '/' || gen_random_uuid()::text || '.webp';
  variant_lg := v_owner_id::text || '/' || pl::text || '/variants/' || version_id::text || '/lg.webp';
  variant_md := v_owner_id::text || '/' || pl::text || '/variants/' || gen_random_uuid()::text || '/md.webp';
  foreign_legacy := v_other_id::text || '/' || pl::text || '/' || gen_random_uuid()::text || '.webp';

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- valid legacy path
  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, NULL, legacy_a);
  IF r.status <> 'ok' OR r.cover_path <> legacy_a THEN
    RAISE EXCEPTION 'legacy set failed: % %', r.status, r.cover_path;
  END IF;

  -- valid sm/md/lg variant path (legacy -> variant)
  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, legacy_a, variant_lg);
  IF r.status <> 'ok' OR r.cover_path <> variant_lg THEN
    RAISE EXCEPTION 'legacy->variant lg failed: % %', r.status, r.cover_path;
  END IF;

  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, variant_lg, variant_md);
  IF r.status <> 'ok' OR r.cover_path <> variant_md THEN
    RAISE EXCEPTION 'variant md replace failed: % %', r.status, r.cover_path;
  END IF;

  -- valid NULL delete
  SELECT * INTO r FROM public.replace_playlist_cover_path(pl, variant_md, NULL);
  IF r.status <> 'ok' OR r.cover_path IS NOT NULL OR r.cover_updated_at IS NOT NULL THEN
    RAISE EXCEPTION 'NULL delete failed: % % %', r.status, r.cover_path, r.cover_updated_at;
  END IF;

  -- invalid foreign user prefix
  BEGIN
    PERFORM 1 FROM public.replace_playlist_cover_path(pl, NULL, foreign_legacy);
    RAISE EXCEPTION 'foreign user prefix must raise invalid_cover_path_owner';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT LIKE '%invalid_cover_path_owner%' THEN
        RAISE;
      END IF;
  END;

  -- invalid playlist UUID segment (wrong playlist id in path)
  BEGIN
    PERFORM 1 FROM public.replace_playlist_cover_path(
      pl,
      NULL,
      v_owner_id::text || '/' || v_foreign_pl::text || '/' || gen_random_uuid()::text || '.webp'
    );
    RAISE EXCEPTION 'wrong playlist segment must raise invalid_cover_path_owner';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT LIKE '%invalid_cover_path_owner%' THEN
        RAISE;
      END IF;
  END;

  -- invalid traversal
  BEGIN
    PERFORM 1 FROM public.replace_playlist_cover_path(
      pl,
      NULL,
      v_owner_id::text || '/../' || pl::text || '/' || gen_random_uuid()::text || '.webp'
    );
    RAISE EXCEPTION 'traversal must raise invalid_cover_path';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT LIKE '%invalid_cover_path%' THEN
        RAISE;
      END IF;
  END;

  -- invalid extension
  BEGIN
    PERFORM 1 FROM public.replace_playlist_cover_path(
      pl,
      NULL,
      v_owner_id::text || '/' || pl::text || '/' || gen_random_uuid()::text || '.jpg'
    );
    RAISE EXCEPTION 'jpg extension must raise invalid_cover_path';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT LIKE '%invalid_cover_path%' THEN
        RAISE;
      END IF;
  END;

  -- invalid unknown variant
  BEGIN
    PERFORM 1 FROM public.replace_playlist_cover_path(
      pl,
      NULL,
      v_owner_id::text || '/' || pl::text || '/variants/' || version_id::text || '/xs.webp'
    );
    RAISE EXCEPTION 'unknown variant xs must raise invalid_cover_path';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT LIKE '%invalid_cover_path%' THEN
        RAISE;
      END IF;
  END;

  RESET ROLE;
  DELETE FROM public.playlists WHERE id = pl;

  RAISE NOTICE 'PLAYLIST_COVER_VARIANT_CAS_SMOKE_PASS';
END;
$$;
