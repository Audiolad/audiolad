-- P3.2.1: buy_clicked event + validated click→order linkage + path funnel RPCs.
-- Does NOT backfill historical click links as exact.
-- Does NOT change P3.1 money SoT / P3.0 fulfill.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Event allowlist: buy_clicked
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_analytics_event(p_event_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(COALESCE(p_event_name, '')) IN (
    'page_view',
    'practice_view',
    'listen_page_view',
    'audio_play_started',
    'audio_progress_25',
    'audio_progress_50',
    'audio_progress_75',
    'audio_progress_90',
    'audio_completed',
    'signup_started',
    'signup_completed',
    'author_application_started',
    'author_application_submitted',
    'first_manual_library_save',
    'first_save_retention_prompt_shown',
    'first_save_retention_prompt_library_clicked',
    'first_save_retention_prompt_install_clicked',
    'first_save_retention_prompt_dismissed',
    'topic_page_viewed',
    'topic_product_clicked',
    'article_view',
    'article_audio_play',
    'article_practice_open',
    'article_practice_save',
    'article_topic_click',
    'article_related_practice_click',
    'article_toc_click',
    'article_final_audio_click',
    'buy_clicked'
  );
$$;

COMMENT ON FUNCTION public.is_platform_analytics_event IS
  'audiolad:platform-analytics:v1; allowlisted platform event names including buy_clicked (P3.2.1)';

DO $$
BEGIN
  IF public.is_platform_analytics_event('buy_clicked') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: buy_clicked not allowlisted';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) Order click-link columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS buy_click_event_id uuid NULL,
  ADD COLUMN IF NOT EXISTS buy_click_client_event_id uuid NULL,
  ADD COLUMN IF NOT EXISTS buy_click_occurred_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS purchase_surface text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_buy_click_event_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_buy_click_event_id_fkey
      FOREIGN KEY (buy_click_event_id)
      REFERENCES public.analytics_events (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_purchase_surface_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_purchase_surface_check
      CHECK (
        purchase_surface IS NULL
        OR purchase_surface IN (
          'practice_page',
          'preview',
          'catalog_card',
          'playlist',
          'author_page',
          'unknown'
        )
      );
  END IF;
END
$$;

-- One event → one order (exact linkage)
CREATE UNIQUE INDEX IF NOT EXISTS orders_buy_click_event_id_uidx
  ON public.orders (buy_click_event_id)
  WHERE buy_click_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_buy_click_client_event_id_uidx
  ON public.orders (buy_click_client_event_id)
  WHERE buy_click_client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_purchase_surface_created_at_idx
  ON public.orders (purchase_surface, created_at DESC)
  WHERE purchase_surface IS NOT NULL;

COMMENT ON COLUMN public.orders.buy_click_event_id IS
  'audiolad:p321; validated analytics_events.id for buy_clicked; immutable once set; null = unlinked';
COMMENT ON COLUMN public.orders.buy_click_client_event_id IS
  'audiolad:p321; client_event_id of validated buy_clicked; one-to-one with orders';
COMMENT ON COLUMN public.orders.buy_click_occurred_at IS
  'audiolad:p321; occurred_at of linked buy_clicked event';
COMMENT ON COLUMN public.orders.purchase_surface IS
  'audiolad:p321; allowlisted purchase surface from validated buy click';

-- ---------------------------------------------------------------------------
-- 3) Normalize purchase_surface
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_purchase_surface(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_value, '')) IN (
      'practice_page', 'preview', 'catalog_card', 'playlist', 'author_page', 'unknown'
    ) THEN btrim(p_value)
    ELSE 'unknown'
  END;
$$;

REVOKE ALL ON FUNCTION public.normalize_purchase_surface(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_purchase_surface(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_purchase_surface(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Resolve validated buy click for order linkage
-- Freshness window: 15 minutes. No nearest-click inference.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_buy_click_for_order(
  p_user_id uuid,
  p_practice_id uuid,
  p_analytics_session_id uuid,
  p_buy_click_client_event_id uuid,
  p_order_created_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  ok boolean,
  reason text,
  event_id uuid,
  client_event_id uuid,
  occurred_at timestamptz,
  purchase_surface text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.analytics_events%ROWTYPE;
  v_surface text;
  v_identity_ok boolean := false;
  v_order_at timestamptz;
BEGIN
  v_order_at := coalesce(p_order_created_at, now());

  IF p_buy_click_client_event_id IS NULL THEN
    RETURN QUERY SELECT false, 'missing_client_event_id'::text,
      NULL::uuid, NULL::uuid, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  IF p_analytics_session_id IS NULL THEN
    RETURN QUERY SELECT false, 'missing_order_session'::text,
      NULL::uuid, NULL::uuid, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  SELECT e.*
  INTO v_event
  FROM public.analytics_events AS e
  WHERE e.client_event_id = p_buy_click_client_event_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'event_missing'::text,
      NULL::uuid, NULL::uuid, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  IF v_event.event_name IS DISTINCT FROM 'buy_clicked' THEN
    RETURN QUERY SELECT false, 'invalid_event_type'::text,
      v_event.id, v_event.client_event_id, v_event.occurred_at, NULL::text;
    RETURN;
  END IF;

  IF v_event.practice_id IS DISTINCT FROM p_practice_id THEN
    RETURN QUERY SELECT false, 'practice_mismatch'::text,
      v_event.id, v_event.client_event_id, v_event.occurred_at, NULL::text;
    RETURN;
  END IF;

  IF v_event.session_id IS DISTINCT FROM p_analytics_session_id THEN
    RETURN QUERY SELECT false, 'session_mismatch'::text,
      v_event.id, v_event.client_event_id, v_event.occurred_at, NULL::text;
    RETURN;
  END IF;

  -- Identity: event user, or active identity link on event anonymous id
  IF v_event.user_id IS NOT NULL THEN
    v_identity_ok := (v_event.user_id = p_user_id);
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.analytics_identity_links AS l
      WHERE l.anonymous_id = v_event.anonymous_session_id
        AND l.user_id = p_user_id
        AND l.unlinked_at IS NULL
    )
    INTO v_identity_ok;
  END IF;

  IF NOT v_identity_ok THEN
    RETURN QUERY SELECT false, 'identity_mismatch'::text,
      v_event.id, v_event.client_event_id, v_event.occurred_at, NULL::text;
    RETURN;
  END IF;

  IF v_event.occurred_at > v_order_at + interval '5 seconds' THEN
    RETURN QUERY SELECT false, 'event_after_order'::text,
      v_event.id, v_event.client_event_id, v_event.occurred_at, NULL::text;
    RETURN;
  END IF;

  IF v_event.occurred_at < (v_order_at - interval '15 minutes') THEN
    RETURN QUERY SELECT false, 'stale_click'::text,
      v_event.id, v_event.client_event_id, v_event.occurred_at, NULL::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.buy_click_event_id = v_event.id
       OR o.buy_click_client_event_id = v_event.client_event_id
  ) THEN
    RETURN QUERY SELECT false, 'already_linked'::text,
      v_event.id, v_event.client_event_id, v_event.occurred_at, NULL::text;
    RETURN;
  END IF;

  v_surface := public.normalize_purchase_surface(
    coalesce(v_event.payload->>'purchase_surface', 'unknown')
  );

  RETURN QUERY SELECT
    true,
    'linked'::text,
    v_event.id,
    v_event.client_event_id,
    v_event.occurred_at,
    v_surface;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_buy_click_for_order(uuid, uuid, uuid, uuid, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_buy_click_for_order(uuid, uuid, uuid, uuid, timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_buy_click_for_order(uuid, uuid, uuid, uuid, timestamptz)
  TO service_role;
-- Also needed inside create_practice_order (SECURITY DEFINER as owner)

COMMENT ON FUNCTION public.resolve_buy_click_for_order(uuid, uuid, uuid, uuid, timestamptz) IS
  'audiolad:p321; server-validated buy_clicked→order link; never trusts arbitrary event ids';

-- ---------------------------------------------------------------------------
-- 5) create_practice_order extended with atomic click linkage
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_practice_order(text, uuid, uuid, text, text);

CREATE FUNCTION public.create_practice_order(
  p_practice_slug text,
  p_idempotency_key uuid,
  p_analytics_session_id uuid DEFAULT NULL,
  p_analytics_anonymous_id text DEFAULT NULL,
  p_checkout_origin_path text DEFAULT NULL,
  p_buy_click_client_event_id uuid DEFAULT NULL
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

  v_price_minor := v_practice.price::bigint * 100;

  IF v_price_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_practice_price'
      USING ERRCODE = '22023';
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

REVOKE ALL ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text, uuid) IS
  'audiolad:create-order:p321; pending order + optional exact session snapshot + optional validated buy_clicked link; auth.uid()';

-- ---------------------------------------------------------------------------
-- 6) Path funnel RPCs (order cohort methodology)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_analytics_p321_path_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_practice_id uuid DEFAULT NULL,
  p_purchase_surface text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_surface text := CASE
    WHEN p_purchase_surface IS NULL OR btrim(p_purchase_surface) = '' THEN NULL
    ELSE public.normalize_purchase_surface(p_purchase_surface)
  END;
  v_paid_views integer;
  v_unique_viewers integer;
  v_buy_clicks integer;
  v_unique_clickers integer;
  v_orders integer;
  v_click_linked integer;
  v_session_exact integer;
  v_unknown_hist integer;
  v_payment_attempts integer;
  v_succeeded integer;
  v_buyers integer;
  v_gross bigint;
  v_access integer;
  v_first_play integer;
  v_orders_without_click integer;
BEGIN
  -- Engagement (step-period): views / clicks by occurred_at
  SELECT
    count(*)::integer,
    count(DISTINCT coalesce(e.user_id::text, e.anonymous_session_id))::integer
  INTO v_paid_views, v_unique_viewers
  FROM public.analytics_events AS e
  JOIN public.practices AS pr ON pr.id = e.practice_id
  WHERE e.event_name = 'practice_view'
    AND pr.is_free IS DISTINCT FROM true
    AND coalesce(pr.price, 0) > 0
    AND (p_include_test OR coalesce(e.is_test, false) = false)
    AND coalesce(e.is_bot, false) = false
    AND (p_from IS NULL OR e.occurred_at >= p_from)
    AND (p_to IS NULL OR e.occurred_at < p_to)
    AND (p_practice_id IS NULL OR e.practice_id = p_practice_id);

  SELECT
    count(*)::integer,
    count(DISTINCT coalesce(e.user_id::text, e.anonymous_session_id))::integer
  INTO v_buy_clicks, v_unique_clickers
  FROM public.analytics_events AS e
  WHERE e.event_name = 'buy_clicked'
    AND (p_include_test OR coalesce(e.is_test, false) = false)
    AND coalesce(e.is_bot, false) = false
    AND (p_from IS NULL OR e.occurred_at >= p_from)
    AND (p_to IS NULL OR e.occurred_at < p_to)
    AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
    AND (
      v_surface IS NULL
      OR public.normalize_purchase_surface(e.payload->>'purchase_surface') = v_surface
    );

  -- Order cohort: orders.created_at in period
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE o.buy_click_event_id IS NOT NULL)::integer,
    count(*) FILTER (WHERE o.attribution_confidence = 'exact')::integer,
    count(*) FILTER (
      WHERE o.attribution_confidence = 'unknown'
        AND o.attribution_captured_at IS NULL
    )::integer,
    count(*) FILTER (WHERE o.buy_click_event_id IS NULL)::integer
  INTO v_orders, v_click_linked, v_session_exact, v_unknown_hist, v_orders_without_click
  FROM public.orders AS o
  LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
  WHERE (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to)
    AND (p_practice_id IS NULL OR o.practice_id = p_practice_id)
    AND (v_surface IS NULL OR o.purchase_surface = v_surface);

  SELECT count(*)::integer
  INTO v_payment_attempts
  FROM public.payments AS p
  JOIN public.orders AS o ON o.id = p.order_id
  WHERE (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to)
    AND (p_practice_id IS NULL OR o.practice_id = p_practice_id)
    AND (v_surface IS NULL OR o.purchase_surface = v_surface)
    AND (p_include_test OR coalesce(p.is_test, false) = false);

  SELECT
    count(*)::integer,
    count(DISTINCT o.user_id)::integer,
    coalesce(sum(p.amount_minor), 0)::bigint
  INTO v_succeeded, v_buyers, v_gross
  FROM public.payments AS p
  JOIN public.orders AS o ON o.id = p.order_id
  WHERE p.status = 'succeeded'
    AND p.confirmed_at IS NOT NULL
    AND (p_include_test OR p.is_test = false)
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to)
    AND (p_practice_id IS NULL OR o.practice_id = p_practice_id)
    AND (v_surface IS NULL OR o.purchase_surface = v_surface);

  SELECT count(*)::integer
  INTO v_access
  FROM public.payments AS p
  JOIN public.orders AS o ON o.id = p.order_id
  JOIN public.user_practices AS up
    ON up.user_id = o.user_id
   AND up.practice_id = o.practice_id
   AND up.access_source = 'purchase'
  WHERE p.status = 'succeeded'
    AND p.confirmed_at IS NOT NULL
    AND (p_include_test OR p.is_test = false)
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to)
    AND (p_practice_id IS NULL OR o.practice_id = p_practice_id)
    AND (v_surface IS NULL OR o.purchase_surface = v_surface);

  -- First play after purchase: one per buyer+product (distinct payment)
  SELECT count(DISTINCT p.id)::integer
  INTO v_first_play
  FROM public.payments AS p
  JOIN public.orders AS o ON o.id = p.order_id
  WHERE p.status = 'succeeded'
    AND p.confirmed_at IS NOT NULL
    AND (p_include_test OR p.is_test = false)
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to)
    AND (p_practice_id IS NULL OR o.practice_id = p_practice_id)
    AND (v_surface IS NULL OR o.purchase_surface = v_surface)
    AND EXISTS (
      SELECT 1
      FROM public.analytics_events AS e
      WHERE e.event_name = 'audio_play_started'
        AND e.user_id = o.user_id
        AND e.practice_id = o.practice_id
        AND e.occurred_at >= p.confirmed_at
    );

  RETURN jsonb_build_object(
    'methodology', 'order_cohort',
    'methodology_note',
      'Cohort = orders.created_at in period. Engagement views/clicks are step-period by occurred_at and are not a strict person funnel denominator for order outcomes.',
    'checkout_started', 'not_emitted',
    'checkout_started_reason',
      'POST /api/orders follows buy click immediately; orders.created_at is SoT for order stage.',
    'include_test', p_include_test,
    'engagement', jsonb_build_object(
      'paid_product_views', v_paid_views,
      'unique_paid_product_viewers', v_unique_viewers,
      'buy_clicks', v_buy_clicks,
      'unique_buy_clickers', v_unique_clickers,
      'view_to_click_unique', CASE
        WHEN v_unique_viewers > 0
          THEN round((v_unique_clickers::numeric / v_unique_viewers::numeric) * 1000) / 10
        ELSE NULL
      END
    ),
    'cohort', jsonb_build_object(
      'orders_created', v_orders,
      'exact_click_linked_orders', v_click_linked,
      'orders_without_click_link', v_orders_without_click,
      'exact_session_attributed_orders', v_session_exact,
      'unknown_historical_orders', v_unknown_hist,
      'payment_attempts', v_payment_attempts,
      'succeeded_payments', v_succeeded,
      'unique_buyers', v_buyers,
      'gross_minor', v_gross,
      'access_grants', v_access,
      'first_post_purchase_plays', v_first_play
    ),
    'conversions', jsonb_build_object(
      'click_to_order_exact', jsonb_build_object(
        'numerator', v_click_linked,
        'denominator', v_unique_clickers,
        'formula', 'exact_click_linked_orders / unique_buy_clickers (engagement period)',
        'rate_pct', CASE
          WHEN v_unique_clickers > 0
            THEN round((v_click_linked::numeric / v_unique_clickers::numeric) * 1000) / 10
          ELSE NULL
        END,
        'note', 'Not a closed person funnel; clickers are step-period, linked orders are cohort.'
      ),
      'order_to_payment_attempt', jsonb_build_object(
        'numerator', v_payment_attempts,
        'denominator', v_orders,
        'rate_pct', CASE
          WHEN v_orders > 0
            THEN round((v_payment_attempts::numeric / v_orders::numeric) * 1000) / 10
          ELSE NULL
        END
      ),
      'payment_attempt_to_succeeded', jsonb_build_object(
        'numerator', v_succeeded,
        'denominator', v_payment_attempts,
        'rate_pct', CASE
          WHEN v_payment_attempts > 0
            THEN round((v_succeeded::numeric / v_payment_attempts::numeric) * 1000) / 10
          ELSE NULL
        END
      ),
      'succeeded_to_access', jsonb_build_object(
        'numerator', v_access,
        'denominator', v_succeeded,
        'rate_pct', CASE
          WHEN v_succeeded > 0
            THEN round((v_access::numeric / v_succeeded::numeric) * 1000) / 10
          ELSE NULL
        END
      ),
      'succeeded_to_first_play', jsonb_build_object(
        'numerator', v_first_play,
        'denominator', v_succeeded,
        'rate_pct', CASE
          WHEN v_succeeded > 0
            THEN round((v_first_play::numeric / v_succeeded::numeric) * 1000) / 10
          ELSE NULL
        END
      )
    ),
    'stages', jsonb_build_array(
      jsonb_build_object('key','paid_product_views','label','Просмотры платного продукта','entity','event','value',v_paid_views),
      jsonb_build_object('key','unique_viewers','label','Уникальные зрители','entity','person','value',v_unique_viewers),
      jsonb_build_object('key','buy_clicks','label','Клики «Купить»','entity','event','value',v_buy_clicks),
      jsonb_build_object('key','unique_clickers','label','Уникальные кликеры','entity','person','value',v_unique_clickers),
      jsonb_build_object('key','orders_created','label','Заказы созданы','entity','order','value',v_orders),
      jsonb_build_object('key','payment_attempts','label','Попытки оплаты','entity','payment_attempt','value',v_payment_attempts),
      jsonb_build_object('key','succeeded_payments','label','Успешные оплаты','entity','payment','value',v_succeeded),
      jsonb_build_object('key','access_grants','label','Доступ выдан','entity','entitlement','value',v_access),
      jsonb_build_object('key','first_post_purchase_plays','label','Первый запуск после покупки','entity','unique_purchased_product','value',v_first_play)
    ),
    'empty_exact_note',
      'Точные связи клика с заказом начнут собираться с момента релиза P3.2.1.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_p321_path_summary(timestamptz, timestamptz, boolean, uuid, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p321_path_summary(timestamptz, timestamptz, boolean, uuid, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p321_path_summary(timestamptz, timestamptz, boolean, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_analytics_p321_path_products(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(row_data ORDER BY gross_minor DESC, orders_created DESC)
    FROM (
      SELECT jsonb_build_object(
        'practice_id', x.practice_id,
        'title', x.title,
        'slug', x.slug,
        'views', x.views,
        'unique_viewers', x.unique_viewers,
        'buy_clicks', x.buy_clicks,
        'unique_clickers', x.unique_clickers,
        'orders_created', x.orders_created,
        'exact_click_linked_orders', x.click_linked,
        'succeeded_payments', x.succeeded,
        'gross_minor', x.gross_minor,
        'access_grants', x.access_grants,
        'first_post_purchase_plays', x.first_play,
        'view_to_click_unique_pct', CASE
          WHEN x.unique_viewers > 0
            THEN round((x.unique_clickers::numeric / x.unique_viewers::numeric) * 1000) / 10
          ELSE NULL
        END,
        'click_to_order_exact_pct', CASE
          WHEN x.unique_clickers > 0
            THEN round((x.click_linked::numeric / x.unique_clickers::numeric) * 1000) / 10
          ELSE NULL
        END,
        'order_to_succeeded_pct', CASE
          WHEN x.orders_created > 0
            THEN round((x.succeeded::numeric / x.orders_created::numeric) * 1000) / 10
          ELSE NULL
        END,
        'succeeded_to_play_pct', CASE
          WHEN x.succeeded > 0
            THEN round((x.first_play::numeric / x.succeeded::numeric) * 1000) / 10
          ELSE NULL
        END,
        'click_confidence', CASE
          WHEN x.click_linked > 0 THEN 'exact'
          WHEN x.orders_created > 0 THEN 'partial_or_unknown'
          ELSE 'none'
        END
      ) AS row_data,
      x.gross_minor,
      x.orders_created
      FROM (
        SELECT
          pr.id AS practice_id,
          coalesce(pr.title, 'Без названия') AS title,
          pr.slug,
          (
            SELECT count(*)::integer
            FROM public.analytics_events AS e
            WHERE e.event_name = 'practice_view'
              AND e.practice_id = pr.id
              AND (p_include_test OR coalesce(e.is_test, false) = false)
              AND coalesce(e.is_bot, false) = false
              AND (p_from IS NULL OR e.occurred_at >= p_from)
              AND (p_to IS NULL OR e.occurred_at < p_to)
          ) AS views,
          (
            SELECT count(DISTINCT coalesce(e.user_id::text, e.anonymous_session_id))::integer
            FROM public.analytics_events AS e
            WHERE e.event_name = 'practice_view'
              AND e.practice_id = pr.id
              AND (p_include_test OR coalesce(e.is_test, false) = false)
              AND coalesce(e.is_bot, false) = false
              AND (p_from IS NULL OR e.occurred_at >= p_from)
              AND (p_to IS NULL OR e.occurred_at < p_to)
          ) AS unique_viewers,
          (
            SELECT count(*)::integer
            FROM public.analytics_events AS e
            WHERE e.event_name = 'buy_clicked'
              AND e.practice_id = pr.id
              AND (p_include_test OR coalesce(e.is_test, false) = false)
              AND coalesce(e.is_bot, false) = false
              AND (p_from IS NULL OR e.occurred_at >= p_from)
              AND (p_to IS NULL OR e.occurred_at < p_to)
          ) AS buy_clicks,
          (
            SELECT count(DISTINCT coalesce(e.user_id::text, e.anonymous_session_id))::integer
            FROM public.analytics_events AS e
            WHERE e.event_name = 'buy_clicked'
              AND e.practice_id = pr.id
              AND (p_include_test OR coalesce(e.is_test, false) = false)
              AND coalesce(e.is_bot, false) = false
              AND (p_from IS NULL OR e.occurred_at >= p_from)
              AND (p_to IS NULL OR e.occurred_at < p_to)
          ) AS unique_clickers,
          (
            SELECT count(*)::integer
            FROM public.orders AS o
            WHERE o.practice_id = pr.id
              AND (p_from IS NULL OR o.created_at >= p_from)
              AND (p_to IS NULL OR o.created_at < p_to)
          ) AS orders_created,
          (
            SELECT count(*)::integer
            FROM public.orders AS o
            WHERE o.practice_id = pr.id
              AND o.buy_click_event_id IS NOT NULL
              AND (p_from IS NULL OR o.created_at >= p_from)
              AND (p_to IS NULL OR o.created_at < p_to)
          ) AS click_linked,
          (
            SELECT count(*)::integer
            FROM public.payments AS p
            JOIN public.orders AS o ON o.id = p.order_id
            WHERE o.practice_id = pr.id
              AND p.status = 'succeeded'
              AND p.confirmed_at IS NOT NULL
              AND (p_include_test OR p.is_test = false)
              AND (p_from IS NULL OR o.created_at >= p_from)
              AND (p_to IS NULL OR o.created_at < p_to)
          ) AS succeeded,
          (
            SELECT coalesce(sum(p.amount_minor), 0)::bigint
            FROM public.payments AS p
            JOIN public.orders AS o ON o.id = p.order_id
            WHERE o.practice_id = pr.id
              AND p.status = 'succeeded'
              AND p.confirmed_at IS NOT NULL
              AND (p_include_test OR p.is_test = false)
              AND (p_from IS NULL OR o.created_at >= p_from)
              AND (p_to IS NULL OR o.created_at < p_to)
          ) AS gross_minor,
          (
            SELECT count(*)::integer
            FROM public.payments AS p
            JOIN public.orders AS o ON o.id = p.order_id
            JOIN public.user_practices AS up
              ON up.user_id = o.user_id
             AND up.practice_id = o.practice_id
             AND up.access_source = 'purchase'
            WHERE o.practice_id = pr.id
              AND p.status = 'succeeded'
              AND p.confirmed_at IS NOT NULL
              AND (p_include_test OR p.is_test = false)
              AND (p_from IS NULL OR o.created_at >= p_from)
              AND (p_to IS NULL OR o.created_at < p_to)
          ) AS access_grants,
          (
            SELECT count(DISTINCT p.id)::integer
            FROM public.payments AS p
            JOIN public.orders AS o ON o.id = p.order_id
            WHERE o.practice_id = pr.id
              AND p.status = 'succeeded'
              AND p.confirmed_at IS NOT NULL
              AND (p_include_test OR p.is_test = false)
              AND (p_from IS NULL OR o.created_at >= p_from)
              AND (p_to IS NULL OR o.created_at < p_to)
              AND EXISTS (
                SELECT 1 FROM public.analytics_events AS e
                WHERE e.event_name = 'audio_play_started'
                  AND e.user_id = o.user_id
                  AND e.practice_id = o.practice_id
                  AND e.occurred_at >= p.confirmed_at
              )
          ) AS first_play
        FROM public.practices AS pr
        WHERE pr.is_free IS DISTINCT FROM true
          AND coalesce(pr.price, 0) > 0
          AND (
            EXISTS (
              SELECT 1 FROM public.orders AS o
              WHERE o.practice_id = pr.id
                AND (p_from IS NULL OR o.created_at >= p_from)
                AND (p_to IS NULL OR o.created_at < p_to)
            )
            OR EXISTS (
              SELECT 1 FROM public.analytics_events AS e
              WHERE e.practice_id = pr.id
                AND e.event_name IN ('practice_view', 'buy_clicked')
                AND (p_from IS NULL OR e.occurred_at >= p_from)
                AND (p_to IS NULL OR e.occurred_at < p_to)
            )
          )
        ORDER BY 1
        LIMIT v_limit
      ) AS x
    ) AS ranked
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_p321_path_products(timestamptz, timestamptz, boolean, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p321_path_products(timestamptz, timestamptz, boolean, integer)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p321_path_products(timestamptz, timestamptz, boolean, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_analytics_p321_path_surfaces(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.buy_clicks DESC, t.orders_linked DESC), '[]'::jsonb)
  FROM (
    SELECT
      s.surface,
      (
        SELECT count(*)::integer
        FROM public.analytics_events AS e
        WHERE e.event_name = 'buy_clicked'
          AND public.normalize_purchase_surface(e.payload->>'purchase_surface') = s.surface
          AND (p_include_test OR coalesce(e.is_test, false) = false)
          AND coalesce(e.is_bot, false) = false
          AND (p_from IS NULL OR e.occurred_at >= p_from)
          AND (p_to IS NULL OR e.occurred_at < p_to)
      ) AS buy_clicks,
      (
        SELECT count(*)::integer
        FROM public.orders AS o
        WHERE o.purchase_surface = s.surface
          AND o.buy_click_event_id IS NOT NULL
          AND (p_from IS NULL OR o.created_at >= p_from)
          AND (p_to IS NULL OR o.created_at < p_to)
      ) AS orders_linked,
      (
        SELECT count(*)::integer
        FROM public.payments AS p
        JOIN public.orders AS o ON o.id = p.order_id
        WHERE o.purchase_surface = s.surface
          AND o.buy_click_event_id IS NOT NULL
          AND p.status = 'succeeded'
          AND p.confirmed_at IS NOT NULL
          AND (p_include_test OR p.is_test = false)
          AND (p_from IS NULL OR o.created_at >= p_from)
          AND (p_to IS NULL OR o.created_at < p_to)
      ) AS succeeded,
      (
        SELECT coalesce(sum(p.amount_minor), 0)::bigint
        FROM public.payments AS p
        JOIN public.orders AS o ON o.id = p.order_id
        WHERE o.purchase_surface = s.surface
          AND o.buy_click_event_id IS NOT NULL
          AND p.status = 'succeeded'
          AND p.confirmed_at IS NOT NULL
          AND (p_include_test OR p.is_test = false)
          AND (p_from IS NULL OR o.created_at >= p_from)
          AND (p_to IS NULL OR o.created_at < p_to)
      ) AS gross_minor
    FROM (
      SELECT unnest(ARRAY[
        'practice_page','preview','catalog_card','playlist','author_page','unknown'
      ]) AS surface
    ) AS s
  ) AS t
  WHERE t.buy_clicks > 0 OR t.orders_linked > 0;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_p321_path_surfaces(timestamptz, timestamptz, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p321_path_surfaces(timestamptz, timestamptz, boolean)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p321_path_surfaces(timestamptz, timestamptz, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Integrity snapshot
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.buy_click_path_integrity_snapshot(
  p_since timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'critical', (
      SELECT count(*)::integer FROM (
        SELECT o.id
        FROM public.orders AS o
        WHERE o.buy_click_event_id IS NOT NULL
          AND (p_since IS NULL OR o.created_at >= p_since)
          AND NOT EXISTS (
            SELECT 1 FROM public.analytics_events AS e WHERE e.id = o.buy_click_event_id
          )
        UNION ALL
        SELECT o.id
        FROM public.orders AS o
        JOIN public.analytics_events AS e ON e.id = o.buy_click_event_id
        WHERE (p_since IS NULL OR o.created_at >= p_since)
          AND e.event_name IS DISTINCT FROM 'buy_clicked'
        UNION ALL
        SELECT o.id
        FROM public.orders AS o
        JOIN public.analytics_events AS e ON e.id = o.buy_click_event_id
        WHERE (p_since IS NULL OR o.created_at >= p_since)
          AND e.practice_id IS DISTINCT FROM o.practice_id
        UNION ALL
        SELECT o.id
        FROM public.orders AS o
        JOIN public.analytics_events AS e ON e.id = o.buy_click_event_id
        WHERE (p_since IS NULL OR o.created_at >= p_since)
          AND o.analytics_session_id IS NOT NULL
          AND e.session_id IS DISTINCT FROM o.analytics_session_id
        UNION ALL
        SELECT o.id
        FROM public.orders AS o
        JOIN public.analytics_events AS e ON e.id = o.buy_click_event_id
        WHERE (p_since IS NULL OR o.created_at >= p_since)
          AND e.occurred_at > o.created_at + interval '5 seconds'
      ) AS crit
    ),
    'same_event_multiple_orders', (
      SELECT count(*)::integer
      FROM (
        SELECT buy_click_event_id
        FROM public.orders
        WHERE buy_click_event_id IS NOT NULL
        GROUP BY buy_click_event_id
        HAVING count(*) > 1
      ) AS d
    ),
    'stale_linked', (
      SELECT count(*)::integer
      FROM public.orders AS o
      JOIN public.analytics_events AS e ON e.id = o.buy_click_event_id
      WHERE (p_since IS NULL OR o.created_at >= p_since)
        AND e.occurred_at < o.created_at - interval '15 minutes'
    ),
    'exact_session_missing_click', (
      SELECT count(*)::integer
      FROM public.orders AS o
      WHERE o.attribution_confidence = 'exact'
        AND o.buy_click_event_id IS NULL
        AND (p_since IS NULL OR o.created_at >= p_since)
    ),
    'historical_unknown', (
      SELECT count(*)::integer
      FROM public.orders AS o
      WHERE o.attribution_confidence = 'unknown'
        AND o.buy_click_event_id IS NULL
        AND (p_since IS NULL OR o.created_at >= p_since)
    ),
    'buy_clicked_total', (
      SELECT count(*)::integer
      FROM public.analytics_events AS e
      WHERE e.event_name = 'buy_clicked'
        AND (p_since IS NULL OR e.occurred_at >= p_since)
    ),
    'orders_click_linked', (
      SELECT count(*)::integer
      FROM public.orders AS o
      WHERE o.buy_click_event_id IS NOT NULL
        AND (p_since IS NULL OR o.created_at >= p_since)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.buy_click_path_integrity_snapshot(timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buy_click_path_integrity_snapshot(timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_click_path_integrity_snapshot(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.buy_click_path_integrity_snapshot(timestamptz) IS
  'audiolad:p321; buy click path integrity; critical should stay 0';

COMMIT;
