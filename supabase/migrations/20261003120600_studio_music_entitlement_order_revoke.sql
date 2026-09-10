BEGIN;

-- PR1 follow-up: order-specific Studio revoke + no re-grant of a revoked order.
-- Additive on top of 20261003120000. Does not change acquire/price/finance rules.

-- One purchase entitlement row per order, including after revoke.
-- A later lawful order B still gets its own row (different order_id).
CREATE UNIQUE INDEX IF NOT EXISTS studio_music_entitlements_order_id_uidx
  ON public.studio_music_entitlements (order_id)
  WHERE order_id IS NOT NULL;

DROP INDEX IF EXISTS public.studio_music_entitlements_order_id_idx;

COMMENT ON INDEX public.studio_music_entitlements_order_id_uidx IS
  'audiolad:studio-music-entitlement-order:v1; one row per order_id (active or revoked). Blocks fulfill replay from inserting a second grant for the same paid order.';

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

  -- Same order_id never creates a second row, even if the first was revoked.
  IF p_order_id IS NOT NULL THEN
    SELECT e.*
    INTO v_existing
    FROM public.studio_music_entitlements AS e
    WHERE e.order_id = p_order_id
    FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'inserted', false,
        'already_revoked', v_existing.revoked_at IS NOT NULL,
        'id', v_existing.id,
        'user_id', v_existing.user_id,
        'practice_id', v_existing.practice_id,
        'grant_source', v_existing.grant_source,
        'order_id', v_existing.order_id,
        'granted_at', v_existing.granted_at,
        'revoked_at', v_existing.revoked_at
      );
    END IF;
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
      'already_revoked', false,
      'id', v_existing.id,
      'user_id', v_existing.user_id,
      'practice_id', v_existing.practice_id,
      'grant_source', v_existing.grant_source,
      'order_id', v_existing.order_id,
      'granted_at', v_existing.granted_at,
      'revoked_at', v_existing.revoked_at
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
      IF p_order_id IS NOT NULL THEN
        SELECT e.*
        INTO v_existing
        FROM public.studio_music_entitlements AS e
        WHERE e.order_id = p_order_id;

        IF FOUND THEN
          RETURN jsonb_build_object(
            'ok', true,
            'inserted', false,
            'already_revoked', v_existing.revoked_at IS NOT NULL,
            'id', v_existing.id,
            'user_id', v_existing.user_id,
            'practice_id', v_existing.practice_id,
            'grant_source', v_existing.grant_source,
            'order_id', v_existing.order_id,
            'granted_at', v_existing.granted_at,
            'revoked_at', v_existing.revoked_at
          );
        END IF;
      END IF;

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
        'already_revoked', false,
        'id', v_existing.id,
        'user_id', v_existing.user_id,
        'practice_id', v_existing.practice_id,
        'grant_source', v_existing.grant_source,
        'order_id', v_existing.order_id,
        'granted_at', v_existing.granted_at,
        'revoked_at', v_existing.revoked_at
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', true,
    'already_revoked', false,
    'id', v_new.id,
    'user_id', v_new.user_id,
    'practice_id', v_new.practice_id,
    'grant_source', v_new.grant_source,
    'order_id', v_new.order_id,
    'granted_at', v_new.granted_at,
    'revoked_at', v_new.revoked_at
  );
END;
$$;

COMMENT ON FUNCTION public.grant_studio_music_entitlement(uuid, uuid, text, uuid) IS
  'audiolad:studio-music-grant:v2; purchase rows are keyed by order_id. A revoked order is never re-inserted. A new order_id may grant again for the same user+practice. Free/owner grants never attach an order_id.';

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
  v_row public.studio_music_entitlements%ROWTYPE;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'studio_entitlement_order_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;

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

  -- Order-specific only. Must not revoke another order, a newer repurchase,
  -- grant_source=free, or live owner/editor membership.
  UPDATE public.studio_music_entitlements AS e
  SET
    revoked_at = now(),
    revoke_reason = 'refund'
  WHERE e.order_id = p_order_id
    AND e.revoked_at IS NULL
    AND e.grant_source = 'purchase'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'revoked', false,
      'order_id', v_order.id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'revoked', true,
    'id', v_row.id,
    'user_id', v_row.user_id,
    'practice_id', v_row.practice_id,
    'grant_source', v_row.grant_source,
    'order_id', v_row.order_id,
    'revoke_reason', v_row.revoke_reason,
    'revoked_at', v_row.revoked_at
  );
END;
$$;

COMMENT ON FUNCTION public.revoke_studio_music_entitlement_for_order(uuid) IS
  'audiolad:studio-music-revoke-order:v2; UPDATE ... WHERE order_id = p_order_id AND revoked_at IS NULL. Never resolves the current active user+practice row.';

REVOKE ALL ON FUNCTION public.grant_studio_music_entitlement(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_studio_music_entitlement(uuid, uuid, text, uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_studio_music_entitlement(uuid, uuid, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.revoke_studio_music_entitlement_for_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_studio_music_entitlement_for_order(uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_studio_music_entitlement_for_order(uuid)
  TO service_role;

DO $$
BEGIN
  IF to_regclass('public.studio_music_entitlements_order_id_uidx') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: studio_music_entitlements_order_id_uidx missing';
  END IF;

  IF to_regprocedure('public.revoke_studio_music_entitlement_for_order(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: revoke_studio_music_entitlement_for_order missing';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.revoke_studio_music_entitlement_for_order(uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not revoke studio entitlements by order';
  END IF;
END
$$;

COMMIT;
