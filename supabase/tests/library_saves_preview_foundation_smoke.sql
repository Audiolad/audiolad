-- Isolated smoke for library_saves + audio_items preview window.
-- Apply only on a stub database after
-- scripts/lib/catalog-foundation-sql-stub.sql and the Phase 1 migration.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  practice_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  audio_id uuid;
  save_count integer;
  raised boolean;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b);
  INSERT INTO public.practices (id) VALUES (practice_id);

  INSERT INTO public.library_saves (user_id, practice_id)
  VALUES (user_a, practice_id);

  SELECT count(*) INTO save_count
  FROM public.library_saves
  WHERE user_id = user_a AND public.library_saves.practice_id = practice_id;

  IF save_count <> 1 THEN
    RAISE EXCEPTION 'expected one save, got %', save_count;
  END IF;

  BEGIN
    INSERT INTO public.library_saves (user_id, practice_id)
    VALUES (user_a, practice_id);
    RAISE EXCEPTION 'duplicate save must fail unique(user_id, practice_id)';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  SELECT count(*) INTO save_count FROM public.library_saves;
  IF save_count <> 1 THEN
    RAISE EXCEPTION 'duplicate insert created a second row';
  END IF;

  DELETE FROM public.library_saves
  WHERE user_id = user_a AND public.library_saves.practice_id = practice_id;

  SELECT count(*) INTO save_count FROM public.library_saves;
  IF save_count <> 0 THEN
    RAISE EXCEPTION 'delete did not remove the save';
  END IF;

  INSERT INTO public.audio_items (practice_id, title, is_preview)
  VALUES (practice_id, 'legacy', false)
  RETURNING id INTO audio_id;

  UPDATE public.audio_items
  SET preview_start_ms = 10000, preview_end_ms = 70000
  WHERE id = audio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'valid preview window must persist';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.audio_items
    SET preview_start_ms = 0, preview_end_ms = 10000
    WHERE id = audio_id;
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;

  IF NOT raised THEN
    RAISE EXCEPTION 'preview shorter than 30s must fail';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.audio_items
    SET preview_start_ms = 0, preview_end_ms = 120000
    WHERE id = audio_id;
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;

  IF NOT raised THEN
    RAISE EXCEPTION 'preview longer than 90s must fail';
  END IF;
END;
$$;
