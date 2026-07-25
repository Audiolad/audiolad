BEGIN;

-- ---------------------------------------------------------------------------
-- Platform team RBAC foundation
-- Roles/permissions for internal staff (separate from author_members).
-- Keeps legacy profiles.role (platform_owner / platform_admin) for compatibility.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_permissions (
  code text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_roles (
  code text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_roles_code_check CHECK (
    code IN ('owner', 'admin', 'editor', 'support', 'analyst', 'finance')
  )
);

CREATE TABLE IF NOT EXISTS public.platform_role_permissions (
  role_code text NOT NULL REFERENCES public.platform_roles (code) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.platform_permissions (code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE IF NOT EXISTS public.platform_user_roles (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role_code text NOT NULL REFERENCES public.platform_roles (code) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_code)
);

CREATE INDEX IF NOT EXISTS platform_user_roles_role_code_idx
  ON public.platform_user_roles (role_code);

COMMENT ON TABLE public.platform_permissions IS
  'Internal platform permission codes. Access decisions use permissions, not UI role labels.';
COMMENT ON TABLE public.platform_roles IS
  'Internal team roles (owner/admin/editor/support/analyst/finance). Not author_members roles.';
COMMENT ON TABLE public.platform_role_permissions IS
  'Permission bundles assigned to internal platform roles.';
COMMENT ON TABLE public.platform_user_roles IS
  'Many-to-many assignment of internal platform roles to users.';

-- Seed permissions
INSERT INTO public.platform_permissions (code, description) VALUES
  ('admin_panel.access', 'Enter the platform control panel'),
  ('dashboard.view', 'View admin overview'),
  ('authors.view', 'View author applications and author admin lists'),
  ('authors.manage', 'Review and change author applications / cross-author ops'),
  ('products.view', 'View product moderation surfaces'),
  ('products.moderate', 'Moderate editorial products and playlists'),
  ('users.view', 'View users list in admin panel'),
  ('users.manage', 'Manage users (delete and related ops)'),
  ('analytics.view', 'View platform analytics'),
  ('finance.view', 'View financial data'),
  ('payouts.manage', 'Manage payouts'),
  ('team.view', 'View team and access assignments'),
  ('team.manage', 'Manage team roles and permissions'),
  ('settings.manage', 'Manage platform settings'),
  ('audit_log.view', 'View administrative audit log')
ON CONFLICT (code) DO NOTHING;

-- Seed roles
INSERT INTO public.platform_roles (code, description) VALUES
  ('owner', 'Platform owner — full access'),
  ('admin', 'Platform administrator'),
  ('editor', 'Content editor'),
  ('support', 'Support specialist'),
  ('analyst', 'Analyst'),
  ('finance', 'Finance specialist')
ON CONFLICT (code) DO NOTHING;

-- Role → permission bundles (owner is granted all current permissions;
-- runtime also treats owner as having every future permission).
INSERT INTO public.platform_role_permissions (role_code, permission_code)
SELECT 'owner', p.code FROM public.platform_permissions AS p
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_role_permissions (role_code, permission_code) VALUES
  ('admin', 'admin_panel.access'),
  ('admin', 'dashboard.view'),
  ('admin', 'authors.view'),
  ('admin', 'authors.manage'),
  ('admin', 'products.view'),
  ('admin', 'products.moderate'),
  ('admin', 'users.view'),
  ('admin', 'users.manage'),
  ('admin', 'analytics.view'),
  ('admin', 'team.view'),
  ('admin', 'settings.manage'),
  ('admin', 'audit_log.view'),
  ('editor', 'admin_panel.access'),
  ('editor', 'dashboard.view'),
  ('editor', 'authors.view'),
  ('editor', 'products.view'),
  ('editor', 'products.moderate'),
  ('support', 'admin_panel.access'),
  ('support', 'authors.view'),
  ('support', 'users.view'),
  ('analyst', 'admin_panel.access'),
  ('analyst', 'dashboard.view'),
  ('analyst', 'analytics.view'),
  ('finance', 'admin_panel.access'),
  ('finance', 'finance.view'),
  ('finance', 'payouts.manage')
ON CONFLICT DO NOTHING;

-- Migrate legacy profiles.role → platform_user_roles without inventing owners.
DO $$
DECLARE
  v_owner_count integer;
  v_admin_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_owner_count
  FROM public.profiles
  WHERE role = 'platform_owner';

  SELECT count(*)::integer
  INTO v_admin_count
  FROM public.profiles
  WHERE role = 'platform_admin';

  RAISE NOTICE 'platform_rbac_migrate: legacy platform_owner count=%', v_owner_count;
  RAISE NOTICE 'platform_rbac_migrate: legacy platform_admin count=%', v_admin_count;

  IF v_owner_count = 0 THEN
    RAISE NOTICE 'platform_rbac_migrate: no platform_owner found; owner role not auto-assigned';
  ELSIF v_owner_count > 1 THEN
    RAISE NOTICE 'platform_rbac_migrate: multiple platform_owner rows (%); assigning owner role to all existing legacy owners', v_owner_count;
  END IF;

  INSERT INTO public.platform_user_roles (user_id, role_code)
  SELECT p.id, 'owner'
  FROM public.profiles AS p
  WHERE p.role = 'platform_owner'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.platform_user_roles (user_id, role_code)
  SELECT p.id, 'admin'
  FROM public.profiles AS p
  WHERE p.role = 'platform_admin'
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_platform_permission(
  p_user_id uuid,
  p_permission_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_legacy_role text;
BEGIN
  IF p_user_id IS NULL OR p_permission_code IS NULL OR length(trim(p_permission_code)) = 0 THEN
    RETURN false;
  END IF;

  -- Owner role grants every permission, including future ones not yet seeded.
  IF EXISTS (
    SELECT 1
    FROM public.platform_user_roles AS ur
    WHERE ur.user_id = p_user_id
      AND ur.role_code = 'owner'
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.platform_user_roles AS ur
    JOIN public.platform_role_permissions AS rp
      ON rp.role_code = ur.role_code
    WHERE ur.user_id = p_user_id
      AND rp.permission_code = p_permission_code
  ) THEN
    RETURN true;
  END IF;

  -- Temporary legacy fallback via profiles.role (centralized here only).
  SELECT pr.role
  INTO v_legacy_role
  FROM public.profiles AS pr
  WHERE pr.id = p_user_id;

  IF v_legacy_role = 'platform_owner' THEN
    RETURN true;
  END IF;

  IF v_legacy_role = 'platform_admin' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.platform_role_permissions AS rp
      WHERE rp.role_code = 'admin'
        AND rp.permission_code = p_permission_code
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.has_platform_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_platform_permission(uuid, text) IS
  'Returns true when the user has the permission via platform_user_roles, owner bypass, or temporary legacy profiles.role fallback.';

-- Staff helper: prefer permission model, keep legacy compatibility.
CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    public.has_platform_permission(p_user_id, 'admin_panel.access'),
    false
  );
$$;

COMMENT ON FUNCTION public.is_platform_staff(uuid) IS
  'True when user has admin_panel.access (RBAC or temporary legacy fallback).';

CREATE OR REPLACE FUNCTION public.is_platform_owner(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_user_roles AS ur
    WHERE ur.user_id = p_user_id
      AND ur.role_code = 'owner'
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles AS pr
    WHERE pr.id = p_user_id
      AND pr.role = 'platform_owner'
  );
$$;

COMMENT ON FUNCTION public.is_platform_owner(uuid) IS
  'True for RBAC owner role or temporary legacy profiles.role = platform_owner.';

-- RLS: users may read own role assignments; mutations via service_role / SQL only.
ALTER TABLE public.platform_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_permissions_select_authenticated ON public.platform_permissions;
CREATE POLICY platform_permissions_select_authenticated
  ON public.platform_permissions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS platform_roles_select_authenticated ON public.platform_roles;
CREATE POLICY platform_roles_select_authenticated
  ON public.platform_roles
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS platform_role_permissions_select_authenticated ON public.platform_role_permissions;
CREATE POLICY platform_role_permissions_select_authenticated
  ON public.platform_role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS platform_user_roles_select_own ON public.platform_user_roles;
CREATE POLICY platform_user_roles_select_own
  ON public.platform_user_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_platform_permission(auth.uid(), 'team.view')
  );

GRANT SELECT ON public.platform_permissions TO authenticated, service_role;
GRANT SELECT ON public.platform_roles TO authenticated, service_role;
GRANT SELECT ON public.platform_role_permissions TO authenticated, service_role;
GRANT SELECT ON public.platform_user_roles TO authenticated, service_role;
GRANT ALL ON public.platform_permissions TO service_role;
GRANT ALL ON public.platform_roles TO service_role;
GRANT ALL ON public.platform_role_permissions TO service_role;
GRANT ALL ON public.platform_user_roles TO service_role;

COMMIT;
