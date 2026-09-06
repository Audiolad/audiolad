BEGIN;

-- ---------------------------------------------------------------------------
-- Phase 1: course access levels foundation + monotonic entitlement grants
--
-- Additive only. No mass INSERT into practice_access_levels.
-- Absence of catalog rows = legacy single Level 1 behavior.
-- Existing user_practices / course_lessons rows become Level 1 via DEFAULT
-- without a backfill UPDATE.
--
-- Course-only public-path invariant (server, not a table CHECK):
-- grant_practice_access rejects target_level > 1 unless
-- practices.publication_class = 'course'. Catalog rows may exist on any
-- practice so the DB is not closed to future product types; the trusted
-- grant RPC is the public path that must not give L2 to ordinary audio
-- practices. Higher entitlement always includes lower levels: one
-- user_practices.access_level = N means access to everything <= N.
-- Monotonic GREATEST lives only inside grant_practice_access. There is
-- no table-wide anti-downgrade trigger so a future trusted refund/revoke
-- can set L2→L1. access_source adds external_manual (not upgrade).
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. practice_access_levels (optional catalog; empty = legacy L1)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.practice_access_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  practice_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,

  level integer NOT NULL,
  title text NOT NULL,
  description text NULL,
  upgrade_price integer NULL,
  currency text NOT NULL DEFAULT 'RUB',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT practice_access_levels_level_check
    CHECK (level >= 1),

  CONSTRAINT practice_access_levels_practice_level_unique
    UNIQUE (practice_id, level),

  CONSTRAINT practice_access_levels_title_check
    CHECK (char_length(btrim(title)) > 0),

  CONSTRAINT practice_access_levels_upgrade_price_check
    CHECK (upgrade_price IS NULL OR upgrade_price >= 0),

  CONSTRAINT practice_access_levels_currency_rub_check
    CHECK (currency = 'RUB')
);

CREATE INDEX IF NOT EXISTS practice_access_levels_practice_id_idx
  ON public.practice_access_levels (practice_id, level);

COMMENT ON TABLE public.practice_access_levels IS
  'Optional paid-level catalog for a product (practices.id). Empty catalog = legacy single Level 1. Ordering uses level. Not a second public Product. Phase 1: no seed of Level 1 for existing products.';

COMMENT ON COLUMN public.practice_access_levels.level IS
  'Access tier, 1-based. Higher includes lower. UNIQUE per practice.';

COMMENT ON COLUMN public.practice_access_levels.upgrade_price IS
  'Optional price to reach this level, same integer money model as practices.price. NULL = unset. Not wired to checkout in Phase 1.';

COMMENT ON COLUMN public.practice_access_levels.currency IS
  'Matches practices/orders: RUB only.';

CREATE OR REPLACE FUNCTION public.set_practice_access_levels_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS practice_access_levels_set_updated_at
  ON public.practice_access_levels;
CREATE TRIGGER practice_access_levels_set_updated_at
  BEFORE UPDATE ON public.practice_access_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.set_practice_access_levels_updated_at();

ALTER TABLE public.practice_access_levels ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.practice_access_levels FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_access_levels FROM anon, authenticated;
GRANT ALL ON TABLE public.practice_access_levels TO service_role;

-- No authenticated INSERT/UPDATE/DELETE policies: authors cannot client-side
-- define paid levels in Phase 1, and cannot grant entitlements via this table.

-- ===========================================================================
-- 2. course_lessons.required_access_level
-- ===========================================================================

ALTER TABLE public.course_lessons
  ADD COLUMN IF NOT EXISTS required_access_level integer NOT NULL DEFAULT 1;

ALTER TABLE public.course_lessons
  DROP CONSTRAINT IF EXISTS course_lessons_required_access_level_check;

ALTER TABLE public.course_lessons
  ADD CONSTRAINT course_lessons_required_access_level_check
  CHECK (required_access_level >= 1);

COMMENT ON COLUMN public.course_lessons.required_access_level IS
  'Minimum user_practices.access_level that conceptually unlocks this lesson. DEFAULT 1 keeps existing lessons available to ordinary owners. Phase 1: no learner loader/UI filtering.';

-- ===========================================================================
-- 3. user_practices.access_level (monotonic entitlement)
-- ===========================================================================

ALTER TABLE public.user_practices
  ADD COLUMN IF NOT EXISTS access_level integer NOT NULL DEFAULT 1;

ALTER TABLE public.user_practices
  DROP CONSTRAINT IF EXISTS user_practices_access_level_check;

ALTER TABLE public.user_practices
  ADD CONSTRAINT user_practices_access_level_check
  CHECK (access_level >= 1);

COMMENT ON COLUMN public.user_practices.access_level IS
  'Canonical entitlement tier. One row per (user, practice). Higher includes lower. DEFAULT 1 = existing purchases stay Level 1 without backfill. grant_practice_access never lowers; trusted service_role UPDATE may lower (future refund/revoke). No table-wide anti-downgrade trigger.';

ALTER TABLE public.user_practices
  DROP CONSTRAINT IF EXISTS user_practices_access_source_check;

ALTER TABLE public.user_practices
  ADD CONSTRAINT user_practices_access_source_check
  CHECK (
    access_source = ANY (
      ARRAY[
        'starter'::text,
        'free_claim'::text,
        'purchase'::text,
        'gift'::text,
        'subscription'::text,
        'program'::text,
        'admin'::text,
        'external_manual'::text
      ]
    )
  );

COMMENT ON COLUMN public.user_practices.access_source IS
  'How access was granted: starter, free_claim, purchase, gift, subscription, program, admin, or external_manual (future external payment / one-time link). Not upgrade — native upgrade stays purchase.';

-- Table privileges stay SELECT-only for authenticated (library read).
-- Re-assert so a later GRANT UPDATE cannot be assumed:
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_practices FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_practices TO authenticated;
GRANT ALL ON TABLE public.user_practices TO service_role;

-- ===========================================================================
-- 4. Canonical grant_practice_access
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.grant_practice_access(
  p_user_id uuid,
  p_practice_id uuid,
  p_target_level integer,
  p_access_source text DEFAULT 'admin',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_access_source text;
  v_has_catalog boolean;
  v_level_exists boolean;
  v_inserted boolean;
  v_previous integer;
  v_result_level integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required'
      USING ERRCODE = '22023', DETAIL = 'user_id_required';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023', DETAIL = 'practice_id_required';
  END IF;

  IF p_target_level IS NULL OR p_target_level < 1 THEN
    RAISE EXCEPTION 'invalid_access_level'
      USING ERRCODE = '22023', DETAIL = 'level_must_be_gte_1';
  END IF;

  v_access_source := coalesce(nullif(btrim(coalesce(p_access_source, '')), ''), 'admin');

  IF v_access_source NOT IN (
    'starter',
    'free_claim',
    'purchase',
    'gift',
    'subscription',
    'program',
    'admin',
    'external_manual'
  ) THEN
    RAISE EXCEPTION 'invalid_access_source'
      USING ERRCODE = '22023', DETAIL = 'invalid_access_source';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002', DETAIL = 'practice_not_found';
  END IF;

  -- Public-path invariant: L2+ only for explicit courses. Not a table CHECK
  -- so future publication classes can grow without a schema rewrite.
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

  IF v_has_catalog THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.practice_access_levels AS pal
      WHERE pal.practice_id = p_practice_id
        AND pal.level = p_target_level
    )
    INTO v_level_exists;

    -- Level 1 is the implicit baseline (native purchase / legacy owners)
    -- even when the catalog only lists a higher tier. Target > 1 must exist.
    IF p_target_level > 1 AND NOT v_level_exists THEN
      RAISE EXCEPTION 'access_level_not_configured'
        USING ERRCODE = '22023', DETAIL = 'level_not_in_catalog';
    END IF;
  ELSIF p_target_level <> 1 THEN
    RAISE EXCEPTION 'access_level_not_configured'
      USING ERRCODE = '22023', DETAIL = 'legacy_level_1_only';
  END IF;

  SELECT up.access_level
  INTO v_previous
  FROM public.user_practices AS up
  WHERE up.user_id = p_user_id
    AND up.practice_id = p_practice_id;

  INSERT INTO public.user_practices (
    user_id,
    practice_id,
    access_source,
    access_level,
    metadata
  )
  VALUES (
    p_user_id,
    p_practice_id,
    v_access_source,
    p_target_level,
    coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (user_id, practice_id) DO UPDATE
  SET
    access_level = GREATEST(
      public.user_practices.access_level,
      EXCLUDED.access_level
    ),
    metadata = CASE
      WHEN EXCLUDED.access_level > public.user_practices.access_level THEN
        public.user_practices.metadata || EXCLUDED.metadata
      ELSE
        public.user_practices.metadata
    END
  RETURNING (xmax = 0), access_level
  INTO v_inserted, v_result_level;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'practice_id', p_practice_id,
    'access_level', v_result_level,
    'previous_access_level', v_previous,
    'inserted', v_inserted,
    'raised', coalesce(v_previous, 0) < v_result_level
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_practice_access(uuid, uuid, integer, text, jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_practice_access(uuid, uuid, integer, text, jsonb)
  FROM anon;
REVOKE ALL ON FUNCTION public.grant_practice_access(uuid, uuid, integer, text, jsonb)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_practice_access(uuid, uuid, integer, text, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.grant_practice_access(uuid, uuid, integer, text, jsonb) IS
  'audiolad:access-grant:v1; canonical monotonic entitlement grant. access_level = GREATEST(current, target) on INSERT … ON CONFLICT only. Does not install a table-wide anti-downgrade trigger. L1 always allowed (implicit baseline). L2+ requires publication_class=course and a matching practice_access_levels row. Accepts access_source including external_manual. Not executable by anon/authenticated.';

-- ===========================================================================
-- 5. Backward-compatible purchase wrapper (Level 1 only)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.grant_practice_purchase_access(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  locked_order public.orders%ROWTYPE;
  inserted_count integer;
  existing_count integer;
  grant_result jsonb;
  inserted boolean;
BEGIN
  SELECT *
  INTO locked_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF locked_order.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Order % is not paid (status=%)', p_order_id, locked_order.status;
  END IF;

  SELECT count(*)
  INTO existing_count
  FROM public.user_practices AS up
  WHERE up.user_id = locked_order.user_id
    AND up.practice_id = locked_order.practice_id;

  grant_result := public.grant_practice_access(
    locked_order.user_id,
    locked_order.practice_id,
    1,
    'purchase',
    jsonb_build_object(
      'order_id', locked_order.id,
      'granted_via', 'grant_practice_purchase_access'
    )
  );

  inserted := coalesce((grant_result ->> 'inserted')::boolean, false);
  inserted_count := CASE WHEN inserted THEN 1 ELSE 0 END;

  RETURN jsonb_build_object(
    'order_id', locked_order.id,
    'user_id', locked_order.user_id,
    'practice_id', locked_order.practice_id,
    'inserted', inserted,
    'library_rows_before', existing_count,
    'library_rows_after', existing_count + inserted_count,
    'access_level', coalesce((grant_result ->> 'access_level')::integer, 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_practice_purchase_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_practice_purchase_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.grant_practice_purchase_access(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_practice_purchase_access(uuid)
  TO service_role;

COMMENT ON FUNCTION public.grant_practice_purchase_access(uuid) IS
  'audiolad:purchase-grant:v2; Level-1 wrapper around grant_practice_access for paid orders. Same call shape as v1 for Tochka fulfill. Idempotent; never lowers an existing higher access_level. EXECUTE: service_role only.';

-- ===========================================================================
-- 6. Post-checks
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('public.practice_access_levels') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: practice_access_levels was not created';
  END IF;

  IF to_regprocedure('public.grant_practice_access(uuid, uuid, integer, text, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: grant_practice_access was not created';
  END IF;

  IF to_regprocedure('public.grant_practice_purchase_access(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: grant_practice_purchase_access missing';
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.grant_practice_access(uuid, uuid, integer, text, jsonb)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: service_role must EXECUTE grant_practice_access';
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.grant_practice_purchase_access(uuid)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: service_role must EXECUTE grant_practice_purchase_access';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.grant_practice_access(uuid, uuid, integer, text, jsonb)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not EXECUTE grant_practice_access';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.grant_practice_purchase_access(uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not EXECUTE grant_practice_purchase_access';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.grant_practice_access(uuid, uuid, integer, text, jsonb)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not EXECUTE grant_practice_access';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.grant_practice_purchase_access(uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not EXECUTE grant_practice_purchase_access';
  END IF;

  IF has_table_privilege('authenticated', 'public.user_practices', 'UPDATE') IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not UPDATE user_practices';
  END IF;

  IF has_table_privilege('authenticated', 'public.user_practices', 'INSERT') IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not INSERT user_practices';
  END IF;

  IF has_table_privilege('authenticated', 'public.practice_access_levels', 'INSERT') IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not INSERT practice_access_levels';
  END IF;

  IF has_table_privilege('authenticated', 'public.practice_access_levels', 'UPDATE') IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not UPDATE practice_access_levels';
  END IF;
END;
$$;

COMMIT;
