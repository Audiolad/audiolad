BEGIN;

-- Recreate create_practice_order to resolve promotions and snapshot them.
-- Extra args are defaulted so existing 6-arg callers keep working.

DROP FUNCTION IF EXISTS public.create_practice_order(text, uuid, uuid, text, text, uuid);

CREATE FUNCTION public.create_practice_order(
  p_practice_slug text,
  p_idempotency_key uuid,
  p_analytics_session_id uuid DEFAULT NULL,
  p_analytics_anonymous_id text DEFAULT NULL,
  p_checkout_origin_path text DEFAULT NULL,
  p_buy_click_client_event_id uuid DEFAULT NULL,
  p_expected_amount_minor bigint DEFAULT NULL,
  p_price_visitor_id text DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  practice_id uuid,
  practice_slug text,
  status text,
  amount_minor bigint,
  currency text,
  created_at timestamptz,
  attribution_confidence text,
  buy_click_linked boolean,
  buy_click_link_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_price_minor bigint;
  v_base_price_minor bigint;
  v_promotion_price_minor bigint;
  v_promotion_id uuid;
  v_promotion_type text;
  v_resolved record;
  v_idempotency_key text;
  v_existing public.orders%ROWTYPE;
  v_new_order public.orders%ROWTYPE;
  v_attr record;
  v_click record;
  v_link_reason text := 'missing_client_event_id';
  v_session_for_click uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_slug IS NULL OR btrim(p_practice_slug) = '' THEN
    RAISE EXCEPTION 'practice_slug_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required'
      USING ERRCODE = '22023';
  END IF;

  v_idempotency_key := p_idempotency_key::text;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.slug = p_practice_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_published'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.is_free IS TRUE
     OR v_practice.price IS NULL
     OR v_practice.price <= 0 THEN
    RAISE EXCEPTION 'practice_not_for_sale'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_resolved
  FROM public.resolve_practice_effective_price(
    v_practice.id,
    'checkout',
    p_price_visitor_id,
    v_user_id,
    now()
  );

  IF v_resolved.final_price_minor IS NULL OR v_resolved.final_price_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_practice_price'
      USING ERRCODE = '22023';
  END IF;

  v_price_minor := v_resolved.final_price_minor;
  v_base_price_minor := v_resolved.base_price_minor;
  v_promotion_price_minor := v_resolved.sale_price_minor;
  v_promotion_id := v_resolved.promotion_id;
  v_promotion_type := v_resolved.promotion_type;

  IF p_expected_amount_minor IS NOT NULL
     AND p_expected_amount_minor IS DISTINCT FROM v_price_minor THEN
    RAISE EXCEPTION 'price_changed'
      USING ERRCODE = 'P0001',
            DETAIL = format(
              'current_amount_minor=%s;base_price_minor=%s;promotion_price_minor=%s;promotion_id=%s;promotion_type=%s',
              v_price_minor,
              v_base_price_minor,
              coalesce(v_promotion_price_minor::text, ''),
              coalesce(v_promotion_id::text, ''),
              coalesce(v_promotion_type, '')
            );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_practices AS up
    WHERE up.user_id = v_user_id
      AND up.practice_id = v_practice.id
      AND (up.expires_at IS NULL OR up.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'already_owned'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_attr
  FROM public.resolve_order_attribution_snapshot(
    v_user_id,
    p_analytics_session_id,
    p_analytics_anonymous_id,
    p_checkout_origin_path
  );

  v_session_for_click := CASE WHEN v_attr.ok THEN v_attr.analytics_session_id ELSE NULL END;

  SELECT *
  INTO v_click
  FROM public.resolve_buy_click_for_order(
    v_user_id,
    v_practice.id,
    v_session_for_click,
    p_buy_click_client_event_id,
    now()
  );
  v_link_reason := coalesce(v_click.reason, 'missing_client_event_id');

  -- Idempotency replay
  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'idempotency_key_conflict'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.practice_id IS DISTINCT FROM v_practice.id THEN
      RAISE EXCEPTION 'idempotency_key_practice_mismatch'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.status = 'pending'
       AND v_existing.attribution_captured_at IS NULL
       AND v_attr.ok THEN
      UPDATE public.orders AS o
      SET
        analytics_session_id = v_attr.analytics_session_id,
        analytics_anonymous_id = v_attr.analytics_anonymous_id,
        attribution_user_id = v_attr.attribution_user_id,
        session_utm_source = v_attr.session_utm_source,
        session_utm_medium = v_attr.session_utm_medium,
        session_utm_campaign = v_attr.session_utm_campaign,
        session_utm_content = v_attr.session_utm_content,
        session_utm_term = v_attr.session_utm_term,
        session_referrer_domain = v_attr.session_referrer_domain,
        session_landing_path = v_attr.session_landing_path,
        checkout_origin_path = v_attr.checkout_origin_path,
        attribution_captured_at = now(),
        attribution_confidence = 'exact',
        author_id_snapshot = coalesce(o.author_id_snapshot, v_practice.author_id),
        updated_at = now()
      WHERE o.id = v_existing.id
        AND o.attribution_captured_at IS NULL
        AND o.status = 'pending'
      RETURNING * INTO v_existing;
      v_session_for_click := v_existing.analytics_session_id;
    END IF;

    -- Fill click link once on pending unlinked order (immutable thereafter)
    IF v_existing.status = 'pending'
       AND v_existing.buy_click_event_id IS NULL
       AND v_click.ok THEN
      BEGIN
        UPDATE public.orders AS o
        SET
          buy_click_event_id = v_click.event_id,
          buy_click_client_event_id = v_click.client_event_id,
          buy_click_occurred_at = v_click.occurred_at,
          purchase_surface = v_click.purchase_surface,
          updated_at = now()
        WHERE o.id = v_existing.id
          AND o.status = 'pending'
          AND o.buy_click_event_id IS NULL
        RETURNING * INTO v_existing;
      EXCEPTION
        WHEN unique_violation THEN
          v_link_reason := 'already_linked';
      END;
    ELSIF v_existing.buy_click_event_id IS NOT NULL THEN
      v_link_reason := 'already_linked_preserved';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.practice_id,
      v_existing.practice_slug_snapshot,
      v_existing.status,
      v_existing.amount_minor,
      v_existing.currency,
      v_existing.created_at,
      v_existing.attribution_confidence,
      (v_existing.buy_click_event_id IS NOT NULL),
      CASE
        WHEN v_existing.buy_click_event_id IS NOT NULL THEN 'linked'
        ELSE v_link_reason
      END;
    RETURN;
  END IF;

  -- Reuse existing pending order for same user+practice
  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.user_id = v_user_id
    AND o.practice_id = v_practice.id
    AND o.status = 'pending'
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.attribution_captured_at IS NULL AND v_attr.ok THEN
      UPDATE public.orders AS o
      SET
        analytics_session_id = v_attr.analytics_session_id,
        analytics_anonymous_id = v_attr.analytics_anonymous_id,
        attribution_user_id = v_attr.attribution_user_id,
        session_utm_source = v_attr.session_utm_source,
        session_utm_medium = v_attr.session_utm_medium,
        session_utm_campaign = v_attr.session_utm_campaign,
        session_utm_content = v_attr.session_utm_content,
        session_utm_term = v_attr.session_utm_term,
        session_referrer_domain = v_attr.session_referrer_domain,
        session_landing_path = v_attr.session_landing_path,
        checkout_origin_path = v_attr.checkout_origin_path,
        attribution_captured_at = now(),
        attribution_confidence = 'exact',
        author_id_snapshot = coalesce(o.author_id_snapshot, v_practice.author_id),
        updated_at = now()
      WHERE o.id = v_existing.id
        AND o.attribution_captured_at IS NULL
        AND o.status = 'pending'
      RETURNING * INTO v_existing;
    ELSIF v_existing.author_id_snapshot IS NULL THEN
      UPDATE public.orders AS o
      SET
        author_id_snapshot = v_practice.author_id,
        updated_at = now()
      WHERE o.id = v_existing.id
        AND o.author_id_snapshot IS NULL
      RETURNING * INTO v_existing;
    END IF;

    IF v_existing.buy_click_event_id IS NULL AND v_click.ok THEN
      -- Re-resolve against possibly updated session
      SELECT *
      INTO v_click
      FROM public.resolve_buy_click_for_order(
        v_user_id,
        v_practice.id,
        v_existing.analytics_session_id,
        p_buy_click_client_event_id,
        v_existing.created_at
      );
      v_link_reason := coalesce(v_click.reason, v_link_reason);

      IF v_click.ok THEN
        BEGIN
          UPDATE public.orders AS o
          SET
            buy_click_event_id = v_click.event_id,
            buy_click_client_event_id = v_click.client_event_id,
            buy_click_occurred_at = v_click.occurred_at,
            purchase_surface = v_click.purchase_surface,
            updated_at = now()
          WHERE o.id = v_existing.id
            AND o.status = 'pending'
            AND o.buy_click_event_id IS NULL
          RETURNING * INTO v_existing;
        EXCEPTION
          WHEN unique_violation THEN
            v_link_reason := 'already_linked';
        END;
      END IF;
    ELSIF v_existing.buy_click_event_id IS NOT NULL THEN
      v_link_reason := 'already_linked_preserved';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.practice_id,
      v_existing.practice_slug_snapshot,
      v_existing.status,
      v_existing.amount_minor,
      v_existing.currency,
      v_existing.created_at,
      v_existing.attribution_confidence,
      (v_existing.buy_click_event_id IS NOT NULL),
      CASE
        WHEN v_existing.buy_click_event_id IS NOT NULL THEN 'linked'
        ELSE v_link_reason
      END;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.orders (
      user_id,
      practice_id,
      status,
      amount_minor,
      currency,
      practice_title_snapshot,
      practice_slug_snapshot,
      price_minor_snapshot,
      base_price_minor_snapshot,
      promotion_price_minor_snapshot,
      promotion_id,
      promotion_type,
      idempotency_key,
      analytics_session_id,
      analytics_anonymous_id,
      attribution_user_id,
      session_utm_source,
      session_utm_medium,
      session_utm_campaign,
      session_utm_content,
      session_utm_term,
      session_referrer_domain,
      session_landing_path,
      checkout_origin_path,
      attribution_captured_at,
      attribution_confidence,
      author_id_snapshot,
      buy_click_event_id,
      buy_click_client_event_id,
      buy_click_occurred_at,
      purchase_surface
    )
    VALUES (
      v_user_id,
      v_practice.id,
      'pending',
      v_price_minor,
      'RUB',
      v_practice.title,
      v_practice.slug,
      v_price_minor,
      v_base_price_minor,
      v_promotion_price_minor,
      v_promotion_id,
      v_promotion_type,
      v_idempotency_key,
      CASE WHEN v_attr.ok THEN v_attr.analytics_session_id ELSE NULL END,
      CASE WHEN v_attr.ok THEN v_attr.analytics_anonymous_id ELSE NULL END,
      CASE WHEN v_attr.ok THEN v_attr.attribution_user_id ELSE NULL END,
      CASE WHEN v_attr.ok THEN v_attr.session_utm_source ELSE NULL END,
      CASE WHEN v_attr.ok THEN v_attr.session_utm_medium ELSE NULL END,
      CASE WHEN v_attr.ok THEN v_attr.session_utm_campaign ELSE NULL END,
      CASE WHEN v_attr.ok THEN v_attr.session_utm_content ELSE NULL END,
      CASE WHEN v_attr.ok THEN v_attr.session_utm_term ELSE NULL END,
      CASE WHEN v_attr.ok THEN v_attr.session_referrer_domain ELSE NULL END,
      CASE WHEN v_attr.ok THEN v_attr.session_landing_path ELSE NULL END,
      coalesce(
        CASE WHEN v_attr.ok THEN v_attr.checkout_origin_path ELSE NULL END,
        public.sanitize_checkout_origin_path(p_checkout_origin_path)
      ),
      CASE WHEN v_attr.ok THEN now() ELSE NULL END,
      CASE WHEN v_attr.ok THEN 'exact' ELSE 'unknown' END,
      v_practice.author_id,
      CASE WHEN v_click.ok THEN v_click.event_id ELSE NULL END,
      CASE WHEN v_click.ok THEN v_click.client_event_id ELSE NULL END,
      CASE WHEN v_click.ok THEN v_click.occurred_at ELSE NULL END,
      CASE WHEN v_click.ok THEN v_click.purchase_surface ELSE NULL END
    )
    RETURNING * INTO v_new_order;

  EXCEPTION
    WHEN unique_violation THEN
      -- Click uniqueness race: retry insert without click link
      BEGIN
        INSERT INTO public.orders (
          user_id,
          practice_id,
          status,
          amount_minor,
          currency,
          practice_title_snapshot,
          practice_slug_snapshot,
          price_minor_snapshot,
          base_price_minor_snapshot,
          promotion_price_minor_snapshot,
          promotion_id,
          promotion_type,
          idempotency_key,
          analytics_session_id,
          analytics_anonymous_id,
          attribution_user_id,
          session_utm_source,
          session_utm_medium,
          session_utm_campaign,
          session_utm_content,
          session_utm_term,
          session_referrer_domain,
          session_landing_path,
          checkout_origin_path,
          attribution_captured_at,
          attribution_confidence,
          author_id_snapshot
        )
        VALUES (
          v_user_id,
          v_practice.id,
          'pending',
          v_price_minor,
          'RUB',
          v_practice.title,
          v_practice.slug,
          v_price_minor,
          v_base_price_minor,
          v_promotion_price_minor,
          v_promotion_id,
          v_promotion_type,
          v_idempotency_key,
          CASE WHEN v_attr.ok THEN v_attr.analytics_session_id ELSE NULL END,
          CASE WHEN v_attr.ok THEN v_attr.analytics_anonymous_id ELSE NULL END,
          CASE WHEN v_attr.ok THEN v_attr.attribution_user_id ELSE NULL END,
          CASE WHEN v_attr.ok THEN v_attr.session_utm_source ELSE NULL END,
          CASE WHEN v_attr.ok THEN v_attr.session_utm_medium ELSE NULL END,
          CASE WHEN v_attr.ok THEN v_attr.session_utm_campaign ELSE NULL END,
          CASE WHEN v_attr.ok THEN v_attr.session_utm_content ELSE NULL END,
          CASE WHEN v_attr.ok THEN v_attr.session_utm_term ELSE NULL END,
          CASE WHEN v_attr.ok THEN v_attr.session_referrer_domain ELSE NULL END,
          CASE WHEN v_attr.ok THEN v_attr.session_landing_path ELSE NULL END,
          coalesce(
            CASE WHEN v_attr.ok THEN v_attr.checkout_origin_path ELSE NULL END,
            public.sanitize_checkout_origin_path(p_checkout_origin_path)
          ),
          CASE WHEN v_attr.ok THEN now() ELSE NULL END,
          CASE WHEN v_attr.ok THEN 'exact' ELSE 'unknown' END,
          v_practice.author_id
        )
        RETURNING * INTO v_new_order;
        v_link_reason := 'already_linked';
      EXCEPTION
        WHEN unique_violation THEN
          SELECT o.*
          INTO v_existing
          FROM public.orders AS o
          WHERE o.idempotency_key = v_idempotency_key;

          IF FOUND THEN
            RETURN QUERY
            SELECT
              v_existing.id,
              v_existing.practice_id,
              v_existing.practice_slug_snapshot,
              v_existing.status,
              v_existing.amount_minor,
              v_existing.currency,
              v_existing.created_at,
              v_existing.attribution_confidence,
              (v_existing.buy_click_event_id IS NOT NULL),
              CASE
                WHEN v_existing.buy_click_event_id IS NOT NULL THEN 'linked'
                ELSE 'idempotent_replay'
              END;
            RETURN;
          END IF;

          SELECT o.*
          INTO v_existing
          FROM public.orders AS o
          WHERE o.user_id = v_user_id
            AND o.practice_id = v_practice.id
            AND o.status = 'pending'
          ORDER BY o.created_at DESC
          LIMIT 1;

          IF FOUND THEN
            RAISE EXCEPTION 'pending_order_exists'
              USING ERRCODE = '23505',
                HINT = format('existing_order_id=%s', v_existing.id);
          END IF;

          RAISE;
      END;
  END;

  RETURN QUERY
  SELECT
    v_new_order.id,
    v_new_order.practice_id,
    v_new_order.practice_slug_snapshot,
    v_new_order.status,
    v_new_order.amount_minor,
    v_new_order.currency,
    v_new_order.created_at,
    v_new_order.attribution_confidence,
    (v_new_order.buy_click_event_id IS NOT NULL),
    CASE
      WHEN v_new_order.buy_click_event_id IS NOT NULL THEN 'linked'
      ELSE v_link_reason
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text, uuid, bigint, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text, uuid, bigint, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text, uuid, bigint, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text, uuid, bigint, text) IS
  'audiolad:create-order:price-promotions; pending order + server-resolved sale price + expected-amount race check + promotion snapshots';

COMMIT;
