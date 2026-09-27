BEGIN;

-- Foundation A1: Business Domain Core
-- Organization → Location → Zone + owner/manager membership.
-- Expand-only. No Player, playback_usage_facts wiring, billing, or Business App UI.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_organizations_name_nonempty_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT business_organizations_status_check
    CHECK (status IN ('active', 'suspended', 'closed'))
);

COMMENT ON TABLE public.business_organizations IS
  'audiolad:business-domain; B2B Organization (business client). Ownership via business_organization_members.role=owner, not a column here.';

CREATE TABLE IF NOT EXISTS public.business_organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.business_organizations (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_organization_members_role_check
    CHECK (role IN ('owner', 'manager')),
  CONSTRAINT business_organization_members_org_user_unique
    UNIQUE (organization_id, user_id)
);

COMMENT ON TABLE public.business_organization_members IS
  'audiolad:business-domain; organization-level membership. A1 roles: owner, manager. Employee scope is a later layer.';

CREATE TABLE IF NOT EXISTS public.business_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.business_organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  business_category text NOT NULL,
  country_code text NOT NULL,
  timezone text NOT NULL,
  address_line1 text NULL,
  address_line2 text NULL,
  city text NULL,
  region text NULL,
  postal_code text NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_locations_name_nonempty_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT business_locations_category_nonempty_check
    CHECK (char_length(btrim(business_category)) BETWEEN 1 AND 120),
  CONSTRAINT business_locations_country_code_check
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT business_locations_timezone_nonempty_check
    CHECK (char_length(btrim(timezone)) BETWEEN 1 AND 64),
  CONSTRAINT business_locations_status_check
    CHECK (status IN ('active', 'suspended', 'closed'))
);

COMMENT ON TABLE public.business_locations IS
  'audiolad:business-domain; physical Location of an Organization. country_code and IANA timezone required from v1.';

CREATE TABLE IF NOT EXISTS public.business_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL
    REFERENCES public.business_locations (id) ON DELETE RESTRICT,
  name text NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_zones_name_length_check
    CHECK (name IS NULL OR char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT business_zones_status_check
    CHECK (status IN ('active', 'suspended', 'closed'))
);

COMMENT ON TABLE public.business_zones IS
  'audiolad:business-domain; independent sound space inside a Location. Default zone has name=NULL; UI localizes the label.';

COMMENT ON COLUMN public.business_zones.name IS
  'Optional display name. Default zone keeps NULL so UI can localize (RU: Основная зона / EN: Main zone).';

COMMENT ON COLUMN public.business_zones.is_default IS
  'At most one default zone per location (partial unique index).';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS business_organization_members_user_org_idx
  ON public.business_organization_members (user_id, organization_id);

CREATE INDEX IF NOT EXISTS business_locations_organization_idx
  ON public.business_locations (organization_id);

CREATE INDEX IF NOT EXISTS business_locations_organization_status_idx
  ON public.business_locations (organization_id, status);

CREATE INDEX IF NOT EXISTS business_zones_location_idx
  ON public.business_zones (location_id);

CREATE INDEX IF NOT EXISTS business_zones_location_status_idx
  ON public.business_zones (location_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS business_zones_one_default_per_location_uidx
  ON public.business_zones (location_id)
  WHERE is_default = true;

-- ---------------------------------------------------------------------------
-- updated_at (local helper; no shared project trigger exists)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_domain_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_organizations_set_updated_at
  ON public.business_organizations;
CREATE TRIGGER business_organizations_set_updated_at
  BEFORE UPDATE ON public.business_organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.business_domain_set_updated_at();

DROP TRIGGER IF EXISTS business_organization_members_set_updated_at
  ON public.business_organization_members;
CREATE TRIGGER business_organization_members_set_updated_at
  BEFORE UPDATE ON public.business_organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.business_domain_set_updated_at();

DROP TRIGGER IF EXISTS business_locations_set_updated_at
  ON public.business_locations;
CREATE TRIGGER business_locations_set_updated_at
  BEFORE UPDATE ON public.business_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.business_domain_set_updated_at();

DROP TRIGGER IF EXISTS business_zones_set_updated_at
  ON public.business_zones;
CREATE TRIGGER business_zones_set_updated_at
  BEFORE UPDATE ON public.business_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.business_domain_set_updated_at();

REVOKE ALL ON FUNCTION public.business_domain_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.business_domain_set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.business_domain_set_updated_at() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Membership helpers (author-access style)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_business_organization_member(
  p_organization_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_organization_members AS m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_user_id
      AND m.role IN ('owner', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_business_organization_owner(
  p_organization_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_organization_members AS m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_user_id
      AND m.role = 'owner'
  );
$$;

COMMENT ON FUNCTION public.is_business_organization_member(uuid, uuid) IS
  'audiolad:business-domain; STABLE SECURITY DEFINER membership check for RLS.';

COMMENT ON FUNCTION public.is_business_organization_owner(uuid, uuid) IS
  'audiolad:business-domain; STABLE SECURITY DEFINER owner check for RLS.';

REVOKE ALL ON FUNCTION public.is_business_organization_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_business_organization_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_business_organization_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_organization_member(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_business_organization_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_business_organization_owner(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_business_organization_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_organization_owner(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------

ALTER TABLE public.business_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_zones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_organizations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_organization_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_locations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_zones FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.business_organizations TO authenticated;
GRANT SELECT ON TABLE public.business_organization_members TO authenticated;
GRANT SELECT ON TABLE public.business_locations TO authenticated;
GRANT SELECT ON TABLE public.business_zones TO authenticated;

GRANT ALL ON TABLE public.business_organizations TO service_role;
GRANT ALL ON TABLE public.business_organization_members TO service_role;
GRANT ALL ON TABLE public.business_locations TO service_role;
GRANT ALL ON TABLE public.business_zones TO service_role;

DROP POLICY IF EXISTS "Business members can read own organizations"
  ON public.business_organizations;
CREATE POLICY "Business members can read own organizations"
  ON public.business_organizations
  FOR SELECT
  TO authenticated
  USING (public.is_business_organization_member(id));

DROP POLICY IF EXISTS "Members can read own business membership"
  ON public.business_organization_members;
CREATE POLICY "Members can read own business membership"
  ON public.business_organization_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Business owners can read organization memberships"
  ON public.business_organization_members;
CREATE POLICY "Business owners can read organization memberships"
  ON public.business_organization_members
  FOR SELECT
  TO authenticated
  USING (public.is_business_organization_owner(organization_id));

DROP POLICY IF EXISTS "Business members can read organization locations"
  ON public.business_locations;
CREATE POLICY "Business members can read organization locations"
  ON public.business_locations
  FOR SELECT
  TO authenticated
  USING (public.is_business_organization_member(organization_id));

DROP POLICY IF EXISTS "Business members can read location zones"
  ON public.business_zones;
CREATE POLICY "Business members can read location zones"
  ON public.business_zones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_locations AS l
      WHERE l.id = business_zones.location_id
        AND public.is_business_organization_member(l.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Bootstrap RPC (atomic Organization + owner + Location + default Zone)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_business_organization_with_location(
  p_organization_name text,
  p_location_name text,
  p_business_category text,
  p_country_code text,
  p_timezone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_name text := btrim(coalesce(p_organization_name, ''));
  v_loc_name text := btrim(coalesce(p_location_name, ''));
  v_category text := btrim(coalesce(p_business_category, ''));
  v_country text := upper(btrim(coalesce(p_country_code, '')));
  v_timezone text := btrim(coalesce(p_timezone, ''));
  v_organization_id uuid;
  v_location_id uuid;
  v_zone_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_org_name) < 1 OR char_length(v_org_name) > 120 THEN
    RAISE EXCEPTION 'invalid_organization_name' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_loc_name) < 1 OR char_length(v_loc_name) > 120 THEN
    RAISE EXCEPTION 'invalid_location_name' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_category) < 1 OR char_length(v_category) > 120 THEN
    RAISE EXCEPTION 'invalid_business_category' USING ERRCODE = '22023';
  END IF;

  IF v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid_country_code' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_timezone) < 1 OR char_length(v_timezone) > 64 THEN
    RAISE EXCEPTION 'invalid_timezone' USING ERRCODE = '22023';
  END IF;

  -- STABLE lookup against live timezone catalog (not an IMMUTABLE wrapper).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names AS tz
    WHERE tz.name = v_timezone
  ) THEN
    RAISE EXCEPTION 'invalid_timezone' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.business_organizations (name, status, created_by)
  VALUES (v_org_name, 'active', v_user_id)
  RETURNING id INTO v_organization_id;

  INSERT INTO public.business_organization_members (
    organization_id, user_id, role
  ) VALUES (
    v_organization_id, v_user_id, 'owner'
  );

  INSERT INTO public.business_locations (
    organization_id,
    name,
    business_category,
    country_code,
    timezone,
    status
  ) VALUES (
    v_organization_id,
    v_loc_name,
    v_category,
    v_country,
    v_timezone,
    'active'
  )
  RETURNING id INTO v_location_id;

  INSERT INTO public.business_zones (
    location_id, name, is_default, status
  ) VALUES (
    v_location_id, NULL, true, 'active'
  )
  RETURNING id INTO v_zone_id;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', v_organization_id,
    'location_id', v_location_id,
    'zone_id', v_zone_id
  );
END;
$$;

COMMENT ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text) IS
  'audiolad:business-domain; atomic bootstrap: Organization + owner membership + Location + default Zone. Owner is always auth.uid().';

REVOKE ALL ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_organization_with_location(text, text, text, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Structural post-checks (no production data mutation)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.business_organizations') IS NULL
     OR to_regclass('public.business_organization_members') IS NULL
     OR to_regclass('public.business_locations') IS NULL
     OR to_regclass('public.business_zones') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: business domain tables missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_organization_members_org_user_unique'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: membership unique missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'business_zones_one_default_per_location_uidx'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: default zone unique missing';
  END IF;

  IF NOT (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.business_organizations'::regclass
  ) THEN
    RAISE EXCEPTION 'Post-check failed: RLS not enabled on business_organizations';
  END IF;

  IF NOT (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.business_organization_members'::regclass
  ) THEN
    RAISE EXCEPTION 'Post-check failed: RLS not enabled on business_organization_members';
  END IF;

  IF NOT (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.business_locations'::regclass
  ) THEN
    RAISE EXCEPTION 'Post-check failed: RLS not enabled on business_locations';
  END IF;

  IF NOT (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.business_zones'::regclass
  ) THEN
    RAISE EXCEPTION 'Post-check failed: RLS not enabled on business_zones';
  END IF;

  IF to_regprocedure(
    'public.create_business_organization_with_location(text,text,text,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: bootstrap RPC missing';
  END IF;

  IF has_table_privilege('anon', 'public.business_organizations', 'SELECT')
     OR has_table_privilege('anon', 'public.business_locations', 'SELECT')
     OR has_table_privilege('anon', 'public.business_zones', 'SELECT')
     OR has_table_privilege('anon', 'public.business_organization_members', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: anon must not SELECT business tables';
  END IF;

  IF has_table_privilege('authenticated', 'public.business_organizations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.business_locations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.business_zones', 'INSERT')
     OR has_table_privilege('authenticated', 'public.business_organization_members', 'INSERT') THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not INSERT business tables';
  END IF;

  IF has_table_privilege('authenticated', 'public.business_organizations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.business_locations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.business_zones', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.business_organization_members', 'UPDATE') THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not UPDATE business tables';
  END IF;

  IF has_table_privilege('authenticated', 'public.business_organizations', 'DELETE')
     OR has_table_privilege('authenticated', 'public.business_locations', 'DELETE')
     OR has_table_privilege('authenticated', 'public.business_zones', 'DELETE')
     OR has_table_privilege('authenticated', 'public.business_organization_members', 'DELETE') THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not DELETE business tables';
  END IF;
END;
$$;

COMMIT;
