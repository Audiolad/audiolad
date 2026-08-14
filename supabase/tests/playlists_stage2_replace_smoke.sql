-- Stage 2 replace_playlist_item smoke — isolated test DB only.
-- Never production `postgres`.
--
-- Prerequisites: Stage 1 ownership migration +
--   20260814180000_replace_playlist_item.sql
--   and at least one public.authors row plus two published catalog practices.
--
-- Example:
--   docker exec -i supabase-db psql -U postgres -d audiolad_playlists_stage2_test \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/playlists_stage2_replace_smoke.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_admin_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_listener_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_author_id uuid;
  v_pl uuid;
  practice_a uuid;
  practice_b uuid;
  practice_c uuid;
  result jsonb;
  pos integer;
  pid uuid;
  raised boolean;
BEGIN
  IF to_regprocedure('public.replace_playlist_item(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'replace_playlist_item missing — apply stage 2 migration first';
  END IF;

  SELECT id INTO v_author_id FROM public.authors LIMIT 1;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'need at least one authors row';
  END IF;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, audio_url
  ) VALUES
    (v_author_id, 'Stage2 A', 'stage2-smoke-a', 'published', true, 0, true, 'https://example.com/a.mp3'),
    (v_author_id, 'Stage2 B', 'stage2-smoke-b', 'published', true, 0, true, 'https://example.com/b.mp3'),
    (v_author_id, 'Stage2 C', 'stage2-smoke-c', 'published', true, 0, true, 'https://example.com/c.mp3');

  SELECT id INTO practice_a FROM public.practices WHERE slug = 'stage2-smoke-a';
  SELECT id INTO practice_b FROM public.practices WHERE slug = 'stage2-smoke-b';
  SELECT id INTO practice_c FROM public.practices WHERE slug = 'stage2-smoke-c';

  INSERT INTO public.playlists (
    user_id, owner_type, created_by, title, visibility, slug, is_editorial
  ) VALUES (
    NULL, 'platform', v_admin_id, 'Stage2 replace', 'private', 'stage2-smoke-replace', true
  ) RETURNING id INTO v_pl;

  INSERT INTO public.playlist_items (playlist_id, practice_id, position) VALUES
    (v_pl, practice_a, 1),
    (v_pl, practice_c, 2);

  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  result := public.replace_playlist_item(v_pl, practice_a, practice_b);
  IF (result->>'replaced')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'replace should succeed: %', result;
  END IF;
  IF (result->>'position')::int <> 1 THEN
    RAISE EXCEPTION 'replace must keep position 1: %', result;
  END IF;

  RESET ROLE;
  SELECT practice_id, position INTO pid, pos
  FROM public.playlist_items
  WHERE playlist_id = v_pl AND position = 1;
  IF pid <> practice_b OR pos <> 1 THEN
    RAISE EXCEPTION 'position 1 must now be practice B';
  END IF;

  SELECT practice_id INTO pid
  FROM public.playlist_items
  WHERE playlist_id = v_pl AND position = 2;
  IF pid <> practice_c THEN
    RAISE EXCEPTION 'other rows must not shift';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  result := public.replace_playlist_item(v_pl, practice_b, practice_b);
  IF (result->>'replaced')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'same-id replace must be a no-op without new audit requirement';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.replace_playlist_item(v_pl, practice_b, practice_c);
  EXCEPTION
    WHEN others THEN
      IF SQLERRM ILIKE '%already_in_playlist%' THEN
        raised := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'duplicate replace must be rejected';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_listener_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_listener_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  raised := false;
  BEGIN
    PERFORM public.replace_playlist_item(v_pl, practice_b, practice_a);
  EXCEPTION
    WHEN others THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'ordinary listener must not replace';
  END IF;

  RESET ROLE;
  DELETE FROM public.playlist_items WHERE playlist_id = v_pl;
  DELETE FROM public.playlist_audit_log WHERE playlist_id = v_pl;
  DELETE FROM public.playlists WHERE id = v_pl;
  DELETE FROM public.practices WHERE slug LIKE 'stage2-smoke-%';

  RAISE NOTICE 'PLAYLISTS_STAGE2_REPLACE_SMOKE_PASS';
END;
$$;
