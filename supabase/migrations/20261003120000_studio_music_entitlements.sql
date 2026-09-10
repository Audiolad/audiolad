BEGIN;

-- PR1: Studio music license foundation.
-- Permanent publication-level Studio entitlement, separate from user_practices.
-- music_usage_permission gates NEW acquisition only.
-- Owner/editor use is a live author_members check (no stored owner row).
-- Refunds do not auto-revoke listen access today; this adds a matching
-- service_role hook (revoked_at) without a new refund system.

CREATE TABLE IF NOT EXISTS public.studio_music_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,

  practice_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE RESTRICT,

  grant_source text NOT NULL,
  order_id uuid NULL
    REFERENCES public.orders (id)
    ON DELETE RESTRICT,

  granted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  revoke_reason text NULL,

  CONSTRAINT studio_music_entitlements_grant_source_check
    CHECK (grant_source IN ('purchase', 'free', 'owner')),

  CONSTRAINT studio_music_entitlements_purchase_order_check
    CHECK (
      (grant_source = 'purchase' AND order_id IS NOT NULL)
      OR (grant_source <> 'purchase' AND order_id IS NULL)
    ),

  CONSTRAINT studio_music_entitlements_revoked_after_granted_check
    CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_music_entitlements_active_user_practice_uidx
  ON public.studio_music_entitlements (user_id, practice_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS studio_music_entitlements_practice_id_idx
  ON public.studio_music_entitlements (practice_id);

CREATE INDEX IF NOT EXISTS studio_music_entitlements_order_id_idx
  ON public.studio_music_entitlements (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS studio_music_entitlements_user_id_granted_at_idx
  ON public.studio_music_entitlements (user_id, granted_at DESC);

COMMENT ON TABLE public.studio_music_entitlements IS
  'audiolad:studio-music-entitlement:v1; publication-level Studio-use right. Separate from user_practices. Album = one row for practices.id (all audio_items). Active uniqueness is partial (revoked_at IS NULL). Later price/unpublish/permission changes do not revoke.';

COMMENT ON COLUMN public.studio_music_entitlements.grant_source IS
  'purchase = paid studio_music_license order; free = first factual acquire of is_free + platform_reuse_allowed; owner reserved (MVP uses live author_members instead of storing owner rows).';

COMMENT ON COLUMN public.studio_music_entitlements.revoked_at IS
  'Set only for a real revoke (refund hook / admin). Publication edits never set this. Already-exported Studio MP3s are not clawed back.';

ALTER TABLE public.studio_music_entitlements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.studio_music_entitlements FROM PUBLIC;
REVOKE ALL ON TABLE public.studio_music_entitlements FROM anon, authenticated;
GRANT SELECT ON TABLE public.studio_music_entitlements TO authenticated;
GRANT ALL ON TABLE public.studio_music_entitlements TO service_role;

DROP POLICY IF EXISTS "Users can view own studio music entitlements"
  ON public.studio_music_entitlements;
CREATE POLICY "Users can view own studio music entitlements"
  ON public.studio_music_entitlements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_studio_music_publication(
  p_practice public.practices
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_practice.product_kind IS NOT DISTINCT FROM 'music'
      OR p_practice.publication_class IS NOT DISTINCT FROM 'release';
$$;

COMMENT ON FUNCTION public.is_studio_music_publication(public.practices) IS
  'audiolad:studio-music-publication:v1; product_kind=music or publication_class=release.';

CREATE OR REPLACE FUNCTION public.has_studio_music_entitlement(
  p_user_id uuid,
  p_practice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND p_practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.studio_music_entitlements AS e
      WHERE e.user_id = p_user_id
        AND e.practice_id = p_practice_id
        AND e.revoked_at IS NULL
    );
$$;

COMMENT ON FUNCTION public.has_studio_music_entitlement(uuid, uuid) IS
  'audiolad:studio-music-entitlement:v1; active stored grant only. Does not live-check music_usage_permission or published status.';

CREATE OR REPLACE FUNCTION public.can_use_music_in_studio(
  p_user_id uuid,
  p_practice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND p_practice_id IS NOT NULL
    AND (
      public.has_studio_music_entitlement(p_user_id, p_practice_id)
      OR public.is_practice_author_member(p_practice_id, p_user_id)
    );
$$;

COMMENT ON FUNCTION public.can_use_music_in_studio(uuid, uuid) IS
  'audiolad:studio-music-use:v1; active entitlement OR live author_members owner/editor. Must not be used for ordinary listen / user_practices. Does not require current platform_reuse_allowed.';

CREATE OR REPLACE FUNCTION public.can_acquire_studio_music(
  p_practice public.practices,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_practice.id IS NULL OR p_practice.deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF p_practice.status IS DISTINCT FROM 'published' THEN
    RETURN false;
  END IF;

  IF NOT public.is_studio_music_publication(p_practice) THEN
    RETURN false;
  END IF;

  IF p_practice.music_usage_permission IS DISTINCT FROM 'platform_reuse_allowed' THEN
    RETURN false;
  END IF;

  IF NOT public.viewer_can_commercially_access_practice(p_practice, p_user_id) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.can_acquire_studio_music(public.practices, uuid) IS
  'audiolad:studio-music-acquire:v1; new grant gate only. Requires published music/release + platform_reuse_allowed + commercial visibility. Does not inspect existing entitlements.';

CREATE OR REPLACE FUNCTION public.can_acquire_studio_music_by_id(
  p_practice_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
BEGIN
  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN public.can_acquire_studio_music(v_practice, p_user_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Sale-lock: Studio entitlements lock audio the same way listener grants do.
-- Paid studio orders already match o.status='paid'. Free/active grants need
-- an explicit entitlement check so files cannot be yanked under entitled users.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.practice_is_content_locked_after_sale(
  p_practice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_practice_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.user_practices AS up
        WHERE up.practice_id = p_practice_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.orders AS o
        WHERE o.practice_id = p_practice_id
          AND o.status = 'paid'
      )
      OR EXISTS (
        SELECT 1
        FROM public.studio_music_entitlements AS e
        WHERE e.practice_id = p_practice_id
          AND e.revoked_at IS NULL
      )
    );
$$;

COMMENT ON FUNCTION public.practice_is_content_locked_after_sale(uuid) IS
  'audiolad:practice-sale-lock:v2; true when practice has listener entitlements, paid orders (any order_kind), or active studio_music_entitlements.';

-- ---------------------------------------------------------------------------
-- Grant / revoke (writes). Authenticated never writes the table directly.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_studio_music_entitlement(
  p_user_id uuid,
  p_practice_id uuid,
  p_grant_source text,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.studio_music_entitlements%ROWTYPE;
  v_new public.studio_music_entitlements%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_practice_id IS NULL THEN
    RAISE EXCEPTION 'studio_entitlement_target_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_grant_source IS DISTINCT FROM 'purchase'
     AND p_grant_source IS DISTINCT FROM 'free'
     AND p_grant_source IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'invalid_studio_grant_source'
      USING ERRCODE = '22023';
  END IF;

  IF p_grant_source = 'purchase' AND p_order_id IS NULL THEN
    RAISE EXCEPTION 'studio_purchase_order_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_grant_source <> 'purchase' AND p_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'studio_non_purchase_order_forbidden'
      USING ERRCODE = '22023';
  END IF;

  SELECT e.*
  INTO v_existing
  FROM public.studio_music_entitlements AS e
  WHERE e.user_id = p_user_id
    AND e.practice_id = p_practice_id
    AND e.revoked_at IS NULL
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'inserted', false,
      'id', v_existing.id,
      'user_id', v_existing.user_id,
      'practice_id', v_existing.practice_id,
      'grant_source', v_existing.grant_source,
      'order_id', v_existing.order_id,
      'granted_at', v_existing.granted_at
    );
  END IF;

  BEGIN
    INSERT INTO public.studio_music_entitlements (
      user_id,
      practice_id,
      grant_source,
      order_id
    )
    VALUES (
      p_user_id,
      p_practice_id,
      p_grant_source,
      p_order_id
    )
    RETURNING * INTO v_new;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT e.*
      INTO v_existing
      FROM public.studio_music_entitlements AS e
      WHERE e.user_id = p_user_id
        AND e.practice_id = p_practice_id
        AND e.revoked_at IS NULL;

      IF NOT FOUND THEN
        RAISE;
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'inserted', false,
        'id', v_existing.id,
        'user_id', v_existing.user_id,
        'practice_id', v_existing.practice_id,
        'grant_source', v_existing.grant_source,
        'order_id', v_existing.order_id,
        'granted_at', v_existing.granted_at
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', true,
    'id', v_new.id,
    'user_id', v_new.user_id,
    'practice_id', v_new.practice_id,
    'grant_source', v_new.grant_source,
    'order_id', v_new.order_id,
    'granted_at', v_new.granted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_studio_music_purchase_entitlement(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  locked_order public.orders%ROWTYPE;
  v_grant jsonb;
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

  IF coalesce(locked_order.order_kind, 'product_purchase')
       IS DISTINCT FROM 'studio_music_license' THEN
    RAISE EXCEPTION 'not_studio_music_license'
      USING ERRCODE = '22023';
  END IF;

  v_grant := public.grant_studio_music_entitlement(
    locked_order.user_id,
    locked_order.practice_id,
    'purchase',
    locked_order.id
  );

  RETURN v_grant || jsonb_build_object('order_id', locked_order.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_studio_music_entitlement(
  p_user_id uuid,
  p_practice_id uuid,
  p_reason text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.studio_music_entitlements%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_practice_id IS NULL THEN
    RAISE EXCEPTION 'studio_entitlement_target_required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.studio_music_entitlements AS e
  SET
    revoked_at = now(),
    revoke_reason = nullif(btrim(coalesce(p_reason, '')), '')
  WHERE e.user_id = p_user_id
    AND e.practice_id = p_practice_id
    AND e.revoked_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'revoked', false,
      'user_id', p_user_id,
      'practice_id', p_practice_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'revoked', true,
    'id', v_row.id,
    'user_id', v_row.user_id,
    'practice_id', v_row.practice_id,
    'revoke_reason', v_row.revoke_reason,
    'revoked_at', v_row.revoked_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_studio_music_entitlement_for_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF coalesce(v_order.order_kind, 'product_purchase')
       IS DISTINCT FROM 'studio_music_license' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'revoked', false,
      'reason', 'not_studio_music_license',
      'order_id', v_order.id
    );
  END IF;

  RETURN public.revoke_studio_music_entitlement(
    v_order.user_id,
    v_order.practice_id,
    'refund'
  ) || jsonb_build_object('order_id', v_order.id);
END;
$$;

REVOKE ALL ON FUNCTION public.is_studio_music_publication(public.practices) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_studio_music_publication(public.practices)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_studio_music_entitlement(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_studio_music_entitlement(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_studio_music_entitlement(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_use_music_in_studio(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_music_in_studio(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_use_music_in_studio(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_acquire_studio_music(public.practices, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_acquire_studio_music(public.practices, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_acquire_studio_music(public.practices, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_acquire_studio_music_by_id(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_acquire_studio_music_by_id(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_acquire_studio_music_by_id(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.grant_studio_music_entitlement(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_studio_music_entitlement(uuid, uuid, text, uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_studio_music_entitlement(uuid, uuid, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.grant_studio_music_purchase_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_studio_music_purchase_entitlement(uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_studio_music_purchase_entitlement(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.revoke_studio_music_entitlement(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_studio_music_entitlement(uuid, uuid, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_studio_music_entitlement(uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.revoke_studio_music_entitlement_for_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_studio_music_entitlement_for_order(uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_studio_music_entitlement_for_order(uuid)
  TO service_role;

DO $$
BEGIN
  IF to_regclass('public.studio_music_entitlements') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: studio_music_entitlements missing';
  END IF;

  IF to_regprocedure('public.has_studio_music_entitlement(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: has_studio_music_entitlement missing';
  END IF;

  IF to_regprocedure('public.can_use_music_in_studio(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: can_use_music_in_studio missing';
  END IF;

  IF to_regprocedure('public.grant_studio_music_purchase_entitlement(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: grant_studio_music_purchase_entitlement missing';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.grant_studio_music_purchase_entitlement(uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not grant studio purchase entitlements';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.revoke_studio_music_entitlement(uuid, uuid, text)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not revoke studio entitlements';
  END IF;
END
$$;

COMMIT;
