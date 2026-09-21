-- Author partner program foundation (PR1).
-- Identity + invite codes + referral core only.
-- Does NOT touch ledger, payouts, capacity, attribution cookies, or UI routes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Helpers: normalize / validate / reserved / ownership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_partner_normalize_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(lower(btrim(COALESCE(p_code, ''))), '');
$$;

COMMENT ON FUNCTION public.author_partner_normalize_code(text) IS
  'audiolad:author-partner:v1; case-insensitive code key (trim + lower).';

CREATE OR REPLACE FUNCTION public.author_partner_code_format_ok(p_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    public.author_partner_normalize_code(p_code) IS NOT NULL
    AND char_length(public.author_partner_normalize_code(p_code)) BETWEEN 3 AND 32
    AND public.author_partner_normalize_code(p_code)
      ~ '^[a-z0-9]+([a-z0-9_-]*[a-z0-9])?$';
$$;

COMMENT ON FUNCTION public.author_partner_code_format_ok(text) IS
  'audiolad:author-partner:v1; URL-safe codes: 3..32 chars, [a-z0-9_-], start/end alnum.';

CREATE TABLE IF NOT EXISTS public.author_partner_reserved_codes (
  code_normalized text PRIMARY KEY,
  reason text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_partner_reserved_codes_normalized_check
    CHECK (
      code_normalized = lower(btrim(code_normalized))
      AND code_normalized <> ''
    )
);

COMMENT ON TABLE public.author_partner_reserved_codes IS
  'audiolad:author-partner:v1; server-side reserved invite codes (expandable).';

INSERT INTO public.author_partner_reserved_codes (code_normalized, reason)
VALUES
  ('admin', 'system'),
  ('api', 'system'),
  ('auth', 'system'),
  ('login', 'system'),
  ('signup', 'system'),
  ('register', 'system'),
  ('invite', 'system'),
  ('author', 'system'),
  ('authors', 'system'),
  ('audiolad', 'system'),
  ('support', 'system'),
  ('help', 'system'),
  ('account', 'system'),
  ('profile', 'system'),
  ('settings', 'system'),
  ('finance', 'system'),
  ('partner', 'system'),
  ('partners', 'system'),
  ('referral', 'system'),
  ('referrals', 'system'),
  ('www', 'system'),
  ('app', 'system'),
  ('root', 'system'),
  ('null', 'system'),
  ('undefined', 'system')
ON CONFLICT (code_normalized) DO NOTHING;

CREATE OR REPLACE FUNCTION public.author_partner_code_is_reserved(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.author_partner_reserved_codes AS r
    WHERE r.code_normalized = public.author_partner_normalize_code(p_code)
  );
$$;

CREATE OR REPLACE FUNCTION public.author_partner_owner_user_id(p_author_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.user_id
  FROM public.author_members AS m
  WHERE m.author_id = p_author_id
    AND m.role = 'owner'
  ORDER BY m.created_at ASC NULLS LAST, m.user_id ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.author_partner_owner_user_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_partner_owner_user_id(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.author_partner_is_owner(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS m
      WHERE m.author_id = p_author_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    );
$$;

REVOKE ALL ON FUNCTION public.author_partner_is_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_partner_is_owner(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.author_partner_is_member(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS m
      WHERE m.author_id = p_author_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'editor')
    );
$$;

REVOKE ALL ON FUNCTION public.author_partner_is_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_partner_is_member(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Unified code namespace (primary + aliases)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_partner_code_claims (
  code_normalized text PRIMARY KEY,
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  claim_kind text NOT NULL,
  code_display text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_partner_code_claims_kind_check
    CHECK (claim_kind IN ('primary', 'alias')),
  CONSTRAINT author_partner_code_claims_normalized_check
    CHECK (
      code_normalized = lower(btrim(code_normalized))
      AND code_normalized <> ''
      AND char_length(code_normalized) BETWEEN 3 AND 32
    ),
  CONSTRAINT author_partner_code_claims_display_check
    CHECK (char_length(btrim(code_display)) BETWEEN 3 AND 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS author_partner_code_claims_one_primary_per_author_uidx
  ON public.author_partner_code_claims (author_id)
  WHERE claim_kind = 'primary';

CREATE INDEX IF NOT EXISTS author_partner_code_claims_author_id_idx
  ON public.author_partner_code_claims (author_id);

COMMENT ON TABLE public.author_partner_code_claims IS
  'audiolad:author-partner:v1; exclusive invite-code namespace across primary + aliases.';

-- ---------------------------------------------------------------------------
-- 3. Partner profile (1:1 author)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_partner_profiles (
  author_id uuid PRIMARY KEY
    REFERENCES public.authors (id) ON DELETE CASCADE,
  primary_code text NOT NULL,
  primary_code_normalized text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_partner_profiles_status_check
    CHECK (status IN ('active', 'disabled')),
  CONSTRAINT author_partner_profiles_primary_norm_check
    CHECK (
      primary_code_normalized = lower(btrim(primary_code_normalized))
      AND primary_code_normalized = public.author_partner_normalize_code(primary_code)
    ),
  CONSTRAINT author_partner_profiles_primary_fk
    FOREIGN KEY (primary_code_normalized)
    REFERENCES public.author_partner_code_claims (code_normalized)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS author_partner_profiles_status_idx
  ON public.author_partner_profiles (status);

COMMENT ON TABLE public.author_partner_profiles IS
  'audiolad:author-partner:v1; one partner profile per author workspace; code owned by author_id.';

COMMENT ON COLUMN public.author_partner_profiles.primary_code IS
  'Display form of the current primary invite code (case preserved as last written).';

-- ---------------------------------------------------------------------------
-- 4. Aliases (former primaries / retained links)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_partner_code_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  code text NOT NULL,
  code_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_partner_code_aliases_norm_check
    CHECK (
      code_normalized = lower(btrim(code_normalized))
      AND code_normalized = public.author_partner_normalize_code(code)
    ),
  CONSTRAINT author_partner_code_aliases_code_fk
    FOREIGN KEY (code_normalized)
    REFERENCES public.author_partner_code_claims (code_normalized)
    ON DELETE CASCADE,
  CONSTRAINT author_partner_code_aliases_code_unique
    UNIQUE (code_normalized)
);

CREATE INDEX IF NOT EXISTS author_partner_code_aliases_author_id_idx
  ON public.author_partner_code_aliases (author_id);

COMMENT ON TABLE public.author_partner_code_aliases IS
  'audiolad:author-partner:v1; retained invite codes after primary change; still resolve to same author.';

-- ---------------------------------------------------------------------------
-- 5. Core referral record (no attribution engine yet)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE RESTRICT,
  referrer_owner_user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,
  invitee_user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,
  invitee_author_id uuid NULL
    REFERENCES public.authors (id) ON DELETE RESTRICT,
  code_used text NOT NULL,
  code_normalized text NOT NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  expires_at timestamptz NULL,
  status text NOT NULL DEFAULT 'attributed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_referrals_status_check
    CHECK (status IN ('attributed', 'activated', 'expired', 'void')),
  CONSTRAINT author_referrals_invitee_user_unique
    UNIQUE (invitee_user_id),
  CONSTRAINT author_referrals_invitee_author_unique
    UNIQUE (invitee_author_id),
  CONSTRAINT author_referrals_no_self_user_check
    CHECK (invitee_user_id IS DISTINCT FROM referrer_owner_user_id),
  CONSTRAINT author_referrals_code_norm_check
    CHECK (code_normalized = public.author_partner_normalize_code(code_used)),
  CONSTRAINT author_referrals_activated_shape_check
    CHECK (
      status <> 'activated'
      OR (
        activated_at IS NOT NULL
        AND expires_at IS NOT NULL
        AND invitee_author_id IS NOT NULL
        AND expires_at > activated_at
      )
    )
);

CREATE INDEX IF NOT EXISTS author_referrals_referrer_author_id_idx
  ON public.author_referrals (referrer_author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS author_referrals_status_idx
  ON public.author_referrals (status);

COMMENT ON TABLE public.author_referrals IS
  'audiolad:author-partner:v1; single-level referral core. One invitee_user → one referrer_author. Immutable after activated.';

COMMENT ON COLUMN public.author_referrals.referrer_author_id IS
  'Canonical partner identity for future ledger credits (author workspace that owns the invite code).';

COMMENT ON COLUMN public.author_referrals.referrer_owner_user_id IS
  'Owner user of referrer_author_id at bind time; used for self-referral defense.';

CREATE OR REPLACE FUNCTION public.author_referrals_protect_activated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'activated' THEN
      RAISE EXCEPTION 'author_referral_activated_immutable'
        USING ERRCODE = '22023';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'activated' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.referrer_author_id IS DISTINCT FROM OLD.referrer_author_id
      OR NEW.referrer_owner_user_id IS DISTINCT FROM OLD.referrer_owner_user_id
      OR NEW.invitee_user_id IS DISTINCT FROM OLD.invitee_user_id
      OR NEW.invitee_author_id IS DISTINCT FROM OLD.invitee_author_id
      OR NEW.code_used IS DISTINCT FROM OLD.code_used
      OR NEW.code_normalized IS DISTINCT FROM OLD.code_normalized
      OR NEW.attributed_at IS DISTINCT FROM OLD.attributed_at
      OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    THEN
      RAISE EXCEPTION 'author_referral_activated_immutable'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS author_referrals_protect_activated_trg ON public.author_referrals;
CREATE TRIGGER author_referrals_protect_activated_trg
  BEFORE UPDATE OR DELETE ON public.author_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.author_referrals_protect_activated();

-- ---------------------------------------------------------------------------
-- 6. updated_at for profiles
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_partner_profiles_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS author_partner_profiles_set_updated_at_trg
  ON public.author_partner_profiles;
CREATE TRIGGER author_partner_profiles_set_updated_at_trg
  BEFORE UPDATE ON public.author_partner_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.author_partner_profiles_set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Code generation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_partner_generate_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw text;
  v_code text;
  v_attempt integer := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    -- 10 hex chars from 5 random bytes → non-sequential, URL-safe.
    v_raw := encode(gen_random_bytes(5), 'hex');
    v_code := 'p' || v_raw;

    IF public.author_partner_code_format_ok(v_code)
      AND NOT public.author_partner_code_is_reserved(v_code)
      AND NOT EXISTS (
        SELECT 1
        FROM public.author_partner_code_claims AS c
        WHERE c.code_normalized = public.author_partner_normalize_code(v_code)
      )
    THEN
      RETURN v_code;
    END IF;

    IF v_attempt >= 24 THEN
      RAISE EXCEPTION 'author_partner_code_generate_exhausted'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.author_partner_generate_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_partner_generate_code() TO service_role;

-- ---------------------------------------------------------------------------
-- 8. RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_author_partner_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_norm text := public.author_partner_normalize_code(p_code);
  v_claim public.author_partner_code_claims%ROWTYPE;
  v_profile public.author_partner_profiles%ROWTYPE;
  v_name text;
  v_slug text;
BEGIN
  IF v_norm IS NULL OR NOT public.author_partner_code_format_ok(v_norm) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT *
  INTO v_claim
  FROM public.author_partner_code_claims AS c
  WHERE c.code_normalized = v_norm;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT *
  INTO v_profile
  FROM public.author_partner_profiles AS p
  WHERE p.author_id = v_claim.author_id;

  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT a.name, a.slug
  INTO v_name, v_slug
  FROM public.authors AS a
  WHERE a.id = v_claim.author_id;

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', v_claim.author_id,
    'author_name', v_name,
    'author_slug', v_slug,
    'code', v_claim.code_display,
    'code_kind', v_claim.claim_kind,
    'is_primary', (v_claim.claim_kind = 'primary')
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_author_partner_code(text) IS
  'audiolad:author-partner:v1; public resolve of primary or alias invite code → safe author projection.';

REVOKE ALL ON FUNCTION public.resolve_author_partner_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_author_partner_code(text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_author_partner_profile(p_author_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.author_partner_profiles%ROWTYPE;
  v_code text;
  v_norm text;
  v_attempt integer := 0;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NULL OR NOT public.author_partner_is_owner(p_author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.authors AS a WHERE a.id = p_author_id) THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.author_partner_profiles AS p
  WHERE p.author_id = p_author_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'author_id', v_profile.author_id,
      'primary_code', v_profile.primary_code,
      'status', v_profile.status
    );
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := public.author_partner_generate_code();
    v_norm := public.author_partner_normalize_code(v_code);

    BEGIN
      INSERT INTO public.author_partner_code_claims (
        code_normalized, author_id, claim_kind, code_display
      ) VALUES (
        v_norm, p_author_id, 'primary', v_code
      );

      INSERT INTO public.author_partner_profiles (
        author_id, primary_code, primary_code_normalized, status
      ) VALUES (
        p_author_id, v_code, v_norm, 'active'
      )
      RETURNING * INTO v_profile;

      RETURN jsonb_build_object(
        'ok', true,
        'created', true,
        'author_id', v_profile.author_id,
        'primary_code', v_profile.primary_code,
        'status', v_profile.status
      );
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= 24 THEN
          RAISE EXCEPTION 'author_partner_code_generate_exhausted'
            USING ERRCODE = 'P0001';
        END IF;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.ensure_author_partner_profile(uuid) IS
  'audiolad:author-partner:v1; owner-only ensure profile + generated primary code (DB uniqueness + retry).';

REVOKE ALL ON FUNCTION public.ensure_author_partner_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_author_partner_profile(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.change_author_partner_code(
  p_author_id uuid,
  p_new_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.author_partner_profiles%ROWTYPE;
  v_old_display text;
  v_old_norm text;
  v_new_display text := btrim(COALESCE(p_new_code, ''));
  v_new_norm text;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NULL OR NOT public.author_partner_is_owner(p_author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.author_partner_code_format_ok(v_new_display) THEN
    RAISE EXCEPTION 'invalid_code' USING ERRCODE = '22023';
  END IF;

  v_new_norm := public.author_partner_normalize_code(v_new_display);

  IF public.author_partner_code_is_reserved(v_new_norm) THEN
    RAISE EXCEPTION 'reserved_code' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.author_partner_profiles AS p
  WHERE p.author_id = p_author_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner_profile_missing' USING ERRCODE = 'P0002';
  END IF;

  IF v_profile.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'partner_profile_disabled' USING ERRCODE = '22023';
  END IF;

  v_old_display := v_profile.primary_code;
  v_old_norm := v_profile.primary_code_normalized;

  IF v_new_norm = v_old_norm THEN
    RETURN jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'author_id', p_author_id,
      'primary_code', v_old_display
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.author_partner_code_claims AS c
    WHERE c.code_normalized = v_new_norm
      AND c.author_id IS DISTINCT FROM p_author_id
  ) THEN
    RAISE EXCEPTION 'code_taken' USING ERRCODE = '23505';
  END IF;

  -- Demote current primary first so the one-primary unique index stays valid.
  UPDATE public.author_partner_code_claims AS c
  SET claim_kind = 'alias'
  WHERE c.code_normalized = v_old_norm
    AND c.author_id = p_author_id;

  INSERT INTO public.author_partner_code_aliases (
    author_id, code, code_normalized
  ) VALUES (
    p_author_id, v_old_display, v_old_norm
  )
  ON CONFLICT (code_normalized) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.author_partner_code_claims AS c
    WHERE c.code_normalized = v_new_norm
      AND c.author_id = p_author_id
      AND c.claim_kind = 'alias'
  ) THEN
    DELETE FROM public.author_partner_code_aliases AS a
    WHERE a.author_id = p_author_id
      AND a.code_normalized = v_new_norm;

    UPDATE public.author_partner_code_claims AS c
    SET
      claim_kind = 'primary',
      code_display = v_new_display
    WHERE c.code_normalized = v_new_norm
      AND c.author_id = p_author_id;
  ELSE
    INSERT INTO public.author_partner_code_claims (
      code_normalized, author_id, claim_kind, code_display
    ) VALUES (
      v_new_norm, p_author_id, 'primary', v_new_display
    );
  END IF;

  UPDATE public.author_partner_profiles AS p
  SET
    primary_code = v_new_display,
    primary_code_normalized = v_new_norm
  WHERE p.author_id = p_author_id;

  RETURN jsonb_build_object(
    'ok', true,
    'unchanged', false,
    'author_id', p_author_id,
    'primary_code', v_new_display,
    'previous_code', v_old_display,
    'previous_code_is_alias', true
  );
END;
$$;

COMMENT ON FUNCTION public.change_author_partner_code(uuid, text) IS
  'audiolad:author-partner:v1; owner-only atomic primary code change; old primary kept as working alias.';

REVOKE ALL ON FUNCTION public.change_author_partner_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_author_partner_code(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_author_partner_profile(p_author_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.author_partner_profiles%ROWTYPE;
  v_aliases jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL OR NOT public.author_partner_is_member(p_author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.author_partner_profiles AS p
  WHERE p.author_id = p_author_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'exists', false, 'author_id', p_author_id);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code', a.code,
        'code_normalized', a.code_normalized,
        'created_at', a.created_at
      )
      ORDER BY a.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_aliases
  FROM public.author_partner_code_aliases AS a
  WHERE a.author_id = p_author_id;

  RETURN jsonb_build_object(
    'ok', true,
    'exists', true,
    'author_id', v_profile.author_id,
    'primary_code', v_profile.primary_code,
    'status', v_profile.status,
    'aliases', v_aliases,
    'created_at', v_profile.created_at,
    'updated_at', v_profile.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.get_author_partner_profile(uuid) IS
  'audiolad:author-partner:v1; member read of own partner profile + aliases (no finance).';

REVOKE ALL ON FUNCTION public.get_author_partner_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_author_partner_profile(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.author_partner_assert_not_self_referral(
  p_referrer_author_id uuid,
  p_invitee_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_referrer_author_id IS NULL OR p_invitee_user_id IS NULL THEN
    RAISE EXCEPTION 'self_referral_args_required' USING ERRCODE = '22023';
  END IF;

  v_owner := public.author_partner_owner_user_id(p_referrer_author_id);

  IF v_owner IS NOT NULL AND v_owner = p_invitee_user_id THEN
    RAISE EXCEPTION 'self_referral_forbidden' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.author_members AS m
    WHERE m.author_id = p_referrer_author_id
      AND m.user_id = p_invitee_user_id
  ) THEN
    RAISE EXCEPTION 'self_referral_forbidden' USING ERRCODE = '22023';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.author_partner_assert_not_self_referral(uuid, uuid) IS
  'audiolad:author-partner:v1; rejects invitee who owns or belongs to referrer author workspace.';

REVOKE ALL ON FUNCTION public.author_partner_assert_not_self_referral(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_partner_assert_not_self_referral(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_partner_reserved_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_partner_code_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_partner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_partner_code_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_referrals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_partner_reserved_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.author_partner_code_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.author_partner_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.author_partner_code_aliases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.author_referrals FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.author_partner_profiles TO authenticated;
GRANT SELECT ON TABLE public.author_partner_code_aliases TO authenticated;
GRANT ALL ON TABLE public.author_partner_reserved_codes TO service_role;
GRANT ALL ON TABLE public.author_partner_code_claims TO service_role;
GRANT ALL ON TABLE public.author_partner_profiles TO service_role;
GRANT ALL ON TABLE public.author_partner_code_aliases TO service_role;
GRANT ALL ON TABLE public.author_referrals TO service_role;

DROP POLICY IF EXISTS "Author members can read partner profile"
  ON public.author_partner_profiles;
CREATE POLICY "Author members can read partner profile"
  ON public.author_partner_profiles
  FOR SELECT
  TO authenticated
  USING (public.author_partner_is_member(author_id));

DROP POLICY IF EXISTS "Author members can read partner code aliases"
  ON public.author_partner_code_aliases;
CREATE POLICY "Author members can read partner code aliases"
  ON public.author_partner_code_aliases
  FOR SELECT
  TO authenticated
  USING (public.author_partner_is_member(author_id));

DROP POLICY IF EXISTS "Referrer owner or invitee can read referrals"
  ON public.author_referrals;
CREATE POLICY "Referrer owner or invitee can read referrals"
  ON public.author_referrals
  FOR SELECT
  TO authenticated
  USING (
    referrer_owner_user_id = auth.uid()
    OR invitee_user_id = auth.uid()
  );

-- No INSERT/UPDATE/DELETE policies for authenticated on partner tables.
-- Mutations go through SECURITY DEFINER RPCs only.

COMMIT;
