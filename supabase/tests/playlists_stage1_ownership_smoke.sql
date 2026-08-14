-- Stage 1 platform ownership / editorial draft smoke — isolated test DB only.
-- Never production `postgres`.
--
-- Prerequisites: playlists migrations through
--   20260814120000_playlist_platform_ownership.sql
--   and at least one public.authors row.
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d audiolad_playlists_stage1_test \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_stage1_ownership_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_admin_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_editor_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_collab_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_listener_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_author_id uuid;
  v_user_pl uuid;
  v_draft_pl uuid;
  v_pub_pl uuid;
  v_other_user_pl uuid;
  free_practice uuid;
  result jsonb;
  cnt integer;
  vis text;
  slg text;
  raised boolean;
  v_seen integer;
BEGIN
  IF to_regclass('public.playlist_collaborators') IS NULL THEN
    RAISE EXCEPTION 'playlist_collaborators missing — apply stage 1 migration first';
  END IF;

  IF to_regprocedure('public.can_user_edit_playlist(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'can_user_edit_playlist missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'stage1.admin@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_editor_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_editor_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'stage1.editor@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_collab_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_collab_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'stage1.collab@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_listener_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_listener_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'stage1.listener@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  INSERT INTO public.profiles (id, email, role)
  VALUES (v_admin_id, 'stage1.admin@example.com', 'platform_admin')
  ON CONFLICT (id) DO UPDATE SET role = 'platform_admin';

  INSERT INTO public.profiles (id, email, role)
  VALUES
    (v_editor_id, 'stage1.editor@example.com', 'listener'),
    (v_collab_id, 'stage1.collab@example.com', 'listener'),
    (v_listener_id, 'stage1.listener@example.com', 'listener')
  ON CONFLICT (id) DO UPDATE SET role = 'listener';

  IF to_regclass('public.platform_user_roles') IS NOT NULL THEN
    INSERT INTO public.platform_user_roles (user_id, role_code)
    VALUES (v_admin_id, 'admin'), (v_editor_id, 'editor')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO v_author_id FROM public.authors ORDER BY id LIMIT 1;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'test requires at least one author';
  END IF;

  DELETE FROM public.playlist_audit_log
  WHERE playlist_id IN (
    SELECT id FROM public.playlists
    WHERE title LIKE 'Stage1 smoke%' OR slug LIKE 'stage1-smoke-%'
  );
  DELETE FROM public.playlist_collaborators
  WHERE playlist_id IN (
    SELECT id FROM public.playlists
    WHERE title LIKE 'Stage1 smoke%' OR slug LIKE 'stage1-smoke-%'
  );
  DELETE FROM public.playlist_items
  WHERE playlist_id IN (
    SELECT id FROM public.playlists
    WHERE title LIKE 'Stage1 smoke%' OR slug LIKE 'stage1-smoke-%'
  );
  DELETE FROM public.playlists
  WHERE title LIKE 'Stage1 smoke%' OR slug LIKE 'stage1-smoke-%';
  DELETE FROM public.audio_items
  WHERE practice_id IN (SELECT id FROM public.practices WHERE slug LIKE 'stage1-smoke-%');
  DELETE FROM public.practices WHERE slug LIKE 'stage1-smoke-%';

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, audio_url
  ) VALUES (
    v_author_id, 'Stage1 smoke free', 'stage1-smoke-free', 'published', true, 0, true,
    'https://example.com/stage1-free.mp3'
  ) RETURNING id INTO free_practice;

  -- User playlist isolation
  INSERT INTO public.playlists (user_id, owner_type, created_by, title, visibility)
  VALUES (v_listener_id, 'user', v_listener_id, 'Stage1 smoke user private', 'private')
  RETURNING id INTO v_user_pl;

  INSERT INTO public.playlists (user_id, owner_type, created_by, title, visibility)
  VALUES (v_collab_id, 'user', v_collab_id, 'Stage1 smoke other private', 'private')
  RETURNING id INTO v_other_user_pl;

  -- Editorial draft + published
  INSERT INTO public.playlists (
    user_id, owner_type, created_by, title, visibility, slug, published_at, is_editorial
  ) VALUES (
    NULL, 'platform', v_admin_id, 'Stage1 smoke draft', 'private', 'stage1-smoke-draft',
    NULL, true
  ) RETURNING id INTO v_draft_pl;

  INSERT INTO public.playlists (
    user_id, owner_type, created_by, title, visibility, slug, published_at, is_editorial
  ) VALUES (
    NULL, 'platform', v_admin_id, 'Stage1 smoke published', 'public', 'stage1-smoke-pub',
    now(), true
  ) RETURNING id INTO v_pub_pl;

  INSERT INTO public.playlist_collaborators (playlist_id, user_id, role, added_by)
  VALUES (v_draft_pl, v_collab_id, 'editor', v_admin_id);

  -- created_by is not ownership: listener created_by on platform row still not owner
  UPDATE public.playlists
  SET created_by = v_listener_id
  WHERE id = v_pub_pl;

  IF NOT public.can_user_edit_playlist(v_user_pl, v_listener_id) THEN
    RAISE EXCEPTION 'user owner must edit own playlist';
  END IF;

  IF public.can_user_edit_playlist(v_user_pl, v_collab_id) THEN
    RAISE EXCEPTION 'other user must not edit foreign user playlist';
  END IF;

  IF public.can_user_edit_playlist(v_pub_pl, v_listener_id) THEN
    RAISE EXCEPTION 'created_by must not grant ownership';
  END IF;

  IF NOT public.can_user_edit_playlist(v_draft_pl, v_admin_id) THEN
    RAISE EXCEPTION 'admin manage must edit platform draft';
  END IF;

  IF NOT public.can_user_edit_playlist(v_draft_pl, v_collab_id) THEN
    RAISE EXCEPTION 'scoped collaborator must edit assigned playlist';
  END IF;

  IF public.can_user_edit_playlist(v_pub_pl, v_collab_id) THEN
    RAISE EXCEPTION 'collaborator must not edit a different platform playlist';
  END IF;

  IF public.can_user_delete_playlist(v_draft_pl, v_collab_id) THEN
    RAISE EXCEPTION 'editor collaborator must not delete platform playlist';
  END IF;

  IF NOT public.can_user_delete_playlist(v_draft_pl, v_admin_id) THEN
    RAISE EXCEPTION 'playlists.manage must delete platform playlist';
  END IF;

  IF public.can_user_delete_playlist(v_user_pl, v_admin_id)
    AND NOT (SELECT user_id = v_admin_id FROM public.playlists WHERE id = v_user_pl) THEN
    RAISE EXCEPTION 'admin must not delete foreign user playlist via can_user_delete';
  END IF;

  -- Draft slug rename ok
  UPDATE public.playlists
  SET slug = 'stage1-smoke-draft-renamed'
  WHERE id = v_draft_pl;

  IF (SELECT slug FROM public.playlists WHERE id = v_draft_pl)
    IS DISTINCT FROM 'stage1-smoke-draft-renamed' THEN
    RAISE EXCEPTION 'draft editorial slug rename should succeed';
  END IF;

  -- Published editorial slug rename blocked
  raised := false;
  BEGIN
    UPDATE public.playlists
    SET slug = 'stage1-smoke-pub-hack'
    WHERE id = v_pub_pl;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%editorial_slug_locked%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'published editorial slug rename must fail';
  END IF;

  -- Unpublish keeps first_published_at; slug rename still locked
  UPDATE public.playlists
  SET visibility = 'private', published_at = NULL
  WHERE id = v_pub_pl;

  IF (SELECT first_published_at FROM public.playlists WHERE id = v_pub_pl) IS NULL THEN
    RAISE EXCEPTION 'unpublish must not clear first_published_at';
  END IF;

  IF (SELECT published_at FROM public.playlists WHERE id = v_pub_pl) IS NOT NULL THEN
    RAISE EXCEPTION 'unpublish must clear published_at';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.playlists
    SET slug = 'stage1-smoke-pub-after-unpublish'
    WHERE id = v_pub_pl;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%editorial_slug_locked%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'slug rename after unpublish must still fail';
  END IF;

  IF (SELECT first_published_at FROM public.playlists WHERE id = v_draft_pl) IS NOT NULL THEN
    RAISE EXCEPTION 'never-published draft must not have first_published_at';
  END IF;

  UPDATE public.playlists
  SET visibility = 'public', published_at = now()
  WHERE id = v_pub_pl;

  -- User private still cannot have a slug
  raised := false;
  BEGIN
    UPDATE public.playlists
    SET slug = 'stage1-user-slug'
    WHERE id = v_user_pl;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'user private playlist must still reject slug';
  END IF;

  -- Collaborators only on platform
  raised := false;
  BEGIN
    INSERT INTO public.playlist_collaborators (playlist_id, user_id, role, added_by)
    VALUES (v_user_pl, v_collab_id, 'editor', v_admin_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%collaborators_platform_only%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'collaborator on user playlist must fail';
  END IF;

  -- RLS: anon cannot see draft
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT count(*) INTO v_seen
  FROM public.playlists
  WHERE id = v_draft_pl;
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'anon must not see editorial draft';
  END IF;

  SELECT count(*) INTO v_seen
  FROM public.playlists
  WHERE id = v_pub_pl;
  IF v_seen <> 1 THEN
    RAISE EXCEPTION 'anon must see published editorial playlist';
  END IF;

  -- Ordinary user cannot see draft, can see published
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_listener_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_listener_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_seen
  FROM public.playlists
  WHERE id = v_draft_pl;
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'ordinary user must not see editorial draft';
  END IF;

  SELECT count(*) INTO v_seen
  FROM public.playlists
  WHERE id = v_pub_pl;
  IF v_seen <> 1 THEN
    RAISE EXCEPTION 'ordinary user must see published editorial';
  END IF;

  SELECT count(*) INTO v_seen
  FROM public.playlists
  WHERE id = v_other_user_pl;
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'user owner isolation failed for foreign private playlist';
  END IF;

  -- Collaborator can see assigned draft
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_collab_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_collab_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_seen
  FROM public.playlists
  WHERE id = v_draft_pl;
  IF v_seen <> 1 THEN
    RAISE EXCEPTION 'collaborator must see assigned draft';
  END IF;

  -- Collaborator cannot delete platform playlist
  DELETE FROM public.playlists WHERE id = v_draft_pl;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'collaborator must not delete platform playlist';
  END IF;

  -- Membership RPC remains user-only: platform id is not_found
  raised := false;
  BEGIN
    PERFORM public.set_practice_playlist_membership(free_practice, ARRAY[v_draft_pl]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%playlist_not_found%' THEN
      raised := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'membership RPC must reject platform playlist';
  END IF;

  -- Listener membership on own user playlist still works
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_listener_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_listener_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  result := public.set_practice_playlist_membership(
    free_practice,
    ARRAY[v_user_pl]
  );
  IF (result->>'added')::int <> 1 THEN
    RAISE EXCEPTION 'user membership regression: %', result;
  END IF;

  -- Admin editorial add on draft
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  result := public.add_editorial_playlist_practices(
    v_draft_pl,
    ARRAY[free_practice]
  );
  IF (result->>'added')::int <> 1 THEN
    RAISE EXCEPTION 'admin add to draft failed: %', result;
  END IF;

  -- Revoke collaborator keeps playlist / slug / items
  RESET ROLE;
  DELETE FROM public.playlist_collaborators
  WHERE playlist_id = v_draft_pl AND user_id = v_collab_id;

  SELECT visibility, slug INTO vis, slg
  FROM public.playlists
  WHERE id = v_draft_pl;
  IF vis <> 'private' OR slg IS DISTINCT FROM 'stage1-smoke-draft-renamed' THEN
    RAISE EXCEPTION 'revoke collaborator must keep playlist and slug';
  END IF;

  SELECT count(*) INTO cnt
  FROM public.playlist_items
  WHERE playlist_id = v_draft_pl AND practice_id = free_practice;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'revoke collaborator must keep items';
  END IF;

  -- Revoked collaborator can no longer see draft
  PERFORM set_config('request.jwt.claim.sub', v_collab_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_collab_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_seen
  FROM public.playlists
  WHERE id = v_draft_pl;
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'revoked collaborator must not see draft';
  END IF;

  -- Editor role without collaborator cannot edit unpublished foreign platform? 
  -- editor has create_editorial but not manage — cannot edit unless collaborator
  RESET ROLE;
  IF public.can_user_edit_playlist(v_pub_pl, v_editor_id) THEN
    RAISE EXCEPTION 'editor without collaborator must not edit platform playlist';
  END IF;

  RESET ROLE;
  DELETE FROM public.playlist_items
  WHERE playlist_id IN (v_user_pl, v_draft_pl, v_pub_pl, v_other_user_pl);
  DELETE FROM public.playlist_collaborators
  WHERE playlist_id IN (v_draft_pl, v_pub_pl);
  DELETE FROM public.playlist_audit_log
  WHERE playlist_id IN (v_user_pl, v_draft_pl, v_pub_pl, v_other_user_pl);
  DELETE FROM public.playlists
  WHERE id IN (v_user_pl, v_draft_pl, v_pub_pl, v_other_user_pl);
  DELETE FROM public.practices WHERE slug LIKE 'stage1-smoke-%';

  RAISE NOTICE 'PLAYLISTS_STAGE1_OWNERSHIP_SMOKE_PASS';
END;
$$;
