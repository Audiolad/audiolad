BEGIN;

-- =============================================================================
-- Stage 2.1: editorial directions + playlist_admin
-- Additive. Does not DROP playlists / playlist_items / Stage 1 user policies.
-- Does not seed production directions or user UUIDs.
-- Do not apply to production until review.
--
-- AFTER:
--   editorial_directions / editorial_direction_members
--   playlists.direction_id nullable (legacy editorial + all user playlists stay NULL)
--   playlist_collaborators.role = playlist_admin only (editor|manager backfilled)
--   Direction editor has operational admin via membership, not playlists.manage
--   Platform hard-delete remains playlists.manage only (no editorial UI button)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. editorial_directions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.editorial_directions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editorial_directions_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT editorial_directions_slug_format_check
    CHECK (
      char_length(slug) BETWEEN 3 AND 64
      AND slug = lower(slug)
      AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  CONSTRAINT editorial_directions_slug_key UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS editorial_directions_slug_idx
  ON public.editorial_directions (slug);

COMMENT ON TABLE public.editorial_directions IS
  'First-class editorial directions. Not seeded in migration; created via editorial API/UI.';

-- ---------------------------------------------------------------------------
-- 2. editorial_direction_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.editorial_direction_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id uuid NOT NULL
    REFERENCES public.editorial_directions (id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,
  role text NOT NULL,
  added_by uuid
    REFERENCES auth.users (id)
    ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editorial_direction_members_role_check
    CHECK (role = 'direction_editor'),
  CONSTRAINT editorial_direction_members_direction_user_unique
    UNIQUE (direction_id, user_id)
);

CREATE INDEX IF NOT EXISTS editorial_direction_members_user_id_idx
  ON public.editorial_direction_members (user_id);

CREATE INDEX IF NOT EXISTS editorial_direction_members_direction_id_idx
  ON public.editorial_direction_members (direction_id);

COMMENT ON TABLE public.editorial_direction_members IS
  'Direction-scoped editors. Stage 2.1 role is direction_editor only. Not playlist ownership.';

-- ---------------------------------------------------------------------------
-- 3. editorial_direction_audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.editorial_direction_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id uuid NOT NULL
    REFERENCES public.editorial_directions (id)
    ON DELETE CASCADE,
  actor_user_id uuid
    REFERENCES auth.users (id)
    ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editorial_direction_audit_log_action_check
    CHECK (
      action IN (
        'direction_created',
        'direction_updated',
        'direction_editor_added',
        'direction_editor_removed'
      )
    )
);

CREATE INDEX IF NOT EXISTS editorial_direction_audit_log_direction_created_idx
  ON public.editorial_direction_audit_log (direction_id, created_at DESC);

COMMENT ON TABLE public.editorial_direction_audit_log IS
  'Direction-scoped audit. Separate from playlist_audit_log because that table requires playlist_id.';

-- ---------------------------------------------------------------------------
-- 4. playlists.direction_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS direction_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'playlists_direction_id_fkey'
      AND conrelid = 'public.playlists'::regclass
  ) THEN
    ALTER TABLE public.playlists
      ADD CONSTRAINT playlists_direction_id_fkey
      FOREIGN KEY (direction_id)
      REFERENCES public.editorial_directions (id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_user_direction_null_check;

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_user_direction_null_check
  CHECK (
    owner_type = 'platform'
    OR direction_id IS NULL
  );

CREATE INDEX IF NOT EXISTS playlists_direction_id_idx
  ON public.playlists (direction_id)
  WHERE direction_id IS NOT NULL;

COMMENT ON COLUMN public.playlists.direction_id IS
  'Editorial direction for new platform playlists. NULL for user playlists and legacy editorial rows.';

-- ---------------------------------------------------------------------------
-- 5. playlist_collaborators.role → playlist_admin
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlist_collaborators
  DROP CONSTRAINT IF EXISTS playlist_collaborators_role_check;

UPDATE public.playlist_collaborators
SET
  role = 'playlist_admin',
  updated_at = now()
WHERE role IN ('editor', 'manager');

ALTER TABLE public.playlist_collaborators
  ADD CONSTRAINT playlist_collaborators_role_check
  CHECK (role = 'playlist_admin');

COMMENT ON TABLE public.playlist_collaborators IS
  'Playlist-scoped playlist_admin on platform playlists only. Direction editors are not stored here.';

COMMENT ON COLUMN public.playlist_collaborators.role IS
  'Stage 2.1: playlist_admin only. editor|manager rows were backfilled.';

-- ---------------------------------------------------------------------------
-- 6. Helpers (SECURITY DEFINER — used by RLS, must not recurse)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_direction_editor(
  p_direction_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_direction_id IS NOT NULL
    AND p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.editorial_direction_members AS m
      WHERE m.direction_id = p_direction_id
        AND m.user_id = p_user_id
        AND m.role = 'direction_editor'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_any_direction_editor(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.editorial_direction_members AS m
      WHERE m.user_id = p_user_id
        AND m.role = 'direction_editor'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_user_select_editorial_direction(
  p_direction_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_direction_id IS NOT NULL
    AND p_user_id IS NOT NULL
    AND (
      public.has_platform_permission(p_user_id, 'playlists.manage')
      OR public.is_direction_editor(p_direction_id, p_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.playlists AS p
        JOIN public.playlist_collaborators AS c
          ON c.playlist_id = p.id
        WHERE p.direction_id = p_direction_id
          AND c.user_id = p_user_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_user_edit_playlist(
  p_playlist_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.playlists AS p
    WHERE p.id = p_playlist_id
      AND (
        (p.owner_type = 'user' AND p.user_id = p_user_id)
        OR (
          p.owner_type = 'platform'
          AND (
            public.has_platform_permission(p_user_id, 'playlists.manage')
            OR public.is_playlist_collaborator(p.id, p_user_id)
            OR public.is_direction_editor(p.direction_id, p_user_id)
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_user_manage_playlist_collaborators(
  p_playlist_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.playlists AS p
    WHERE p.id = p_playlist_id
      AND p.owner_type = 'platform'
      AND (
        public.has_platform_permission(p_user_id, 'playlists.manage')
        OR public.is_direction_editor(p.direction_id, p_user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.log_editorial_direction_audit(
  p_direction_id uuid,
  p_action text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_direction_id IS NULL OR p_action IS NULL OR btrim(p_action) = '' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL
    AND NOT public.has_platform_permission(auth.uid(), 'playlists.manage') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.editorial_direction_audit_log (
    direction_id,
    actor_user_id,
    action,
    details
  )
  VALUES (
    p_direction_id,
    p_actor_user_id,
    p_action,
    COALESCE(p_details, '{}'::jsonb)
  );
END;
$$;

-- Keep attach helper callable, but do not auto-attach direction editors.
-- If anything still calls it, write playlist_admin (not the retired manager role).
CREATE OR REPLACE FUNCTION public.attach_playlist_creator_as_manager(
  p_playlist_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_playlist public.playlists%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_playlist
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_playlist.owner_type IS DISTINCT FROM 'platform'
    OR v_playlist.created_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.playlist_collaborators (
    playlist_id,
    user_id,
    role,
    added_by
  )
  VALUES (
    v_playlist.id,
    v_user_id,
    'playlist_admin',
    v_user_id
  )
  ON CONFLICT (playlist_id, user_id) DO NOTHING;

  IF FOUND THEN
    PERFORM public.log_playlist_audit(
      v_playlist.id,
      'collaborator_added',
      jsonb_build_object(
        'user_id', v_user_id,
        'role', 'playlist_admin',
        'via', 'create'
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_direction_editor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_direction_editor(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_any_direction_editor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_any_direction_editor(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_user_select_editorial_direction(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_select_editorial_direction(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_user_edit_playlist(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_edit_playlist(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_user_manage_playlist_collaborators(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_manage_playlist_collaborators(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_editorial_direction_audit(uuid, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_editorial_direction_audit(uuid, text, jsonb, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.is_direction_editor(uuid, uuid) IS
  'True if user is direction_editor of the given direction.';

COMMENT ON FUNCTION public.can_user_edit_playlist(uuid, uuid) IS
  'User owner, playlists.manage, playlist_admin collaborator, or direction_editor of playlist.direction_id.';

COMMENT ON FUNCTION public.can_user_manage_playlist_collaborators(uuid, uuid) IS
  'playlists.manage or direction_editor of the playlist direction. Playlist admin cannot manage collaborators.';

-- ---------------------------------------------------------------------------
-- 7. Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_editorial_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS editorial_directions_set_updated_at
  ON public.editorial_directions;
CREATE TRIGGER editorial_directions_set_updated_at
  BEFORE UPDATE ON public.editorial_directions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_editorial_row_updated_at();

DROP TRIGGER IF EXISTS editorial_direction_members_set_updated_at
  ON public.editorial_direction_members;
CREATE TRIGGER editorial_direction_members_set_updated_at
  BEFORE UPDATE ON public.editorial_direction_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_editorial_row_updated_at();

CREATE OR REPLACE FUNCTION public.protect_playlist_direction_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  IF NEW.owner_type = 'user' AND NEW.direction_id IS NOT NULL THEN
    RAISE EXCEPTION 'user_playlist_direction_forbidden'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.direction_id IS DISTINCT FROM OLD.direction_id THEN
    v_jwt_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

    IF v_jwt_sub IS NOT NULL
      AND NOT public.has_platform_permission(auth.uid(), 'playlists.manage') THEN
      RAISE EXCEPTION 'playlist_direction_immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playlists_protect_direction_id ON public.playlists;
CREATE TRIGGER playlists_protect_direction_id
  BEFORE INSERT OR UPDATE OF direction_id, owner_type
  ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_playlist_direction_id();

-- ---------------------------------------------------------------------------
-- 8. RLS — playlists (extend Stage 1, do not drop user-owner policies)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Platform editors can select platform playlists"
  ON public.playlists;
CREATE POLICY "Platform editors can select platform playlists"
  ON public.playlists
  FOR SELECT
  TO authenticated
  USING (
    owner_type = 'platform'
    AND (
      public.has_platform_permission(auth.uid(), 'playlists.manage')
      OR public.is_playlist_collaborator(id, auth.uid())
      OR public.is_direction_editor(direction_id, auth.uid())
      OR (
        created_by = auth.uid()
        AND published_at IS NULL
        AND first_published_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Platform creators can insert editorial playlists"
  ON public.playlists;
CREATE POLICY "Platform creators can insert editorial playlists"
  ON public.playlists
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_type = 'platform'
    AND user_id IS NULL
    AND is_editorial IS TRUE
    AND created_by = auth.uid()
    AND direction_id IS NOT NULL
    AND (
      public.has_platform_permission(auth.uid(), 'playlists.manage')
      OR public.is_direction_editor(direction_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Platform editors can update platform playlists"
  ON public.playlists;
CREATE POLICY "Platform editors can update platform playlists"
  ON public.playlists
  FOR UPDATE
  TO authenticated
  USING (
    owner_type = 'platform'
    AND (
      public.has_platform_permission(auth.uid(), 'playlists.manage')
      OR public.is_playlist_collaborator(id, auth.uid())
      OR public.is_direction_editor(direction_id, auth.uid())
    )
  )
  WITH CHECK (
    owner_type = 'platform'
    AND user_id IS NULL
    AND is_editorial IS TRUE
  );

DROP POLICY IF EXISTS "Platform managers can delete platform playlists"
  ON public.playlists;
CREATE POLICY "Platform managers can delete platform playlists"
  ON public.playlists
  FOR DELETE
  TO authenticated
  USING (
    owner_type = 'platform'
    AND public.has_platform_permission(auth.uid(), 'playlists.manage')
  );

-- ---------------------------------------------------------------------------
-- 9. RLS — collaborators
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS playlist_collaborators_select ON public.playlist_collaborators;
CREATE POLICY playlist_collaborators_select
  ON public.playlist_collaborators
  FOR SELECT
  TO authenticated
  USING (public.can_user_edit_playlist(playlist_id, auth.uid()));

DROP POLICY IF EXISTS playlist_collaborators_insert ON public.playlist_collaborators;
CREATE POLICY playlist_collaborators_insert
  ON public.playlist_collaborators
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_user_manage_playlist_collaborators(playlist_id, auth.uid())
  );

DROP POLICY IF EXISTS playlist_collaborators_update ON public.playlist_collaborators;
CREATE POLICY playlist_collaborators_update
  ON public.playlist_collaborators
  FOR UPDATE
  TO authenticated
  USING (public.can_user_manage_playlist_collaborators(playlist_id, auth.uid()))
  WITH CHECK (
    public.can_user_manage_playlist_collaborators(playlist_id, auth.uid())
  );

DROP POLICY IF EXISTS playlist_collaborators_delete ON public.playlist_collaborators;
CREATE POLICY playlist_collaborators_delete
  ON public.playlist_collaborators
  FOR DELETE
  TO authenticated
  USING (public.can_user_manage_playlist_collaborators(playlist_id, auth.uid()));

DROP POLICY IF EXISTS playlist_audit_log_select ON public.playlist_audit_log;
CREATE POLICY playlist_audit_log_select
  ON public.playlist_audit_log
  FOR SELECT
  TO authenticated
  USING (public.can_user_edit_playlist(playlist_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 10. RLS — directions / members / direction audit
-- ---------------------------------------------------------------------------

ALTER TABLE public.editorial_directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_direction_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_direction_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.editorial_directions FROM PUBLIC;
REVOKE ALL ON TABLE public.editorial_direction_members FROM PUBLIC;
REVOKE ALL ON TABLE public.editorial_direction_audit_log FROM PUBLIC;

GRANT SELECT ON TABLE public.editorial_directions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.editorial_directions TO authenticated;
GRANT ALL ON TABLE public.editorial_directions TO service_role;

GRANT SELECT ON TABLE public.editorial_direction_members TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.editorial_direction_members TO authenticated;
GRANT ALL ON TABLE public.editorial_direction_members TO service_role;

GRANT SELECT ON TABLE public.editorial_direction_audit_log TO authenticated;
GRANT ALL ON TABLE public.editorial_direction_audit_log TO service_role;

DROP POLICY IF EXISTS editorial_directions_select ON public.editorial_directions;
CREATE POLICY editorial_directions_select
  ON public.editorial_directions
  FOR SELECT
  TO authenticated
  USING (public.can_user_select_editorial_direction(id, auth.uid()));

DROP POLICY IF EXISTS editorial_directions_insert ON public.editorial_directions;
CREATE POLICY editorial_directions_insert
  ON public.editorial_directions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_platform_permission(auth.uid(), 'playlists.manage'));

DROP POLICY IF EXISTS editorial_directions_update ON public.editorial_directions;
CREATE POLICY editorial_directions_update
  ON public.editorial_directions
  FOR UPDATE
  TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'playlists.manage'))
  WITH CHECK (public.has_platform_permission(auth.uid(), 'playlists.manage'));

DROP POLICY IF EXISTS editorial_directions_delete ON public.editorial_directions;
CREATE POLICY editorial_directions_delete
  ON public.editorial_directions
  FOR DELETE
  TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'playlists.manage'));

DROP POLICY IF EXISTS editorial_direction_members_select
  ON public.editorial_direction_members;
CREATE POLICY editorial_direction_members_select
  ON public.editorial_direction_members
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_permission(auth.uid(), 'playlists.manage')
    OR user_id = auth.uid()
    OR public.is_direction_editor(direction_id, auth.uid())
  );

DROP POLICY IF EXISTS editorial_direction_members_insert
  ON public.editorial_direction_members;
CREATE POLICY editorial_direction_members_insert
  ON public.editorial_direction_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_platform_permission(auth.uid(), 'playlists.manage'));

DROP POLICY IF EXISTS editorial_direction_members_update
  ON public.editorial_direction_members;
CREATE POLICY editorial_direction_members_update
  ON public.editorial_direction_members
  FOR UPDATE
  TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'playlists.manage'))
  WITH CHECK (public.has_platform_permission(auth.uid(), 'playlists.manage'));

DROP POLICY IF EXISTS editorial_direction_members_delete
  ON public.editorial_direction_members;
CREATE POLICY editorial_direction_members_delete
  ON public.editorial_direction_members
  FOR DELETE
  TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'playlists.manage'));

DROP POLICY IF EXISTS editorial_direction_audit_log_select
  ON public.editorial_direction_audit_log;
CREATE POLICY editorial_direction_audit_log_select
  ON public.editorial_direction_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'playlists.manage'));

-- ---------------------------------------------------------------------------
-- 11. Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.editorial_directions') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: editorial_directions missing';
  END IF;

  IF to_regclass('public.editorial_direction_members') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: editorial_direction_members missing';
  END IF;

  IF to_regclass('public.editorial_direction_audit_log') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: editorial_direction_audit_log missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'playlists'
      AND column_name = 'direction_id'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: playlists.direction_id missing';
  END IF;

  IF to_regprocedure('public.is_direction_editor(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: is_direction_editor missing';
  END IF;

  IF to_regprocedure('public.can_user_manage_playlist_collaborators(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: can_user_manage_playlist_collaborators missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.playlist_collaborators
    WHERE role IS DISTINCT FROM 'playlist_admin'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: collaborator roles must be playlist_admin';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.playlists
    WHERE owner_type = 'user'
      AND direction_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Post-check failed: user playlists must have direction_id NULL';
  END IF;
END;
$$;

COMMIT;
