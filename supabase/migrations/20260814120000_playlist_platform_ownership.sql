BEGIN;

-- =============================================================================
-- Stage 1: platform ownership for editorial playlists
-- Additive. Does not DROP playlists / playlist_items. Do not apply to production
-- until review. Idempotent (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).
--
-- BEFORE (current main):
--   playlists.user_id uuid NOT NULL
--   playlists_editorial_requires_public_check:
--     is_editorial IS NOT TRUE OR visibility = 'public'
--   playlists_visibility_slug_consistency_check:
--     private → slug IS NULL; public → slug required
--   playlists_visibility_published_at_consistency_check:
--     private → published_at IS NULL
--   Public SELECT: visibility = 'public' (published_at not required)
--   playlist_items write: parent.user_id = auth.uid()
--   add_editorial_playlist_practices: is_platform_admin() + editorial+public
--   move_playlist_item / replace_playlist_cover_path: user_id = auth.uid()
--
-- AFTER:
--   owner_type text NOT NULL 'user'|'platform'
--   user: user_id NOT NULL, is_editorial IS NOT TRUE
--   platform: is_editorial TRUE, user_id IS NULL, created_by = actor (nullable later)
--   Editorial draft: platform + private + published_at NULL + slug allowed
--   Editorial published: platform + public + published_at + slug
--   first_published_at set once on first publish; never cleared on unpublish
--   Editorial slug locked when first_published_at IS NOT NULL
--   User private still requires slug NULL
--   Public SELECT: visibility = 'public' AND published_at IS NOT NULL
--   playlist_items follow parent edit/read authority (not user_id alone)
--   Authority: playlists.manage OR collaborator; create uses playlists.create_editorial
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS owner_type text;

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS first_published_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'playlists_created_by_fkey'
      AND conrelid = 'public.playlists'::regclass
  ) THEN
    ALTER TABLE public.playlists
      ADD CONSTRAINT playlists_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES auth.users (id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

ALTER TABLE public.playlists
  ALTER COLUMN user_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill
--   non-editorial → owner_type=user, keep user_id
--   is_editorial  → owner_type=platform, created_by=old user_id, user_id=NULL
-- ---------------------------------------------------------------------------

UPDATE public.playlists
SET
  created_by = COALESCE(created_by, user_id),
  owner_type = 'platform',
  user_id = NULL
WHERE is_editorial IS TRUE
  AND (
    owner_type IS DISTINCT FROM 'platform'
    OR user_id IS NOT NULL
  );

UPDATE public.playlists
SET owner_type = 'user'
WHERE is_editorial IS NOT TRUE
  AND owner_type IS DISTINCT FROM 'user';

-- Public rows with NULL published_at would disappear from the tightened
-- public SELECT. Stamp created_at so existing public URLs stay readable.
UPDATE public.playlists
SET published_at = COALESCE(published_at, created_at)
WHERE visibility = 'public'
  AND published_at IS NULL;

UPDATE public.playlists
SET first_published_at = published_at
WHERE published_at IS NOT NULL
  AND first_published_at IS NULL;

ALTER TABLE public.playlists
  ALTER COLUMN owner_type SET DEFAULT 'user';

ALTER TABLE public.playlists
  ALTER COLUMN owner_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS playlists_owner_type_idx
  ON public.playlists (owner_type);

CREATE INDEX IF NOT EXISTS playlists_created_by_idx
  ON public.playlists (created_by);

COMMENT ON COLUMN public.playlists.owner_type IS
  'user: personal playlist (user_id NOT NULL, not editorial). platform: AudioLad editorial asset (user_id NULL, is_editorial).';

COMMENT ON COLUMN public.playlists.created_by IS
  'Actor who created the row. Not ownership. ON DELETE SET NULL.';

COMMENT ON COLUMN public.playlists.description IS
  'Optional playlist description. Max 1000 characters. NULL allowed.';

COMMENT ON COLUMN public.playlists.user_id IS
  'Personal owner for owner_type=user. NULL for platform editorial playlists.';

COMMENT ON COLUMN public.playlists.is_editorial IS
  'True iff owner_type=platform. Curated AudioLad playlist. Draft may be private.';

COMMENT ON COLUMN public.playlists.first_published_at IS
  'Set once on first publish. Never cleared on unpublish. Locks editorial slug after first publication.';

-- ---------------------------------------------------------------------------
-- 3. Constraints (drop old, add relaxed/new)
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_editorial_requires_public_check;

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_visibility_slug_consistency_check;

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_owner_type_check;

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_owner_identity_check;

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_description_length_check;

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_platform_public_requires_published_at_check;

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_owner_type_check
  CHECK (owner_type IN ('user', 'platform'));

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_owner_identity_check
  CHECK (
    (
      owner_type = 'user'
      AND user_id IS NOT NULL
      AND is_editorial IS NOT TRUE
    )
    OR (
      owner_type = 'platform'
      AND user_id IS NULL
      AND is_editorial IS TRUE
    )
  );

-- User private: slug NULL. User public: slug required.
-- Platform private (draft): slug NULL or non-blank. Platform public: slug required.
ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_visibility_slug_consistency_check
  CHECK (
    (
      owner_type = 'user'
      AND (
        (visibility = 'private' AND slug IS NULL)
        OR (
          visibility = 'public'
          AND slug IS NOT NULL
          AND btrim(slug) <> ''
        )
      )
    )
    OR (
      owner_type = 'platform'
      AND (
        (
          visibility = 'private'
          AND (slug IS NULL OR btrim(slug) <> '')
        )
        OR (
          visibility = 'public'
          AND slug IS NOT NULL
          AND btrim(slug) <> ''
        )
      )
    )
  );

-- Editorial may be draft (platform + private + unpublished) or published public.
ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_editorial_requires_public_check
  CHECK (
    is_editorial IS NOT TRUE
    OR visibility = 'public'
    OR (
      owner_type = 'platform'
      AND visibility = 'private'
      AND published_at IS NULL
    )
  );

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_platform_public_requires_published_at_check
  CHECK (
    owner_type = 'user'
    OR visibility = 'private'
    OR published_at IS NOT NULL
  );

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_description_length_check
  CHECK (
    description IS NULL
    OR char_length(description) <= 1000
  );

-- ---------------------------------------------------------------------------
-- 4. playlist_collaborators
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.playlist_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL
    REFERENCES public.playlists (id)
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
  CONSTRAINT playlist_collaborators_role_check
    CHECK (role IN ('editor', 'manager')),
  CONSTRAINT playlist_collaborators_playlist_user_unique
    UNIQUE (playlist_id, user_id)
);

CREATE INDEX IF NOT EXISTS playlist_collaborators_user_id_idx
  ON public.playlist_collaborators (user_id);

CREATE INDEX IF NOT EXISTS playlist_collaborators_playlist_id_idx
  ON public.playlist_collaborators (playlist_id);

COMMENT ON TABLE public.playlist_collaborators IS
  'Scoped editors/managers on platform playlists only. Not used for user playlists.';

-- ---------------------------------------------------------------------------
-- 5. playlist_audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.playlist_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL
    REFERENCES public.playlists (id)
    ON DELETE CASCADE,
  actor_user_id uuid
    REFERENCES auth.users (id)
    ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playlist_audit_log_action_check
    CHECK (
      action IN (
        'playlist_created',
        'item_added',
        'item_removed',
        'item_replaced',
        'item_moved',
        'metadata_updated',
        'published',
        'unpublished',
        'collaborator_added',
        'collaborator_removed',
        'collaborator_role_changed'
      )
    )
);

CREATE INDEX IF NOT EXISTS playlist_audit_log_playlist_created_idx
  ON public.playlist_audit_log (playlist_id, created_at DESC);

COMMENT ON TABLE public.playlist_audit_log IS
  'Real mutation log for playlist APIs/RPCs. No history UI in stage 1.';

-- ---------------------------------------------------------------------------
-- 6. Helper functions (SECURITY DEFINER — used by RLS, must not recurse)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_playlist_collaborator(
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
    FROM public.playlist_collaborators AS c
    WHERE c.playlist_id = p_playlist_id
      AND c.user_id = p_user_id
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
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_user_delete_playlist(
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
          AND public.has_platform_permission(p_user_id, 'playlists.manage')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.log_playlist_audit(
  p_playlist_id uuid,
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
  IF p_playlist_id IS NULL OR p_action IS NULL OR btrim(p_action) = '' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL
    AND NOT public.can_user_edit_playlist(p_playlist_id, auth.uid())
    AND NOT public.has_platform_permission(auth.uid(), 'playlists.manage')
    AND NOT EXISTS (
      SELECT 1
      FROM public.playlists AS p
      WHERE p.id = p_playlist_id
        AND p.created_by = auth.uid()
    ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.playlist_audit_log (
    playlist_id,
    actor_user_id,
    action,
    details
  )
  VALUES (
    p_playlist_id,
    p_actor_user_id,
    p_action,
    COALESCE(p_details, '{}'::jsonb)
  );
END;
$$;

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
    'manager',
    v_user_id
  )
  ON CONFLICT (playlist_id, user_id) DO NOTHING;

  IF FOUND THEN
    PERFORM public.log_playlist_audit(
      v_playlist.id,
      'collaborator_added',
      jsonb_build_object('user_id', v_user_id, 'role', 'manager', 'via', 'create')
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_playlist_collaborator(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_playlist_collaborator(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_user_edit_playlist(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_edit_playlist(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_user_delete_playlist(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_delete_playlist(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_playlist_audit(uuid, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_playlist_audit(uuid, text, jsonb, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.attach_playlist_creator_as_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_playlist_creator_as_manager(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.attach_playlist_creator_as_manager(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rollback_unpublished_editorial_create(
  p_playlist_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
    AND pl.owner_type = 'platform'
    AND pl.created_by = v_user_id
    AND pl.published_at IS NULL
    AND pl.first_published_at IS NULL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'playlist_not_found'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_unpublished_editorial_create(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_unpublished_editorial_create(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rollback_unpublished_editorial_create(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.rollback_unpublished_editorial_create(uuid) IS
  'Deletes a never-published platform draft created by auth.uid(). Used when manager attach fails on create.';

-- ---------------------------------------------------------------------------
-- 7. Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_playlist_ownership_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  v_jwt_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

  IF TG_OP = 'UPDATE' THEN
    IF NEW.owner_type IS DISTINCT FROM OLD.owner_type
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.is_editorial IS DISTINCT FROM OLD.is_editorial THEN
      RAISE EXCEPTION 'playlist_ownership_immutable'
        USING ERRCODE = '42501';
    END IF;

    -- created_by may become NULL via ON DELETE SET NULL (no JWT).
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
      AND v_jwt_sub IS NOT NULL THEN
      RAISE EXCEPTION 'playlist_ownership_immutable'
        USING ERRCODE = '42501';
    END IF;

    -- first_published_at: JWT may stamp NULL → value on first publish.
    -- Once set, JWT cannot clear or change it. Service without JWT may
    -- set it once (NULL → value) but cannot change or clear afterwards.
    IF OLD.first_published_at IS NOT NULL
      AND NEW.first_published_at IS DISTINCT FROM OLD.first_published_at THEN
      IF v_jwt_sub IS NOT NULL THEN
        RAISE EXCEPTION 'playlist_ownership_immutable'
          USING ERRCODE = '42501';
      END IF;

      NEW.first_published_at := OLD.first_published_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playlists_protect_ownership ON public.playlists;
CREATE TRIGGER playlists_protect_ownership
  BEFORE UPDATE OF owner_type, user_id, is_editorial, created_by, first_published_at
  ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_playlist_ownership_columns();

CREATE OR REPLACE FUNCTION public.stamp_playlist_first_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.first_published_at IS NULL
    AND (
      NEW.published_at IS NOT NULL
      OR NEW.visibility = 'public'
    ) THEN
    NEW.first_published_at := COALESCE(NEW.published_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playlists_stamp_first_published_at ON public.playlists;
CREATE TRIGGER playlists_stamp_first_published_at
  BEFORE INSERT OR UPDATE OF visibility, published_at, first_published_at
  ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_playlist_first_published_at();

CREATE OR REPLACE FUNCTION public.prevent_published_editorial_slug_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.owner_type = 'platform'
    AND OLD.first_published_at IS NOT NULL
    AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'editorial_slug_locked'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playlists_lock_published_editorial_slug ON public.playlists;
CREATE TRIGGER playlists_lock_published_editorial_slug
  BEFORE UPDATE OF slug
  ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_published_editorial_slug_change();

CREATE OR REPLACE FUNCTION public.playlist_collaborators_platform_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.playlists AS p
    WHERE p.id = NEW.playlist_id
      AND p.owner_type = 'platform'
  ) THEN
    RAISE EXCEPTION 'collaborators_platform_only'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playlist_collaborators_require_platform
  ON public.playlist_collaborators;
CREATE TRIGGER playlist_collaborators_require_platform
  BEFORE INSERT OR UPDATE OF playlist_id
  ON public.playlist_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.playlist_collaborators_platform_only();

-- ---------------------------------------------------------------------------
-- 8. RLS — playlists
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can select public playlists" ON public.playlists;
CREATE POLICY "Anyone can select public playlists"
  ON public.playlists
  FOR SELECT
  TO anon, authenticated
  USING (
    visibility = 'public'
    AND published_at IS NOT NULL
  );

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
    AND public.has_platform_permission(auth.uid(), 'playlists.create_editorial')
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

-- Owner policies from PR1 stay: user_id = auth.uid() for personal playlists.

-- ---------------------------------------------------------------------------
-- 9. RLS — playlist_items
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can select public playlist items"
  ON public.playlist_items;
CREATE POLICY "Anyone can select public playlist items"
  ON public.playlist_items
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.playlists AS p
      WHERE p.id = playlist_items.playlist_id
        AND p.visibility = 'public'
        AND p.published_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Platform editors can select platform playlist items"
  ON public.playlist_items;
CREATE POLICY "Platform editors can select platform playlist items"
  ON public.playlist_items
  FOR SELECT
  TO authenticated
  USING (public.can_user_edit_playlist(playlist_id, auth.uid()));

DROP POLICY IF EXISTS "Platform editors can insert platform playlist items"
  ON public.playlist_items;
CREATE POLICY "Platform editors can insert platform playlist items"
  ON public.playlist_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_user_edit_playlist(playlist_id, auth.uid()));

DROP POLICY IF EXISTS "Platform editors can update platform playlist items"
  ON public.playlist_items;
CREATE POLICY "Platform editors can update platform playlist items"
  ON public.playlist_items
  FOR UPDATE
  TO authenticated
  USING (public.can_user_edit_playlist(playlist_id, auth.uid()))
  WITH CHECK (public.can_user_edit_playlist(playlist_id, auth.uid()));

DROP POLICY IF EXISTS "Platform editors can delete platform playlist items"
  ON public.playlist_items;
CREATE POLICY "Platform editors can delete platform playlist items"
  ON public.playlist_items
  FOR DELETE
  TO authenticated
  USING (public.can_user_edit_playlist(playlist_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 10. RLS — collaborators + audit
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlist_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.playlist_collaborators FROM PUBLIC;
REVOKE ALL ON TABLE public.playlist_audit_log FROM PUBLIC;

GRANT SELECT ON TABLE public.playlist_collaborators TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.playlist_collaborators TO authenticated;
GRANT ALL ON TABLE public.playlist_collaborators TO service_role;

GRANT SELECT ON TABLE public.playlist_audit_log TO authenticated;
GRANT ALL ON TABLE public.playlist_audit_log TO service_role;

DROP POLICY IF EXISTS playlist_collaborators_select ON public.playlist_collaborators;
CREATE POLICY playlist_collaborators_select
  ON public.playlist_collaborators
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_permission(auth.uid(), 'playlists.manage')
    OR user_id = auth.uid()
    OR public.is_playlist_collaborator(playlist_id, auth.uid())
  );

DROP POLICY IF EXISTS playlist_collaborators_insert ON public.playlist_collaborators;
CREATE POLICY playlist_collaborators_insert
  ON public.playlist_collaborators
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_platform_permission(auth.uid(), 'playlists.manage')
  );

DROP POLICY IF EXISTS playlist_collaborators_update ON public.playlist_collaborators;
CREATE POLICY playlist_collaborators_update
  ON public.playlist_collaborators
  FOR UPDATE
  TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'playlists.manage'))
  WITH CHECK (public.has_platform_permission(auth.uid(), 'playlists.manage'));

DROP POLICY IF EXISTS playlist_collaborators_delete ON public.playlist_collaborators;
CREATE POLICY playlist_collaborators_delete
  ON public.playlist_collaborators
  FOR DELETE
  TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'playlists.manage'));

DROP POLICY IF EXISTS playlist_audit_log_select ON public.playlist_audit_log;
CREATE POLICY playlist_audit_log_select
  ON public.playlist_audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_permission(auth.uid(), 'playlists.manage')
    OR public.is_playlist_collaborator(playlist_id, auth.uid())
  );

-- Inserts go through log_playlist_audit (SECURITY DEFINER). No client INSERT.

-- ---------------------------------------------------------------------------
-- 11. RBAC seed
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.platform_permissions') IS NULL THEN
    RAISE NOTICE 'platform_permissions missing — skip playlist permission seed';
    RETURN;
  END IF;

  INSERT INTO public.platform_permissions (code, description)
  VALUES
    (
      'playlists.manage',
      'Manage all platform editorial playlists, collaborators, and delete platform assets'
    ),
    (
      'playlists.create_editorial',
      'Create platform editorial playlists (starts as draft)'
    )
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO public.platform_role_permissions (role_code, permission_code)
  VALUES
    ('owner', 'playlists.manage'),
    ('owner', 'playlists.create_editorial'),
    ('admin', 'playlists.manage'),
    ('admin', 'playlists.create_editorial'),
    ('editor', 'playlists.create_editorial')
  ON CONFLICT DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.platform_role_permissions
    WHERE permission_code = 'playlists.manage'
      AND role_code NOT IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'playlists.manage must be owner/admin only';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. RPC: add_editorial_playlist_practices — new authority, drafts allowed
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
  v_added_ids uuid[] := ARRAY[]::uuid[];
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

  IF NOT public.can_user_edit_playlist(v_playlist.id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_playlist.is_editorial IS NOT TRUE
    OR v_playlist.owner_type IS DISTINCT FROM 'platform' THEN
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
        'added', v_added,
        'skipped', v_skipped
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'playlist_id', v_playlist.id,
    'added', v_added,
    'skipped', v_skipped,
    'practice_ids', to_jsonb(v_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.add_editorial_playlist_practices(uuid, uuid[]) IS
  'playlists.manage or collaborator: append published catalog practices to a platform editorial playlist (draft or published); no entitlement grant; max 100 items; skips duplicates.';

-- ---------------------------------------------------------------------------
-- 13. RPC: move_playlist_item — user owner OR platform editor
-- ---------------------------------------------------------------------------

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

COMMENT ON FUNCTION public.move_playlist_item(uuid, uuid, text) IS
  'Atomic swap of playlist_items.position with neighbour (up/down). User owner or platform editor (manage/collaborator).';

-- ---------------------------------------------------------------------------
-- 14. RPC: membership stays user-playlist only
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

  IF EXISTS (
    SELECT 1
    FROM unnest(p_playlist_ids) AS x(id)
    GROUP BY x.id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_playlist_ids'
      USING ERRCODE = '22023';
  END IF;

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

  -- User-playlist only: reject platform / editorial targets.
  IF cardinality(v_ids) > 0 THEN
    SELECT count(*)
    INTO v_owned_count
    FROM public.playlists AS pl
    WHERE pl.user_id = v_user_id
      AND pl.owner_type = 'user'
      AND pl.is_editorial IS NOT TRUE
      AND pl.id = ANY (v_ids);

    IF v_owned_count <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'playlist_not_found'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

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

  v_can_public :=
    v_practice.status = 'published'
    AND v_practice.is_catalog_listed IS TRUE
    AND v_practice.is_free IS TRUE
    AND (v_practice.price IS NULL OR v_practice.price <= 0);

  PERFORM 1
  FROM public.playlists AS pl
  WHERE pl.user_id = v_user_id
    AND pl.owner_type = 'user'
    AND pl.is_editorial IS NOT TRUE
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

  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT pl.*
    INTO v_playlist
    FROM public.playlists AS pl
    WHERE pl.id = v_id
      AND pl.user_id = v_user_id
      AND pl.owner_type = 'user'
      AND pl.is_editorial IS NOT TRUE;

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

  FOR v_playlist IN
    SELECT pl.*
    FROM public.playlists AS pl
    JOIN public.playlist_items AS pi
      ON pi.playlist_id = pl.id
    WHERE pl.user_id = v_user_id
      AND pl.owner_type = 'user'
      AND pl.is_editorial IS NOT TRUE
      AND pi.practice_id = p_practice_id
      AND NOT (pl.id = ANY (v_ids))
    ORDER BY pl.id
  LOOP
    DELETE FROM public.playlist_items
    WHERE playlist_id = v_playlist.id
      AND practice_id = p_practice_id;

    IF FOUND THEN
      UPDATE public.playlists
      SET updated_at = clock_timestamp()
      WHERE id = v_playlist.id;

      v_removed := v_removed + 1;
      v_touched := array_append(v_touched, v_playlist.id);
    END IF;
  END LOOP;

  FOREACH v_id IN ARRAY v_to_add
  LOOP
    SELECT pl.*
    INTO v_playlist
    FROM public.playlists AS pl
    WHERE pl.id = v_id
      AND pl.user_id = v_user_id
      AND pl.owner_type = 'user'
      AND pl.is_editorial IS NOT TRUE
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

COMMENT ON FUNCTION public.set_practice_playlist_membership(uuid, uuid[]) IS
  'audiolad:playlist-membership:v1; user-owned playlists only (owner_type=user); never platform/editorial; auth.uid(); never grants entitlement.';

-- ---------------------------------------------------------------------------
-- 15. RPC: replace_playlist_cover_path — edit authority, not user_id alone
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_playlist_cover_path(
  p_playlist_id uuid,
  p_expected_old_path text,
  p_new_path text
)
RETURNS TABLE (
  status text,
  previous_path text,
  cover_path text,
  cover_updated_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.playlists%ROWTYPE;
  v_expected text;
  v_new text;
  v_now timestamptz := clock_timestamp();
  v_uuid_re constant text :=
    '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  v_legacy_path_re constant text :=
    '^' || v_uuid_re || '/' || v_uuid_re || '/' || v_uuid_re || '\.webp$';
  v_variant_path_re constant text :=
    '^' || v_uuid_re || '/' || v_uuid_re || '/variants/' || v_uuid_re
    || '/(sm|md|lg|xl|placeholder)\.webp$';
BEGIN
  IF v_user_id IS NULL THEN
    status := 'unauthorized';
    previous_path := NULL;
    cover_path := NULL;
    cover_updated_at := NULL;
    updated_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_playlist_id IS NULL THEN
    status := 'not_found';
    previous_path := NULL;
    cover_path := NULL;
    cover_updated_at := NULL;
    updated_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_expected := NULLIF(btrim(COALESCE(p_expected_old_path, '')), '');
  v_new := NULLIF(btrim(COALESCE(p_new_path, '')), '');

  SELECT *
  INTO v_row
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_user_edit_playlist(p_playlist_id, v_user_id) THEN
    status := 'not_found';
    previous_path := NULL;
    cover_path := NULL;
    cover_updated_at := NULL;
    updated_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_new IS NOT NULL THEN
    IF NOT (v_new ~* v_legacy_path_re OR v_new ~* v_variant_path_re) THEN
      RAISE EXCEPTION 'invalid_cover_path' USING ERRCODE = '22023';
    END IF;

    IF split_part(v_new, '/', 1) IS DISTINCT FROM v_user_id::text
       OR split_part(v_new, '/', 2) IS DISTINCT FROM p_playlist_id::text THEN
      RAISE EXCEPTION 'invalid_cover_path_owner' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_expected IS NOT NULL
     AND NOT (v_expected ~* v_legacy_path_re OR v_expected ~* v_variant_path_re) THEN
    RAISE EXCEPTION 'invalid_expected_cover_path' USING ERRCODE = '22023';
  END IF;

  IF v_row.cover_path IS DISTINCT FROM v_expected THEN
    status := 'conflict';
    previous_path := v_row.cover_path;
    cover_path := v_row.cover_path;
    cover_updated_at := v_row.cover_updated_at;
    updated_at := v_row.updated_at;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.cover_path IS NOT DISTINCT FROM v_new THEN
    status := 'ok';
    previous_path := v_row.cover_path;
    cover_path := v_row.cover_path;
    cover_updated_at := v_row.cover_updated_at;
    updated_at := v_row.updated_at;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.playlists AS pl
  SET
    cover_path = v_new,
    cover_updated_at = CASE WHEN v_new IS NULL THEN NULL ELSE v_now END,
    updated_at = v_now
  WHERE pl.id = p_playlist_id
  RETURNING * INTO v_row;

  status := 'ok';
  previous_path := v_expected;
  cover_path := v_row.cover_path;
  cover_updated_at := v_row.cover_updated_at;
  updated_at := v_row.updated_at;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.replace_playlist_cover_path(uuid, text, text) IS
  'Cover path CAS for user owner or platform editor; path prefix remains auth.uid(); p_new_path NULL clears custom cover.';

-- ---------------------------------------------------------------------------
-- 16. Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'playlists'
      AND column_name = 'owner_type'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: playlists.owner_type missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'playlists'
      AND column_name = 'first_published_at'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: playlists.first_published_at missing';
  END IF;

  IF to_regclass('public.playlist_collaborators') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: playlist_collaborators missing';
  END IF;

  IF to_regclass('public.playlist_audit_log') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: playlist_audit_log missing';
  END IF;

  IF to_regprocedure('public.can_user_edit_playlist(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: can_user_edit_playlist missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.playlists
    WHERE is_editorial IS TRUE
      AND (owner_type IS DISTINCT FROM 'platform' OR user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Post-check failed: editorial rows must be platform with user_id NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.playlists
    WHERE is_editorial IS NOT TRUE
      AND (owner_type IS DISTINCT FROM 'user' OR user_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Post-check failed: user rows must be owner_type=user with user_id';
  END IF;
END;
$$;

COMMIT;
