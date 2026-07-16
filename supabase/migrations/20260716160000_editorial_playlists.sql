BEGIN;

-- ---------------------------------------------------------------------------
-- Editorial public playlists (Плейлисты АудиоЛада)
--
-- Extends user-owned playlists with is_editorial flag.
-- Platform admins can populate editorial playlists from the full published
-- catalog without personal library entitlement.
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS is_editorial boolean NOT NULL DEFAULT false;

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_editorial_requires_public_check;

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_editorial_requires_public_check
  CHECK (
    is_editorial IS NOT TRUE
    OR visibility = 'public'
  );

CREATE INDEX IF NOT EXISTS playlists_editorial_public_idx
  ON public.playlists (published_at DESC NULLS LAST, created_at DESC)
  WHERE is_editorial IS TRUE AND visibility = 'public';

COMMENT ON COLUMN public.playlists.is_editorial IS
  'When true: curated AudioLad editorial playlist. Requires visibility=public. Populated via platform admin catalog picker.';

-- ---------------------------------------------------------------------------
-- Platform admin role (profiles.role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS pr
    WHERE pr.id = p_user_id
      AND pr.role = 'platform_admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_platform_admin(uuid) IS
  'Returns true when profiles.role = platform_admin for the given user (default auth.uid()).';

-- Assign platform admin role to the official owner account when present.
DO $$
DECLARE
  v_user_id uuid;
  v_user_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_user_count
  FROM auth.users AS u
  WHERE lower(u.email) = lower('1@audiolad.ru');

  IF v_user_count = 1 THEN
    SELECT u.id
    INTO v_user_id
    FROM auth.users AS u
    WHERE lower(u.email) = lower('1@audiolad.ru')
    ORDER BY u.id
    LIMIT 1;
  END IF;

  IF v_user_count = 1 AND v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'platform_admin'
    WHERE id = v_user_id
      AND (role IS NULL OR role = 'listener');
  ELSE
    RAISE NOTICE 'platform_admin_role_skipped: expected exactly one user for platform owner email, found %', v_user_count;
  END IF;
END;
$$;

-- Prevent authenticated clients from self-assigning profiles.role.
CREATE OR REPLACE FUNCTION public.protect_profiles_role_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  v_jwt_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_sub IS NOT NULL AND NEW.role IS DISTINCT FROM 'listener' THEN
      NEW.role := 'listener';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF v_jwt_sub IS NOT NULL THEN
      NEW.role := OLD.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_role_on_insert ON public.profiles;
CREATE TRIGGER profiles_protect_role_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_role_column();

DROP TRIGGER IF EXISTS profiles_protect_role_on_update ON public.profiles;
CREATE TRIGGER profiles_protect_role_on_update
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_role_column();

COMMENT ON FUNCTION public.protect_profiles_role_column() IS
  'Blocks profiles.role changes from authenticated JWT sessions; migrations/service SQL without JWT may assign roles.';

-- ---------------------------------------------------------------------------
-- RPC: bulk-add published catalog practices to an editorial playlist
-- ---------------------------------------------------------------------------

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
  v_user_id uuid := auth.uid();
  v_playlist public.playlists%ROWTYPE;
  v_ids uuid[];
  v_practice_id uuid;
  v_practice public.practices%ROWTYPE;
  v_items_count integer;
  v_next_pos integer;
  v_has_item boolean;
  v_added integer := 0;
  v_skipped integer := 0;
  v_audio_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_platform_admin(v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
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

  IF EXISTS (
    SELECT 1
    FROM unnest(p_practice_ids) AS x(id)
    GROUP BY x.id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_practice_ids'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(x.id ORDER BY x.ord), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(p_practice_ids) WITH ORDINALITY AS x(id, ord);

  SELECT pl.*
  INTO v_playlist
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_playlist.is_editorial IS NOT TRUE OR v_playlist.visibility IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'not_editorial_playlist'
      USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_practice_id IN ARRAY v_ids
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.playlist_items AS pi
      WHERE pi.playlist_id = v_playlist.id
        AND pi.practice_id = v_practice_id
    )
    INTO v_has_item;

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

    INSERT INTO public.playlist_items (playlist_id, practice_id, position)
    VALUES (v_playlist.id, v_practice_id, v_next_pos);

    v_added := v_added + 1;
  END LOOP;

  IF v_added > 0 THEN
    UPDATE public.playlists
    SET updated_at = clock_timestamp()
    WHERE id = v_playlist.id;
  END IF;

  RETURN jsonb_build_object(
    'playlist_id', v_playlist.id,
    'added', v_added,
    'skipped', v_skipped,
    'practice_ids', to_jsonb(v_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[]) IS
  'Platform admin only: append published catalog practices to an editorial public playlist; no entitlement grant; max 100 items; skips duplicates.';

DO $$
BEGIN
  IF to_regprocedure('public.add_editorial_playlist_practices(uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: add_editorial_playlist_practices was not created';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.add_editorial_playlist_practices(uuid,uuid[])',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must have EXECUTE on add_editorial_playlist_practices';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.add_editorial_playlist_practices(uuid,uuid[])',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not have EXECUTE on add_editorial_playlist_practices';
  END IF;
END;
$$;

COMMIT;
