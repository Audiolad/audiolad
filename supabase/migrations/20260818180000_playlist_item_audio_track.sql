BEGIN;

-- =============================================================================
-- Public / editorial playlists: music item unit is a concrete audio_items row.
-- Additive and backward-compatible.
--
-- Proof a migration is required:
--   playlist_items.practice_id references practices.id (the album/product).
--   UNIQUE (playlist_id, practice_id) forbids two tracks from one album.
--   There is no audio_item_id column. audio_items already stores tracks.
--
-- Existing rows keep audio_item_id NULL and keep playing as whole products.
-- =============================================================================

ALTER TABLE public.playlist_items
  ADD COLUMN IF NOT EXISTS audio_item_id uuid
    REFERENCES public.audio_items (id)
    ON DELETE CASCADE;

COMMENT ON COLUMN public.playlist_items.audio_item_id IS
  'Optional concrete published audio track. NULL = legacy whole-product item.';

COMMENT ON TABLE public.playlist_items IS
  'Ordered playlist entries. practice_id is the product; audio_item_id is the track when set.';

ALTER TABLE public.playlist_items
  DROP CONSTRAINT IF EXISTS playlist_items_playlist_practice_unique;

CREATE UNIQUE INDEX IF NOT EXISTS playlist_items_playlist_product_unique_idx
  ON public.playlist_items (playlist_id, practice_id)
  WHERE audio_item_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS playlist_items_playlist_audio_item_unique_idx
  ON public.playlist_items (playlist_id, audio_item_id)
  WHERE audio_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS playlist_items_audio_item_id_idx
  ON public.playlist_items (audio_item_id)
  WHERE audio_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_playlist_item_audio_matches_practice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.audio_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audio_items AS ai
    WHERE ai.id = NEW.audio_item_id
      AND ai.practice_id = NEW.practice_id
  ) THEN
    RAISE EXCEPTION 'audio_item_practice_mismatch'
      USING ERRCODE = '23514',
        DETAIL = format(
          'audio_item_id=%s practice_id=%s',
          NEW.audio_item_id,
          NEW.practice_id
        );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playlist_items_audio_matches_practice
  ON public.playlist_items;

CREATE TRIGGER playlist_items_audio_matches_practice
  BEFORE INSERT OR UPDATE OF practice_id, audio_item_id
  ON public.playlist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_playlist_item_audio_matches_practice();

-- ---------------------------------------------------------------------------
-- add_editorial_playlist_practices(uuid, uuid[], uuid[])
-- Same authority as the 2-arg product RPC (can_user_edit_playlist).
-- NULL audio ids keep whole-product rows. Non-null ids store tracks.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_editorial_playlist_practices(
  p_playlist_id uuid,
  p_practice_ids uuid[],
  p_audio_item_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_playlist public.playlists%ROWTYPE;
  v_practice_id uuid;
  v_audio_item_id uuid;
  v_practice public.practices%ROWTYPE;
  v_audio public.audio_items%ROWTYPE;
  v_items_count integer;
  v_next_pos integer;
  v_has_item boolean;
  v_added integer := 0;
  v_skipped integer := 0;
  v_audio_count integer;
  v_added_ids uuid[] := ARRAY[]::uuid[];
  v_count integer;
  v_ord integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_playlist_id IS NULL THEN
    RAISE EXCEPTION 'playlist_id_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_practice_ids IS NULL OR cardinality(p_practice_ids) = 0 THEN
    RAISE EXCEPTION 'practice_ids_required'
      USING ERRCODE = '22023';
  END IF;

  IF cardinality(p_practice_ids) > 50 THEN
    RAISE EXCEPTION 'practice_ids_limit'
      USING ERRCODE = '22023';
  END IF;

  IF p_audio_item_ids IS NULL
    OR cardinality(p_audio_item_ids) IS DISTINCT FROM cardinality(p_practice_ids)
  THEN
    RAISE EXCEPTION 'audio_item_ids_required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_audio_item_ids) AS x(id)
    WHERE x.id IS NOT NULL
    GROUP BY x.id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_audio_item_ids'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_practice_ids, p_audio_item_ids) AS x(practice_id, audio_item_id)
    WHERE x.audio_item_id IS NULL
    GROUP BY x.practice_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_practice_ids'
      USING ERRCODE = '22023';
  END IF;

  SELECT pl.*
  INTO v_playlist
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_user_edit_playlist(v_playlist.id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_playlist.is_editorial IS NOT TRUE
    OR v_playlist.owner_type IS DISTINCT FROM 'platform' THEN
    RAISE EXCEPTION 'not_editorial_playlist'
      USING ERRCODE = 'P0001';
  END IF;

  v_count := cardinality(p_practice_ids);

  FOR v_ord IN 1..v_count
  LOOP
    v_practice_id := p_practice_ids[v_ord];
    v_audio_item_id := p_audio_item_ids[v_ord];

    IF v_audio_item_id IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.playlist_items AS pi
        WHERE pi.playlist_id = v_playlist.id
          AND pi.practice_id = v_practice_id
          AND pi.audio_item_id IS NULL
      )
      INTO v_has_item;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.playlist_items AS pi
        WHERE pi.playlist_id = v_playlist.id
          AND pi.audio_item_id = v_audio_item_id
      )
      INTO v_has_item;
    END IF;

    IF v_has_item THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT p.*
    INTO v_practice
    FROM public.practices AS p
    WHERE p.id = v_practice_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'practice_not_found'
        USING ERRCODE = 'P0002',
          DETAIL = format('practice_id=%s', v_practice_id);
    END IF;

    IF v_practice.status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'practice_not_publishable'
        USING ERRCODE = 'P0001',
          DETAIL = format('practice_id=%s', v_practice_id);
    END IF;

    IF v_practice.is_catalog_listed IS NOT TRUE THEN
      RAISE EXCEPTION 'practice_not_publishable'
        USING ERRCODE = 'P0001',
          DETAIL = format('practice_id=%s', v_practice_id);
    END IF;

    IF v_practice.slug IS NULL OR btrim(v_practice.slug) = '' THEN
      RAISE EXCEPTION 'practice_not_publishable'
        USING ERRCODE = 'P0001',
          DETAIL = format('practice_id=%s', v_practice_id);
    END IF;

    IF v_practice.author_id IS NULL THEN
      RAISE EXCEPTION 'practice_not_publishable'
        USING ERRCODE = 'P0001',
          DETAIL = format('practice_id=%s', v_practice_id);
    END IF;

    IF v_audio_item_id IS NOT NULL THEN
      SELECT ai.*
      INTO v_audio
      FROM public.audio_items AS ai
      WHERE ai.id = v_audio_item_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'audio_item_not_found'
          USING ERRCODE = 'P0002',
            DETAIL = format('audio_item_id=%s', v_audio_item_id);
      END IF;

      IF v_audio.practice_id IS DISTINCT FROM v_practice.id THEN
        RAISE EXCEPTION 'audio_item_practice_mismatch'
          USING ERRCODE = '22023',
            DETAIL = format('audio_item_id=%s', v_audio_item_id);
      END IF;

      IF v_audio.status IS DISTINCT FROM 'published' THEN
        RAISE EXCEPTION 'practice_not_playable'
          USING ERRCODE = 'P0001',
            DETAIL = format('audio_item_id=%s', v_audio_item_id);
      END IF;
    ELSE
      SELECT count(*)
      INTO v_audio_count
      FROM public.audio_items AS ai
      WHERE ai.practice_id = v_practice.id
        AND ai.status = 'published';

      IF v_audio_count = 0
        AND (
          v_practice.audio_url IS NULL
          OR btrim(v_practice.audio_url) = ''
        ) THEN
        RAISE EXCEPTION 'practice_not_playable'
          USING ERRCODE = 'P0001',
            DETAIL = format('practice_id=%s', v_practice_id);
      END IF;
    END IF;

    SELECT count(*)
    INTO v_items_count
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = v_playlist.id;

    IF v_items_count >= 100 THEN
      RAISE EXCEPTION 'items_limit_reached'
        USING ERRCODE = 'P0001',
          DETAIL = format('playlist_id=%s', v_playlist.id);
    END IF;

    SELECT COALESCE(max(pi.position), 0) + 1
    INTO v_next_pos
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = v_playlist.id;

    INSERT INTO public.playlist_items (
      playlist_id,
      practice_id,
      audio_item_id,
      position
    )
    VALUES (v_playlist.id, v_practice_id, v_audio_item_id, v_next_pos);

    v_added := v_added + 1;
    v_added_ids := array_append(v_added_ids, v_practice_id);
  END LOOP;

  IF v_added > 0 THEN
    UPDATE public.playlists
    SET updated_at = clock_timestamp()
    WHERE id = v_playlist.id;

    PERFORM public.log_playlist_audit(
      v_playlist.id,
      'item_added',
      jsonb_build_object(
        'practice_ids', to_jsonb(v_added_ids),
        'audio_item_ids', to_jsonb(p_audio_item_ids),
        'added', v_added,
        'skipped', v_skipped
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'playlist_id', v_playlist.id,
    'added', v_added,
    'skipped', v_skipped,
    'practice_ids', to_jsonb(p_practice_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[], uuid[]) IS
  'playlists.manage, collaborator, or direction editor: append published catalog practices or concrete audio tracks to a platform editorial playlist. Skips duplicates at the stored item unit.';

GRANT EXECUTE ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[], uuid[])
  TO authenticated;

REVOKE ALL ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[], uuid[])
  FROM PUBLIC;

REVOKE ALL ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[], uuid[])
  FROM anon;

-- 2-arg product RPC: duplicate check must not treat a track row as the product.
CREATE OR REPLACE FUNCTION public.add_editorial_playlist_practices(
  p_playlist_id uuid,
  p_practice_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nulls uuid[];
BEGIN
  IF p_practice_ids IS NULL THEN
    v_nulls := NULL;
  ELSE
    v_nulls := array_fill(NULL::uuid, ARRAY[cardinality(p_practice_ids)]);
  END IF;

  RETURN public.add_editorial_playlist_practices(
    p_playlist_id,
    p_practice_ids,
    v_nulls
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- move_playlist_item: disambiguate by optional audio_item_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_playlist_item(
  p_playlist_id uuid,
  p_practice_id uuid,
  p_direction text,
  p_audio_item_id uuid
)
RETURNS TABLE (
  moved boolean,
  from_position integer,
  to_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_direction text;
  v_playlist public.playlists%ROWTYPE;
  v_current public.playlist_items%ROWTYPE;
  v_neighbor public.playlist_items%ROWTYPE;
  v_from integer;
  v_to integer;
  v_temp integer;
  v_max_pos integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_playlist_id IS NULL OR p_practice_id IS NULL THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_direction := lower(btrim(COALESCE(p_direction, '')));

  IF v_direction IS DISTINCT FROM 'up' AND v_direction IS DISTINCT FROM 'down' THEN
    RAISE EXCEPTION 'invalid_direction'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_playlist
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_user_edit_playlist(p_playlist_id, v_user_id) THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_current
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = p_playlist_id
    AND pi.practice_id = p_practice_id
    AND pi.audio_item_id IS NOT DISTINCT FROM p_audio_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_from := v_current.position;

  IF v_direction = 'up' THEN
    SELECT *
    INTO v_neighbor
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = p_playlist_id
      AND pi.position < v_from
    ORDER BY pi.position DESC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT *
    INTO v_neighbor
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = p_playlist_id
      AND pi.position > v_from
    ORDER BY pi.position ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    moved := false;
    from_position := v_from;
    to_position := v_from;
    RETURN NEXT;
    RETURN;
  END IF;

  v_to := v_neighbor.position;

  SELECT COALESCE(MAX(pi.position), 0)
  INTO v_max_pos
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = p_playlist_id;

  IF v_max_pos >= 2147483647 THEN
    RAISE EXCEPTION 'reorder_conflict'
      USING ERRCODE = 'P0001';
  END IF;

  v_temp := v_max_pos + 1;

  UPDATE public.playlist_items AS pi
  SET position = v_temp
  WHERE pi.id = v_current.id;

  UPDATE public.playlist_items AS pi
  SET position = v_from
  WHERE pi.id = v_neighbor.id;

  UPDATE public.playlist_items AS pi
  SET position = v_to
  WHERE pi.id = v_current.id;

  UPDATE public.playlists AS pl
  SET updated_at = v_now
  WHERE pl.id = p_playlist_id;

  PERFORM public.log_playlist_audit(
    p_playlist_id,
    'item_moved',
    jsonb_build_object(
      'practice_id', p_practice_id,
      'audio_item_id', p_audio_item_id,
      'from_position', v_from,
      'to_position', v_to
    )
  );

  moved := true;
  from_position := v_from;
  to_position := v_to;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid) IS
  'Atomic swap of playlist_items.position. Optional audio_item_id selects a track row.';

GRANT EXECUTE ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid)
  FROM anon;

CREATE OR REPLACE FUNCTION public.move_playlist_item(
  p_playlist_id uuid,
  p_practice_id uuid,
  p_direction text
)
RETURNS TABLE (
  moved boolean,
  from_position integer,
  to_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.move_playlist_item(
    p_playlist_id,
    p_practice_id,
    p_direction,
    NULL::uuid
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- replace_playlist_item: optional old/new audio_item_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_playlist_item(
  p_playlist_id uuid,
  p_old_practice_id uuid,
  p_new_practice_id uuid,
  p_old_audio_item_id uuid,
  p_new_audio_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_playlist public.playlists%ROWTYPE;
  v_item public.playlist_items%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_audio public.audio_items%ROWTYPE;
  v_audio_count integer;
  v_has_new boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_playlist_id IS NULL THEN
    RAISE EXCEPTION 'playlist_id_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_old_practice_id IS NULL OR p_new_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT pl.*
  INTO v_playlist
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_user_edit_playlist(v_playlist.id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_playlist.is_editorial IS NOT TRUE
    OR v_playlist.owner_type IS DISTINCT FROM 'platform' THEN
    RAISE EXCEPTION 'not_editorial_playlist'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pi.*
  INTO v_item
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = v_playlist.id
    AND pi.practice_id = p_old_practice_id
    AND pi.audio_item_id IS NOT DISTINCT FROM p_old_audio_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_old_practice_id = p_new_practice_id
    AND p_old_audio_item_id IS NOT DISTINCT FROM p_new_audio_item_id THEN
    RETURN jsonb_build_object(
      'playlist_id', v_playlist.id,
      'position', v_item.position,
      'old_practice_id', p_old_practice_id,
      'new_practice_id', p_new_practice_id,
      'replaced', false
    );
  END IF;

  IF p_new_audio_item_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.playlist_items AS pi
      WHERE pi.playlist_id = v_playlist.id
        AND pi.practice_id = p_new_practice_id
        AND pi.audio_item_id IS NULL
        AND pi.id <> v_item.id
    )
    INTO v_has_new;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.playlist_items AS pi
      WHERE pi.playlist_id = v_playlist.id
        AND pi.audio_item_id = p_new_audio_item_id
        AND pi.id <> v_item.id
    )
    INTO v_has_new;
  END IF;

  IF v_has_new THEN
    RAISE EXCEPTION 'already_in_playlist'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_new_practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_publishable'
      USING ERRCODE = 'P0001',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  IF v_practice.is_catalog_listed IS NOT TRUE THEN
    RAISE EXCEPTION 'practice_not_publishable'
      USING ERRCODE = 'P0001',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  IF v_practice.slug IS NULL OR btrim(v_practice.slug) = '' THEN
    RAISE EXCEPTION 'practice_not_publishable'
      USING ERRCODE = 'P0001',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  IF v_practice.author_id IS NULL THEN
    RAISE EXCEPTION 'practice_not_publishable'
      USING ERRCODE = 'P0001',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  IF p_new_audio_item_id IS NOT NULL THEN
    SELECT ai.*
    INTO v_audio
    FROM public.audio_items AS ai
    WHERE ai.id = p_new_audio_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'audio_item_not_found'
        USING ERRCODE = 'P0002',
          DETAIL = format('audio_item_id=%s', p_new_audio_item_id);
    END IF;

    IF v_audio.practice_id IS DISTINCT FROM v_practice.id THEN
      RAISE EXCEPTION 'audio_item_practice_mismatch'
        USING ERRCODE = '22023',
          DETAIL = format('audio_item_id=%s', p_new_audio_item_id);
    END IF;

    IF v_audio.status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'practice_not_playable'
        USING ERRCODE = 'P0001',
          DETAIL = format('audio_item_id=%s', p_new_audio_item_id);
    END IF;
  ELSE
    SELECT count(*)
    INTO v_audio_count
    FROM public.audio_items AS ai
    WHERE ai.practice_id = v_practice.id
      AND ai.status = 'published';

    IF v_audio_count = 0
      AND (
        v_practice.audio_url IS NULL
        OR btrim(v_practice.audio_url) = ''
      ) THEN
      RAISE EXCEPTION 'practice_not_playable'
        USING ERRCODE = 'P0001',
          DETAIL = format('practice_id=%s', p_new_practice_id);
    END IF;
  END IF;

  UPDATE public.playlist_items
  SET practice_id = p_new_practice_id,
      audio_item_id = p_new_audio_item_id
  WHERE id = v_item.id
    AND playlist_id = v_playlist.id
    AND position = v_item.position;

  UPDATE public.playlists
  SET updated_at = clock_timestamp()
  WHERE id = v_playlist.id;

  PERFORM public.log_playlist_audit(
    v_playlist.id,
    'item_replaced',
    jsonb_build_object(
      'old_practice_id', p_old_practice_id,
      'new_practice_id', p_new_practice_id,
      'old_audio_item_id', p_old_audio_item_id,
      'new_audio_item_id', p_new_audio_item_id,
      'position', v_item.position
    )
  );

  RETURN jsonb_build_object(
    'playlist_id', v_playlist.id,
    'position', v_item.position,
    'old_practice_id', p_old_practice_id,
    'new_practice_id', p_new_practice_id,
    'replaced', true
  );
END;
$$;

COMMENT ON FUNCTION public.replace_playlist_item(uuid, uuid, uuid, uuid, uuid) IS
  'Atomic editorial item replace. Optional audio_item ids swap a concrete track.';

GRANT EXECUTE ON FUNCTION public.replace_playlist_item(uuid, uuid, uuid, uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.replace_playlist_item(uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION public.replace_playlist_item(uuid, uuid, uuid, uuid, uuid)
  FROM anon;

CREATE OR REPLACE FUNCTION public.replace_playlist_item(
  p_playlist_id uuid,
  p_old_practice_id uuid,
  p_new_practice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.replace_playlist_item(
    p_playlist_id,
    p_old_practice_id,
    p_new_practice_id,
    NULL::uuid,
    NULL::uuid
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.add_editorial_playlist_practices(uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 2-arg add_editorial_playlist_practices missing';
  END IF;

  IF to_regprocedure('public.add_editorial_playlist_practices(uuid,uuid[],uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 3-arg add_editorial_playlist_practices missing';
  END IF;

  IF to_regprocedure('public.move_playlist_item(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 3-arg move_playlist_item missing';
  END IF;

  IF to_regprocedure('public.move_playlist_item(uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 4-arg move_playlist_item missing';
  END IF;

  IF to_regprocedure('public.replace_playlist_item(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 3-arg replace_playlist_item missing';
  END IF;

  IF to_regprocedure('public.replace_playlist_item(uuid,uuid,uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 5-arg replace_playlist_item missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'playlist_items'
      AND column_name = 'audio_item_id'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: playlist_items.audio_item_id missing';
  END IF;
END;
$$;

COMMIT;
