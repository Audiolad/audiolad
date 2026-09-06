BEGIN;

-- ---------------------------------------------------------------------------
-- Phase 5: one-time external access links
--
-- Additive only. Separate audit table for issuance; entitlement remains
-- user_practices via grant_practice_access(..., 'external_manual', ...).
-- Browser never writes this table. Public landing never SELECTs by
-- token_hash via RLS. Preview/redeem are SECURITY DEFINER, service_role only.
-- Raw token is never stored. GET/preview does not consume.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  practice_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,

  target_access_level integer NOT NULL DEFAULT 1,

  token_hash text NOT NULL,

  status text NOT NULL DEFAULT 'active',

  created_by_user_id uuid NULL,
  created_by_author_id uuid NULL
    REFERENCES public.authors (id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,

  redeemed_by_user_id uuid NULL,
  redeemed_at timestamptz NULL,

  revoked_at timestamptz NULL,
  revoked_by_user_id uuid NULL,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT practice_access_links_target_level_check
    CHECK (target_access_level >= 1),

  CONSTRAINT practice_access_links_token_hash_hex_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),

  CONSTRAINT practice_access_links_status_check
    CHECK (status IN ('active', 'redeemed', 'revoked')),

  CONSTRAINT practice_access_links_token_hash_unique
    UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS practice_access_links_practice_created_idx
  ON public.practice_access_links (practice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_access_links_practice_active_target_idx
  ON public.practice_access_links (practice_id, target_access_level)
  WHERE status = 'active';

COMMENT ON TABLE public.practice_access_links IS
  'One-time external access-link audit records. Not an entitlement. Canonical grant remains grant_practice_access. Stores SHA-256 hex of the raw token only.';

COMMENT ON COLUMN public.practice_access_links.token_hash IS
  'SHA-256 hex digest of the raw URL token. Never store the raw token.';

COMMENT ON COLUMN public.practice_access_links.status IS
  'Stored status: active | redeemed | revoked. Expiry is derived from expires_at.';

COMMENT ON COLUMN public.practice_access_links.target_access_level IS
  'Entitlement intent for grant_practice_access. Not a price or checkout snapshot.';

ALTER TABLE public.practice_access_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.practice_access_links FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_access_links FROM anon, authenticated;
GRANT ALL ON TABLE public.practice_access_links TO service_role;

-- ===========================================================================
-- Target-level structural validation (create + redeem)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.assert_practice_access_link_target(
  p_practice_id uuid,
  p_target_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_has_catalog boolean;
  v_level_exists boolean;
BEGIN
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002', DETAIL = 'practice_not_found';
  END IF;

  IF p_target_level IS NULL OR p_target_level < 1 THEN
    RAISE EXCEPTION 'invalid_access_level'
      USING ERRCODE = '22023', DETAIL = 'level_must_be_gte_1';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002', DETAIL = 'practice_not_found';
  END IF;

  IF p_target_level > 1
     AND v_practice.publication_class IS DISTINCT FROM 'course' THEN
    RAISE EXCEPTION 'access_level_not_available'
      USING ERRCODE = '22023', DETAIL = 'course_only';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.practice_access_levels AS pal
    WHERE pal.practice_id = p_practice_id
  )
  INTO v_has_catalog;

  IF NOT v_has_catalog THEN
    IF p_target_level <> 1 THEN
      RAISE EXCEPTION 'target_level_not_configured'
        USING ERRCODE = '22023', DETAIL = 'legacy_level_1_only';
    END IF;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.practice_access_levels AS pal
    WHERE pal.practice_id = p_practice_id
      AND pal.level = p_target_level
  )
  INTO v_level_exists;

  IF NOT v_level_exists THEN
    RAISE EXCEPTION 'target_level_not_configured'
      USING ERRCODE = '22023', DETAIL = 'level_not_in_catalog';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_practice_access_link_target(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_practice_access_link_target(uuid, integer)
  TO service_role;

COMMENT ON FUNCTION public.assert_practice_access_link_target(uuid, integer) IS
  'audiolad:access-link-target:v1; structural target validation. Non-course and empty catalog = L1 only. Configured course must list the target. L2+ requires publication_class=course. Not bound to price.';

-- ===========================================================================
-- Create (service_role after API permission check)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.create_practice_access_link(
  p_practice_id uuid,
  p_target_level integer,
  p_token_hash text,
  p_created_by_user_id uuid,
  p_created_by_author_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.practice_access_links%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_token_hash'
      USING ERRCODE = '22023', DETAIL = 'invalid_token_hash';
  END IF;

  IF p_created_by_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required'
      USING ERRCODE = '22023', DETAIL = 'user_id_required';
  END IF;

  PERFORM public.assert_practice_access_link_target(p_practice_id, p_target_level);

  INSERT INTO public.practice_access_links (
    practice_id,
    target_access_level,
    token_hash,
    status,
    created_by_user_id,
    created_by_author_id,
    expires_at,
    metadata
  )
  VALUES (
    p_practice_id,
    p_target_level,
    p_token_hash,
    'active',
    p_created_by_user_id,
    p_created_by_author_id,
    p_expires_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'practice_id', v_row.practice_id,
    'target_access_level', v_row.target_access_level,
    'status', v_row.status,
    'created_at', v_row.created_at,
    'expires_at', v_row.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_practice_access_link(uuid, integer, text, uuid, uuid, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_practice_access_link(uuid, integer, text, uuid, uuid, timestamptz, jsonb)
  TO service_role;

-- ===========================================================================
-- Preview (no consume)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.preview_practice_access_link(
  p_token_hash text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.practice_access_links%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_author_slug text;
  v_level_title text;
  v_level_description text;
  v_display_status text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  SELECT *
  INTO v_link
  FROM public.practice_access_links
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = v_link.practice_id;

  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  SELECT a.slug
  INTO v_author_slug
  FROM public.authors AS a
  WHERE a.id = v_practice.author_id;

  SELECT pal.title, pal.description
  INTO v_level_title, v_level_description
  FROM public.practice_access_levels AS pal
  WHERE pal.practice_id = v_link.practice_id
    AND pal.level = v_link.target_access_level;

  IF v_link.status = 'revoked' THEN
    v_display_status := 'revoked';
  ELSIF v_link.status = 'redeemed' THEN
    IF p_user_id IS NOT NULL
       AND v_link.redeemed_by_user_id IS NOT DISTINCT FROM p_user_id THEN
      v_display_status := 'already_redeemed_by_you';
    ELSE
      v_display_status := 'redeemed';
    END IF;
  ELSIF v_link.expires_at IS NOT NULL AND v_link.expires_at < clock_timestamp() THEN
    v_display_status := 'expired';
  ELSE
    v_display_status := 'active';
  END IF;

  RETURN jsonb_build_object(
    'status', v_display_status,
    'product_title', v_practice.title,
    'product_slug', v_practice.slug,
    'author_slug', v_author_slug,
    'publication_class', v_practice.publication_class,
    'target_access_level', v_link.target_access_level,
    'level_title', v_level_title,
    'level_description', v_level_description,
    'expires_at', v_link.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_practice_access_link(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_practice_access_link(text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.preview_practice_access_link(text, uuid) IS
  'audiolad:access-link-preview:v1; safe public DTO only. Does not consume. Never returns token, token_hash, user ids, or admin metadata.';

-- ===========================================================================
-- Atomic redeem
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.redeem_practice_access_link(
  p_token_hash text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.practice_access_links%ROWTYPE;
  v_grant jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required'
      USING ERRCODE = '22023', DETAIL = 'user_id_required';
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  SELECT *
  INTO v_link
  FROM public.practice_access_links
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  IF v_link.status = 'revoked' THEN
    RAISE EXCEPTION 'link_revoked'
      USING ERRCODE = '22023', DETAIL = 'link_revoked';
  END IF;

  IF v_link.status = 'redeemed' THEN
    IF v_link.redeemed_by_user_id IS NOT DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'already_redeemed_by_you'
        USING ERRCODE = '22023', DETAIL = 'already_redeemed_by_you';
    END IF;

    RAISE EXCEPTION 'link_already_used'
      USING ERRCODE = '22023', DETAIL = 'link_already_used';
  END IF;

  IF v_link.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'link_already_used'
      USING ERRCODE = '22023', DETAIL = 'link_already_used';
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < clock_timestamp() THEN
    RAISE EXCEPTION 'link_expired'
      USING ERRCODE = '22023', DETAIL = 'link_expired';
  END IF;

  PERFORM public.assert_practice_access_link_target(
    v_link.practice_id,
    v_link.target_access_level
  );

  v_grant := public.grant_practice_access(
    p_user_id,
    v_link.practice_id,
    v_link.target_access_level,
    'external_manual',
    jsonb_build_object(
      'access_link_id', v_link.id,
      'granted_via', 'external_access_link'
    )
  );

  UPDATE public.practice_access_links
  SET
    status = 'redeemed',
    redeemed_by_user_id = p_user_id,
    redeemed_at = clock_timestamp()
  WHERE id = v_link.id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_already_used'
      USING ERRCODE = '22023', DETAIL = 'link_already_used';
  END IF;

  RETURN jsonb_build_object(
    'code', 'granted',
    'link_id', v_link.id,
    'practice_id', v_link.practice_id,
    'target_access_level', v_link.target_access_level,
    'grant', v_grant
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_practice_access_link(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_practice_access_link(text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.redeem_practice_access_link(text, uuid) IS
  'audiolad:access-link-redeem:v1; transactional one-time claim. SELECT FOR UPDATE, grant_practice_access(external_manual), then mark redeemed. GET/preview must not call this. service_role only.';

-- ===========================================================================
-- Revoke active only
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.revoke_practice_access_link(
  p_link_id uuid,
  p_revoked_by_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.practice_access_links%ROWTYPE;
BEGIN
  IF p_link_id IS NULL THEN
    RAISE EXCEPTION 'link_not_found'
      USING ERRCODE = 'P0002', DETAIL = 'link_not_found';
  END IF;

  IF p_revoked_by_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required'
      USING ERRCODE = '22023', DETAIL = 'user_id_required';
  END IF;

  SELECT *
  INTO v_link
  FROM public.practice_access_links
  WHERE id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_not_found'
      USING ERRCODE = 'P0002', DETAIL = 'link_not_found';
  END IF;

  IF v_link.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'link_not_active'
      USING ERRCODE = '22023', DETAIL = 'link_not_active';
  END IF;

  UPDATE public.practice_access_links
  SET
    status = 'revoked',
    revoked_at = clock_timestamp(),
    revoked_by_user_id = p_revoked_by_user_id
  WHERE id = v_link.id
    AND status = 'active'
  RETURNING * INTO v_link;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_not_active'
      USING ERRCODE = '22023', DETAIL = 'link_not_active';
  END IF;

  RETURN jsonb_build_object(
    'id', v_link.id,
    'status', v_link.status,
    'revoked_at', v_link.revoked_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_practice_access_link(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_practice_access_link(uuid, uuid)
  TO service_role;

-- ===========================================================================
-- Post-checks
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('public.practice_access_links') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: practice_access_links was not created';
  END IF;

  IF to_regprocedure('public.redeem_practice_access_link(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: redeem_practice_access_link missing';
  END IF;

  IF to_regprocedure('public.preview_practice_access_link(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: preview_practice_access_link missing';
  END IF;

  IF to_regprocedure('public.create_practice_access_link(uuid, integer, text, uuid, uuid, timestamptz, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: create_practice_access_link missing';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.redeem_practice_access_link(text, uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not EXECUTE redeem_practice_access_link';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.redeem_practice_access_link(text, uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not EXECUTE redeem_practice_access_link';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.preview_practice_access_link(text, uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not EXECUTE preview_practice_access_link';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.preview_practice_access_link(text, uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not EXECUTE preview_practice_access_link';
  END IF;

  IF has_table_privilege('authenticated', 'public.practice_access_links', 'INSERT') IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not INSERT practice_access_links';
  END IF;

  IF has_table_privilege('authenticated', 'public.practice_access_links', 'SELECT') IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not SELECT practice_access_links';
  END IF;

  IF has_table_privilege('anon', 'public.practice_access_links', 'SELECT') IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not SELECT practice_access_links';
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.redeem_practice_access_link(text, uuid)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: service_role must EXECUTE redeem_practice_access_link';
  END IF;
END;
$$;

COMMIT;
