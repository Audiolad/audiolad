-- Stage 2.1 editorial directions / playlist_admin smoke — isolated test DB only.
-- Never production `postgres`.
--
-- Prerequisites: playlists migrations through
--   20260815120000_editorial_directions_and_playlist_admin.sql
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d audiolad_playlists_stage21_test \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_stage21_directions_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_admin_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_dir_editor_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_other_editor_id uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_playlist_admin_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_listener_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_dir_a uuid;
  v_dir_b uuid;
  v_pl_a uuid;
  v_pl_b uuid;
  v_legacy uuid;
  v_user_pl uuid;
  cnt integer;
  raised boolean;
BEGIN
  IF to_regclass('public.editorial_directions') IS NULL THEN
    RAISE EXCEPTION 'editorial_directions missing — apply stage 2.1 first';
  END IF;

  IF to_regprocedure('public.is_direction_editor(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_direction_editor missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'stage21.admin@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_dir_editor_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_dir_editor_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'stage21.dir@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_other_editor_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_other_editor_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'stage21.other@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_playlist_admin_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_playlist_admin_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'stage21.padmin@example.com',
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
      'authenticated', 'authenticated', 'stage21.listener@example.com',
      crypt('test-password', gen_salt('bf')), now(), now(), now(),
      '', '', '', ''
    );
  END IF;

  IF to_regclass('public.platform_user_roles') IS NOT NULL THEN
    INSERT INTO public.platform_user_roles (user_id, role_code)
    VALUES (v_admin_id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.editorial_directions (name, slug)
  VALUES
    ('Функциональная музыка', 'funktsionalnaya-muzyka-stage21'),
    ('Медитации', 'meditatsii-stage21')
  RETURNING id INTO v_dir_a;

  SELECT id INTO v_dir_a
  FROM public.editorial_directions
  WHERE slug = 'funktsionalnaya-muzyka-stage21';

  SELECT id INTO v_dir_b
  FROM public.editorial_directions
  WHERE slug = 'meditatsii-stage21';

  INSERT INTO public.editorial_direction_members (
    direction_id, user_id, role, added_by
  ) VALUES (
    v_dir_a, v_dir_editor_id, 'direction_editor', v_admin_id
  );

  INSERT INTO public.editorial_direction_members (
    direction_id, user_id, role, added_by
  ) VALUES (
    v_dir_b, v_other_editor_id, 'direction_editor', v_admin_id
  );

  INSERT INTO public.playlists (
    user_id, owner_type, created_by, title, visibility, slug,
    published_at, is_editorial, direction_id
  ) VALUES (
    NULL, 'platform', v_dir_editor_id, 'Stage21 dir A', 'private',
    'stage21-dir-a', NULL, true, v_dir_a
  ) RETURNING id INTO v_pl_a;

  INSERT INTO public.playlists (
    user_id, owner_type, created_by, title, visibility, slug,
    published_at, is_editorial, direction_id
  ) VALUES (
    NULL, 'platform', v_other_editor_id, 'Stage21 dir B', 'private',
    'stage21-dir-b', NULL, true, v_dir_b
  ) RETURNING id INTO v_pl_b;

  INSERT INTO public.playlists (
    user_id, owner_type, created_by, title, visibility, slug,
    published_at, is_editorial, direction_id
  ) VALUES (
    NULL, 'platform', v_admin_id, 'Stage21 legacy', 'private',
    'stage21-legacy', NULL, true, NULL
  ) RETURNING id INTO v_legacy;

  INSERT INTO public.playlists (
    user_id, owner_type, created_by, title, visibility, slug,
    published_at, is_editorial
  ) VALUES (
    v_listener_id, 'user', v_listener_id, 'Stage21 user', 'private',
    NULL, NULL, false
  ) RETURNING id INTO v_user_pl;

  INSERT INTO public.playlist_collaborators (playlist_id, user_id, role, added_by)
  VALUES (v_pl_a, v_playlist_admin_id, 'playlist_admin', v_dir_editor_id);

  IF NOT public.is_direction_editor(v_dir_a, v_dir_editor_id) THEN
    RAISE EXCEPTION 'direction editor helper failed';
  END IF;

  IF public.is_direction_editor(v_dir_b, v_dir_editor_id) THEN
    RAISE EXCEPTION 'direction editor must not see other direction';
  END IF;

  IF NOT public.can_user_edit_playlist(v_pl_a, v_dir_editor_id) THEN
    RAISE EXCEPTION 'direction editor must edit playlists of their direction';
  END IF;

  IF public.can_user_edit_playlist(v_pl_b, v_dir_editor_id) THEN
    RAISE EXCEPTION 'direction editor must not edit other direction';
  END IF;

  IF NOT public.can_user_edit_playlist(v_pl_a, v_playlist_admin_id) THEN
    RAISE EXCEPTION 'playlist admin must edit assigned playlist';
  END IF;

  IF public.can_user_edit_playlist(v_pl_b, v_playlist_admin_id) THEN
    RAISE EXCEPTION 'playlist admin must not edit unassigned playlist';
  END IF;

  IF public.can_user_delete_playlist(v_pl_a, v_dir_editor_id) THEN
    RAISE EXCEPTION 'direction editor must not hard-delete';
  END IF;

  IF public.can_user_delete_playlist(v_pl_a, v_playlist_admin_id) THEN
    RAISE EXCEPTION 'playlist admin must not hard-delete';
  END IF;

  IF NOT public.can_user_delete_playlist(v_pl_a, v_admin_id) THEN
    RAISE EXCEPTION 'platform admin must hard-delete';
  END IF;

  IF NOT public.can_user_manage_playlist_collaborators(v_pl_a, v_dir_editor_id) THEN
    RAISE EXCEPTION 'direction editor must manage playlist admins';
  END IF;

  IF public.can_user_manage_playlist_collaborators(v_pl_a, v_playlist_admin_id) THEN
    RAISE EXCEPTION 'playlist admin must not manage collaborators';
  END IF;

  IF public.can_user_edit_playlist(v_pl_a, v_listener_id) THEN
    RAISE EXCEPTION 'ordinary user must not edit platform playlist';
  END IF;

  IF (SELECT user_id FROM public.playlists WHERE id = v_pl_a) IS NOT NULL THEN
    RAISE EXCEPTION 'platform playlist must keep user_id NULL';
  END IF;

  IF (SELECT owner_type FROM public.playlists WHERE id = v_pl_a) IS DISTINCT FROM 'platform' THEN
    RAISE EXCEPTION 'created playlist must stay platform-owned';
  END IF;

  IF (SELECT direction_id FROM public.playlists WHERE id = v_user_pl) IS NOT NULL THEN
    RAISE EXCEPTION 'user playlist direction_id must stay NULL';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.playlists
    SET direction_id = v_dir_a
    WHERE id = v_user_pl;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'user playlist must reject direction_id';
  END IF;

  DELETE FROM public.editorial_direction_members
  WHERE direction_id = v_dir_a
    AND user_id = v_dir_editor_id;

  IF NOT EXISTS (SELECT 1 FROM public.playlists WHERE id = v_pl_a) THEN
    RAISE EXCEPTION 'revoking direction editor must not delete playlists';
  END IF;

  DELETE FROM public.playlist_collaborators
  WHERE playlist_id = v_pl_a
    AND user_id = v_playlist_admin_id;

  IF NOT EXISTS (SELECT 1 FROM public.playlists WHERE id = v_pl_a) THEN
    RAISE EXCEPTION 'revoking playlist admin must not delete playlist';
  END IF;

  INSERT INTO public.playlist_collaborators (playlist_id, user_id, role, added_by)
  VALUES (v_legacy, v_playlist_admin_id, 'editor', v_admin_id);

  UPDATE public.playlist_collaborators
  SET role = 'playlist_admin'
  WHERE role IN ('editor', 'manager');

  SELECT count(*) INTO cnt
  FROM public.playlist_collaborators
  WHERE role IS DISTINCT FROM 'playlist_admin';

  IF cnt <> 0 THEN
    RAISE EXCEPTION 'backfill must leave only playlist_admin';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_dir_editor_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_dir_editor_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  DELETE FROM public.playlists WHERE id = v_pl_a;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'direction editor JWT must not delete platform playlist';
  END IF;

  RESET ROLE;
END;
$$;
