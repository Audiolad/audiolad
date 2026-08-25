-- Isolated smoke for playlist listing aggregates + playlist_saves.
-- Apply only on a stub database after
-- scripts/lib/playlist-catalog-foundation-sql-stub.sql and
-- 20260825140000_playlist_catalog_foundation.sql.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  practice_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  playlist_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  track_id uuid;
  save_count integer;
  items integer;
  duration integer;
  saves integer;
  listed timestamptz;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b);
  INSERT INTO public.practices (id) VALUES (practice_id);

  INSERT INTO public.audio_items (practice_id, duration_seconds)
  VALUES (practice_id, 90)
  RETURNING id INTO track_id;

  INSERT INTO public.playlists (id, title, visibility, slug, published_at)
  VALUES (
    playlist_id,
    'Витрина',
    'public',
    'vitrina',
    now()
  );

  SELECT items_count, duration_seconds, saves_count, listed_at
  INTO items, duration, saves, listed
  FROM public.playlists
  WHERE id = playlist_id;

  IF items <> 0 OR duration <> 0 OR saves <> 0 OR listed IS NOT NULL THEN
    RAISE EXCEPTION 'new playlist must start empty and unlisted';
  END IF;

  INSERT INTO public.playlist_items (playlist_id, practice_id, audio_item_id, position)
  VALUES (playlist_id, practice_id, track_id, 1);

  SELECT items_count, duration_seconds
  INTO items, duration
  FROM public.playlists
  WHERE id = playlist_id;

  IF items <> 1 THEN
    RAISE EXCEPTION 'items_count after insert expected 1, got %', items;
  END IF;

  IF duration <> 90 THEN
    RAISE EXCEPTION 'duration_seconds after track insert expected 90, got %', duration;
  END IF;

  INSERT INTO public.playlist_saves (user_id, playlist_id)
  VALUES (user_a, playlist_id);

  SELECT count(*) INTO save_count
  FROM public.playlist_saves
  WHERE user_id = user_a AND playlist_id = playlist_id;

  IF save_count <> 1 THEN
    RAISE EXCEPTION 'expected one playlist save, got %', save_count;
  END IF;

  SELECT saves_count INTO saves
  FROM public.playlists
  WHERE id = playlist_id;

  IF saves <> 1 THEN
    RAISE EXCEPTION 'saves_count after save expected 1, got %', saves;
  END IF;

  BEGIN
    INSERT INTO public.playlist_saves (user_id, playlist_id)
    VALUES (user_a, playlist_id);
    RAISE EXCEPTION 'duplicate playlist save must fail unique(user_id, playlist_id)';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  SELECT count(*) INTO save_count FROM public.playlist_saves;
  IF save_count <> 1 THEN
    RAISE EXCEPTION 'duplicate insert created a second playlist save';
  END IF;

  UPDATE public.playlists
  SET listed_at = now()
  WHERE id = playlist_id;

  SELECT listed_at INTO listed
  FROM public.playlists
  WHERE id = playlist_id;

  IF listed IS NULL THEN
    RAISE EXCEPTION 'public published playlist must accept listed_at';
  END IF;

  UPDATE public.playlists
  SET visibility = 'private', published_at = NULL, slug = NULL
  WHERE id = playlist_id;

  SELECT listed_at INTO listed
  FROM public.playlists
  WHERE id = playlist_id;

  IF listed IS NOT NULL THEN
    RAISE EXCEPTION 'unpublish must clear listed_at';
  END IF;

  DELETE FROM public.playlist_saves
  WHERE user_id = user_a AND playlist_id = playlist_id;

  SELECT saves_count INTO saves
  FROM public.playlists
  WHERE id = playlist_id;

  IF saves <> 0 THEN
    RAISE EXCEPTION 'saves_count after delete expected 0, got %', saves;
  END IF;

  DELETE FROM public.playlist_items WHERE playlist_id = playlist_id;

  SELECT items_count, duration_seconds
  INTO items, duration
  FROM public.playlists
  WHERE id = playlist_id;

  IF items <> 0 OR duration <> 0 THEN
    RAISE EXCEPTION 'aggregates after item delete expected 0, got % / %', items, duration;
  END IF;
END;
$$;
