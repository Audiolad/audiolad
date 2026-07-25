-- P3.2.0: immutable write-time order ↔ analytics session attribution snapshot.
-- Does NOT backfill historical orders as exact.
-- Does NOT change payment fulfillment / money SoT.

BEGIN;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS analytics_session_id uuid NULL,
  ADD COLUMN IF NOT EXISTS analytics_anonymous_id text NULL,
  ADD COLUMN IF NOT EXISTS attribution_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS session_utm_source text NULL,
  ADD COLUMN IF NOT EXISTS session_utm_medium text NULL,
  ADD COLUMN IF NOT EXISTS session_utm_campaign text NULL,
  ADD COLUMN IF NOT EXISTS session_utm_content text NULL,
  ADD COLUMN IF NOT EXISTS session_utm_term text NULL,
  ADD COLUMN IF NOT EXISTS session_referrer_domain text NULL,
  ADD COLUMN IF NOT EXISTS session_landing_path text NULL,
  ADD COLUMN IF NOT EXISTS checkout_origin_path text NULL,
  ADD COLUMN IF NOT EXISTS attribution_captured_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS attribution_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS author_id_snapshot uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_attribution_confidence_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_attribution_confidence_check
      CHECK (
        attribution_confidence IN ('exact', 'strong', 'inferred', 'unknown')
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_analytics_session_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_analytics_session_id_fkey
      FOREIGN KEY (analytics_session_id)
      REFERENCES public.analytics_sessions (id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS orders_analytics_session_id_idx
  ON public.orders (analytics_session_id)
  WHERE analytics_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_attribution_user_id_idx
  ON public.orders (attribution_user_id)
  WHERE attribution_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_session_utm_source_created_at_idx
  ON public.orders (session_utm_source, created_at DESC)
  WHERE session_utm_source IS NOT NULL;

COMMENT ON COLUMN public.orders.attribution_confidence IS
  'audiolad:p320; exact|strong|inferred|unknown; P3.2.0 writes only exact|unknown';

COMMENT ON COLUMN public.orders.author_id_snapshot IS
  'audiolad:p320; practice.author_id at order create time; not payout ledger';

-- ---------------------------------------------------------------------------
-- Path sanitizer (pathname only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sanitize_checkout_origin_path(p_path text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw text;
  v_path text;
BEGIN
  IF p_path IS NULL THEN
    RETURN NULL;
  END IF;

  v_raw := btrim(p_path);
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  -- Strip scheme/host if a full URL was passed.
  IF v_raw ~* '^https?://' THEN
    BEGIN
      v_raw := regexp_replace(v_raw, '^https?://[^/]+', '');
    EXCEPTION
      WHEN others THEN
        v_raw := '/';
    END;
  END IF;

  -- Drop query/fragment.
  v_raw := split_part(v_raw, '#', 1);
  v_raw := split_part(v_raw, '?', 1);

  -- Control chars / whitespace collapse.
  v_raw := regexp_replace(v_raw, E'[\\x00-\\x1F\\x7F]', '', 'g');
  v_raw := regexp_replace(v_raw, '\\s+', '', 'g');

  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  IF left(v_raw, 1) IS DISTINCT FROM '/' THEN
    v_raw := '/' || v_raw;
  END IF;

  -- Collapse duplicate slashes; reject traversal segments.
  v_path := regexp_replace(v_raw, '/{2,}', '/', 'g');
  IF v_path ~ '(^|/)\.\.(/|$)' THEN
    RETURN NULL;
  END IF;

  IF char_length(v_path) > 512 THEN
    v_path := left(v_path, 512);
  END IF;

  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_checkout_origin_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sanitize_checkout_origin_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_checkout_origin_path(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Resolve exact attribution from claims (never trusts client UTM)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_order_attribution_snapshot(
  p_user_id uuid,
  p_analytics_session_id uuid,
  p_analytics_anonymous_id text,
  p_checkout_origin_path text
)
RETURNS TABLE (
  ok boolean,
  reason text,
  analytics_session_id uuid,
  analytics_anonymous_id text,
  attribution_user_id uuid,
  session_utm_source text,
  session_utm_medium text,
  session_utm_campaign text,
  session_utm_content text,
  session_utm_term text,
  session_referrer_domain text,
  session_landing_path text,
  checkout_origin_path text,
  attribution_confidence text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.analytics_sessions%ROWTYPE;
  v_anon text;
  v_origin text;
  v_identity_ok boolean := false;
BEGIN
  v_anon := nullif(btrim(coalesce(p_analytics_anonymous_id, '')), '');
  v_origin := public.sanitize_checkout_origin_path(p_checkout_origin_path);

  IF p_analytics_session_id IS NULL OR v_anon IS NULL THEN
    RETURN QUERY SELECT
      false, 'missing_claims'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.analytics_sessions AS s
  WHERE s.id = p_analytics_session_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false, 'session_missing'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  IF v_session.anonymous_id IS DISTINCT FROM v_anon THEN
    RETURN QUERY SELECT
      false, 'anonymous_mismatch'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  IF coalesce(v_session.is_bot, false) THEN
    RETURN QUERY SELECT
      false, 'session_bot'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  -- Same active window as analytics session model (30 minutes).
  IF v_session.last_seen_at < (now() - interval '30 minutes') THEN
    RETURN QUERY SELECT
      false, 'session_stale'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  IF v_session.user_id IS NOT NULL THEN
    v_identity_ok := (v_session.user_id = p_user_id);
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.analytics_identity_links AS l
      WHERE l.anonymous_id = v_session.anonymous_id
        AND l.user_id = p_user_id
        AND l.unlinked_at IS NULL
    )
    INTO v_identity_ok;
  END IF;

  IF NOT v_identity_ok THEN
    RETURN QUERY SELECT
      false, 'identity_mismatch'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    'exact'::text,
    v_session.id,
    v_session.anonymous_id,
    p_user_id,
    left(v_session.utm_source, 128),
    left(v_session.utm_medium, 128),
    left(v_session.utm_campaign, 128),
    left(v_session.utm_content, 128),
    NULL::text, -- utm_term not collected on sessions yet
    left(v_session.referrer_domain, 128),
    left(v_session.landing_path, 512),
    v_origin,
    'exact'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_order_attribution_snapshot(uuid, uuid, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_order_attribution_snapshot(uuid, uuid, text, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_order_attribution_snapshot(uuid, uuid, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- create_practice_order (extended, rolling-deploy compatible defaults)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_practice_order(text, uuid);

CREATE FUNCTION public.create_practice_order(
  p_practice_slug text,
  p_idempotency_key uuid,
  p_analytics_session_id uuid DEFAULT NULL,
  p_analytics_anonymous_id text DEFAULT NULL,
  p_checkout_origin_path text DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  practice_id uuid,
  practice_slug text,
  status text,
  amount_minor bigint,
  currency text,
  created_at timestamptz,
  attribution_confidence text
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

  -- Resolve attribution once per call (DB session only; ignore client UTM).
  SELECT *
  INTO v_attr
  FROM public.resolve_order_attribution_snapshot(
    v_user_id,
    p_analytics_session_id,
    p_analytics_anonymous_id,
    p_checkout_origin_path
  );

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
      v_existing.attribution_confidence;
    RETURN;
  END IF;

  -- Reuse existing pending order for same user+practice (API compatibility).
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

    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.practice_id,
      v_existing.practice_slug_snapshot,
      v_existing.status,
      v_existing.amount_minor,
      v_existing.currency,
      v_existing.created_at,
      v_existing.attribution_confidence;
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

  EXCEPTION
    WHEN unique_violation THEN
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

        RETURN QUERY
        SELECT
          v_existing.id,
          v_existing.practice_id,
          v_existing.practice_slug_snapshot,
          v_existing.status,
          v_existing.amount_minor,
          v_existing.currency,
          v_existing.created_at,
          v_existing.attribution_confidence;
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

  RETURN QUERY
  SELECT
    v_new_order.id,
    v_new_order.practice_id,
    v_new_order.practice_slug_snapshot,
    v_new_order.status,
    v_new_order.amount_minor,
    v_new_order.currency,
    v_new_order.created_at,
    v_new_order.attribution_confidence;
END;
$$;

REVOKE ALL ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_practice_order(text, uuid, uuid, text, text) IS
  'audiolad:create-order:p320; pending order + optional exact attribution snapshot from validated analytics session; auth.uid(); never trusts client UTM';

-- ---------------------------------------------------------------------------
-- Read-only integrity helper (service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_attribution_integrity_snapshot(
  p_since timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH scoped AS (
    SELECT *
    FROM public.orders AS o
    WHERE p_since IS NULL OR o.created_at >= p_since
  )
  SELECT jsonb_build_object(
    'orders_total', (SELECT count(*)::integer FROM scoped),
    'exact', (
      SELECT count(*)::integer FROM scoped WHERE attribution_confidence = 'exact'
    ),
    'unknown', (
      SELECT count(*)::integer FROM scoped WHERE attribution_confidence = 'unknown'
    ),
    'exact_missing_session', (
      SELECT count(*)::integer
      FROM scoped
      WHERE attribution_confidence = 'exact'
        AND analytics_session_id IS NULL
    ),
    'exact_user_mismatch', (
      SELECT count(*)::integer
      FROM scoped
      WHERE attribution_confidence = 'exact'
        AND attribution_user_id IS DISTINCT FROM user_id
    ),
    'exact_capture_delay_gt_5m', (
      SELECT count(*)::integer
      FROM scoped
      WHERE attribution_confidence = 'exact'
        AND attribution_captured_at IS NOT NULL
        AND attribution_captured_at > created_at + interval '5 minutes'
    ),
    'suspicious_origin_query', (
      SELECT count(*)::integer
      FROM scoped
      WHERE checkout_origin_path ~ '[?#]'
         OR checkout_origin_path ILIKE '%token%'
         OR checkout_origin_path ILIKE '%email%'
    ),
    'generated_at', now()
  );
$$;

REVOKE ALL ON FUNCTION public.order_attribution_integrity_snapshot(timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_attribution_integrity_snapshot(timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_attribution_integrity_snapshot(timestamptz)
  TO service_role;

COMMIT;
