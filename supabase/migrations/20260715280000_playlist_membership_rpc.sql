BEGIN;

-- ---------------------------------------------------------------------------
-- Playlists PR3.1: atomic practice ↔ playlist membership
--
-- Order (single transaction):
--   auth / input validation
--   → practice lookup
--   → ownership of every target playlist
--   → compute entitlement / public-content gates (for additions only)
--   → lock owned playlists (targets + current memberships)
--   → preflight: gates + limit 100 for every playlist that would gain an item
--   → delete memberships not in target set (no entitlement/public gate)
--   → insert missing memberships + assign position under lock
--   → bump updated_at only on playlists that actually changed
--
-- Never writes user_practices. Never grants entitlement.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_practice_playlist_membership(
  p_practice_id uuid,
  p_playlist_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_ids uuid[];
  v_id uuid;
  v_playlist public.playlists%ROWTYPE;
  v_owned_count integer;
  v_items_count integer;
  v_next_pos integer;
  v_has_item boolean;
  v_can_private boolean;
  v_can_public boolean;
  v_changed boolean;
  v_added integer := 0;
  v_removed integer := 0;
  v_touched uuid[] := ARRAY[]::uuid[];
  v_to_add uuid[] := ARRAY[]::uuid[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_playlist_ids IS NULL THEN
    RAISE EXCEPTION 'playlist_ids_required'
      USING ERRCODE = '22023';
  END IF;

  IF cardinality(p_playlist_ids) > 50 THEN
    RAISE EXCEPTION 'playlist_ids_limit'
      USING ERRCODE = '22023';
  END IF;

  -- Reject duplicate IDs (do not silently uniq).
  IF EXISTS (
    SELECT 1
    FROM unnest(p_playlist_ids) AS x(id)
    GROUP BY x.id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_playlist_ids'
      USING ERRCODE = '22023';
  END IF;

  -- Stable order for locking / iteration
  SELECT COALESCE(array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(p_playlist_ids) AS x(id);

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Ownership: every requested playlist must belong to current user
  IF cardinality(v_ids) > 0 THEN
    SELECT count(*)
    INTO v_owned_count
    FROM public.playlists AS pl
    WHERE pl.user_id = v_user_id
      AND pl.id = ANY (v_ids);

    IF v_owned_count <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'playlist_not_found'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Private entitlement gate (mirrors resolveProductAccess canListen paths)
  -- Used only for NEW additions, never for removals.
  v_can_private :=
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = v_practice.author_id
        AND am.user_id = v_user_id
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.user_practices AS up
        WHERE up.user_id = v_user_id
          AND up.practice_id = v_practice.id
          AND (up.expires_at IS NULL OR up.expires_at > now())
      )
      AND v_practice.status IN ('published', 'unpublished', 'archived')
    )
    OR (
      v_practice.is_free IS TRUE
      AND v_practice.status = 'published'
      AND v_practice.is_catalog_listed IS DISTINCT FROM FALSE
    );

  -- Public content gate (mirrors claim_free_practice)
  -- Used only for NEW additions, never for removals.
  v_can_public :=
    v_practice.status = 'published'
    AND v_practice.is_catalog_listed IS TRUE
    AND v_practice.is_free IS TRUE
    AND (v_practice.price IS NULL OR v_practice.price <= 0);

  -- Lock all owned playlists that currently contain the practice OR are targets.
  PERFORM 1
  FROM public.playlists AS pl
  WHERE pl.user_id = v_user_id
    AND (
      pl.id = ANY (v_ids)
      OR EXISTS (
        SELECT 1
        FROM public.playlist_items AS pi
        WHERE pi.playlist_id = pl.id
          AND pi.practice_id = p_practice_id
      )
    )
  ORDER BY pl.id
  FOR UPDATE;

  -- Preflight additions: gates + limit BEFORE any DELETE/INSERT.
  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT pl.*
    INTO v_playlist
    FROM public.playlists AS pl
    WHERE pl.id = v_id
      AND pl.user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'playlist_not_found'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.playlist_items AS pi
      WHERE pi.playlist_id = v_playlist.id
        AND pi.practice_id = p_practice_id
    )
    INTO v_has_item;

    IF v_has_item THEN
      CONTINUE;
    END IF;

    IF v_playlist.visibility = 'public' THEN
      IF NOT v_can_public THEN
        RAISE EXCEPTION 'public_content_invalid'
          USING ERRCODE = 'P0001',
            DETAIL = format('playlist_id=%s', v_playlist.id);
      END IF;
    ELSE
      IF NOT v_can_private THEN
        RAISE EXCEPTION 'entitlement_required'
          USING ERRCODE = 'P0001',
            DETAIL = format('playlist_id=%s', v_playlist.id);
      END IF;
    END IF;

    SELECT count(*)
    INTO v_items_count
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = v_playlist.id;

    IF v_items_count >= 100 THEN
      RAISE EXCEPTION 'items_limit_reached'
        USING ERRCODE = 'P0001',
          DETAIL = format(
            'playlist_id=%s;title=%s',
            v_playlist.id,
            replace(v_playlist.title, ';', ' ')
          );
    END IF;

    v_to_add := array_append(v_to_add, v_playlist.id);
  END LOOP;

  -- Removals: existing owner memberships not in target set.
  -- No entitlement / public-content gate on remove.
  FOR v_playlist IN
    SELECT pl.*
    FROM public.playlists AS pl
    JOIN public.playlist_items AS pi
      ON pi.playlist_id = pl.id
    WHERE pl.user_id = v_user_id
      AND pi.practice_id = p_practice_id
      AND NOT (pl.id = ANY (v_ids))
    ORDER BY pl.id
  LOOP
    DELETE FROM public.playlist_items
    WHERE playlist_id = v_playlist.id
      AND practice_id = p_practice_id;

    IF FOUND THEN
      -- clock_timestamp(): advance even when caller wraps multiple RPC calls
      -- in one outer transaction (now() is transaction-stable).
      UPDATE public.playlists
      SET updated_at = clock_timestamp()
      WHERE id = v_playlist.id;

      v_removed := v_removed + 1;
      v_touched := array_append(v_touched, v_playlist.id);
    END IF;
  END LOOP;

  -- Inserts (already preflighted)
  FOREACH v_id IN ARRAY v_to_add
  LOOP
    SELECT pl.*
    INTO v_playlist
    FROM public.playlists AS pl
    WHERE pl.id = v_id
      AND pl.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'playlist_not_found'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(max(pi.position), 0) + 1
    INTO v_next_pos
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = v_playlist.id;

    INSERT INTO public.playlist_items (playlist_id, practice_id, position)
    VALUES (v_playlist.id, p_practice_id, v_next_pos);

    UPDATE public.playlists
    SET updated_at = clock_timestamp()
    WHERE id = v_playlist.id;

    v_added := v_added + 1;
    v_touched := array_append(v_touched, v_playlist.id);
  END LOOP;

  v_changed := (v_added > 0 OR v_removed > 0);

  RETURN jsonb_build_object(
    'practice_id', p_practice_id,
    'playlist_ids', to_jsonb(v_ids),
    'added', v_added,
    'removed', v_removed,
    'changed', v_changed,
    'touched_playlist_ids', to_jsonb(v_touched)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_practice_playlist_membership(uuid, uuid[])
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_practice_playlist_membership(uuid, uuid[])
  FROM anon;
GRANT EXECUTE ON FUNCTION public.set_practice_playlist_membership(uuid, uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_practice_playlist_membership(uuid, uuid[])
  TO service_role;

COMMENT ON FUNCTION public.set_practice_playlist_membership(uuid, uuid[]) IS
  'audiolad:playlist-membership:v1; atomically set practice membership across owner playlists; auth.uid(); private needs entitlement for add; public needs free catalog product for add; removals ungated; never grants entitlement; max 100 items; position MAX+1 under lock; preflight before mutate';

DO $$
BEGIN
  IF to_regprocedure('public.set_practice_playlist_membership(uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: set_practice_playlist_membership was not created';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.set_practice_playlist_membership(uuid,uuid[])',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must have EXECUTE';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.set_practice_playlist_membership(uuid,uuid[])',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not have EXECUTE';
  END IF;
END;
$$;

COMMIT;
