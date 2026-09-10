-- Isolated schema for Studio music license PR1.
-- Scratch / local database only. Never apply to production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'author',
  payout_eligible boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.author_members (
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  UNIQUE (author_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors (id),
  title text NOT NULL DEFAULT 'practice',
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'published',
  price integer NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT false,
  currency text NOT NULL DEFAULT 'RUB',
  product_kind text NOT NULL DEFAULT 'practice',
  publication_class text NULL,
  music_usage_permission text NULL,
  catalog_visibility text NOT NULL DEFAULT 'listed',
  is_catalog_listed boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  CONSTRAINT practices_currency_rub_check CHECK (currency = 'RUB')
);

CREATE TABLE IF NOT EXISTS public.audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'track',
  audio_path text NULL,
  status text NOT NULL DEFAULT 'published',
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id),
  access_source text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_practices_user_practice_unique UNIQUE (user_id, practice_id)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  practice_id uuid NOT NULL REFERENCES public.practices (id),
  status text NOT NULL DEFAULT 'pending',
  amount_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'RUB',
  practice_title_snapshot text NOT NULL DEFAULT 'practice',
  practice_slug_snapshot text NOT NULL DEFAULT 'practice',
  price_minor_snapshot bigint NOT NULL DEFAULT 0,
  base_price_minor_snapshot bigint NULL,
  promotion_price_minor_snapshot bigint NULL,
  promotion_id uuid NULL,
  promotion_type text NULL,
  author_id_snapshot uuid NULL,
  idempotency_key text NULL,
  order_kind text NOT NULL DEFAULT 'product_purchase',
  target_access_level integer NULL,
  paid_at timestamptz NULL,
  is_test boolean NOT NULL DEFAULT false,
  test_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'paid', 'cancelled', 'failed', 'refunded')),
  CONSTRAINT orders_paid_at_consistency_check
    CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique_idx
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_pending_per_user_practice_idx
  ON public.orders (user_id, practice_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_payment_id text NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL,
  is_test boolean NOT NULL DEFAULT false,
  test_reason text NULL,
  CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'succeeded', 'cancelled', 'failed', 'refunded'))
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  dedup_key text NOT NULL,
  provider_event_id text NULL,
  provider_payment_id text NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_verified boolean NOT NULL DEFAULT false,
  processing_status text NOT NULL DEFAULT 'received',
  processed_at timestamptz NULL,
  processing_attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,
  review_reason text NULL,
  payment_id uuid NULL REFERENCES public.payments (id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES public.orders (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_dedup_key_uidx
  ON public.payment_webhook_events (provider, dedup_key);

CREATE OR REPLACE FUNCTION public.is_practice_author_member(
  p_practice_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    JOIN public.author_members AS am
      ON am.author_id = p.author_id
    WHERE p.id = p_practice_id
      AND am.user_id = p_user_id
      AND am.role IN ('owner', 'editor')
  );
$$;

CREATE OR REPLACE FUNCTION public.viewer_can_commercially_access_practice(
  p_practice public.practices,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_practice.status = 'published'
     AND p_practice.deleted_at IS NULL
     AND p_practice.catalog_visibility IN ('listed', 'unlisted');
$$;

CREATE OR REPLACE FUNCTION public.resolve_practice_effective_price(
  p_practice_id uuid,
  p_surface text,
  p_visitor_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  is_free boolean,
  base_price integer,
  sale_price integer,
  final_price integer,
  promotion_id uuid,
  promotion_name text,
  promotion_type text,
  ends_at timestamptz,
  expires_at timestamptz,
  base_price_minor bigint,
  sale_price_minor bigint,
  final_price_minor bigint
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
BEGIN
  SELECT p.* INTO v_practice FROM public.practices AS p WHERE p.id = p_practice_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_practice.is_free IS TRUE OR v_practice.price IS NULL OR v_practice.price <= 0 THEN
    is_free := true;
    base_price := 0;
    sale_price := NULL;
    final_price := 0;
    promotion_id := NULL;
    promotion_name := NULL;
    promotion_type := NULL;
    ends_at := NULL;
    expires_at := NULL;
    base_price_minor := 0;
    sale_price_minor := NULL;
    final_price_minor := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  is_free := false;
  base_price := v_practice.price;
  sale_price := NULL;
  final_price := v_practice.price;
  promotion_id := NULL;
  promotion_name := NULL;
  promotion_type := NULL;
  ends_at := NULL;
  expires_at := NULL;
  base_price_minor := (v_practice.price::bigint) * 100;
  sale_price_minor := NULL;
  final_price_minor := (v_practice.price::bigint) * 100;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_practice_access(
  p_user_id uuid,
  p_practice_id uuid,
  p_target_level integer,
  p_access_source text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  INSERT INTO public.user_practices (user_id, practice_id, access_source, metadata)
  VALUES (p_user_id, p_practice_id, p_access_source, coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object(
    'inserted', v_rows > 0,
    'access_level', greatest(coalesce(p_target_level, 1), 1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_practice_purchase_access(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  locked_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO locked_order FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;
  IF locked_order.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Order % is not paid', p_order_id;
  END IF;
  RETURN public.grant_practice_access(
    locked_order.user_id,
    locked_order.practice_id,
    1,
    'purchase',
    jsonb_build_object('order_id', locked_order.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_is_test_from_row(
  p_provider_payment_id text,
  p_provider_metadata jsonb,
  p_existing_is_test boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_existing_is_test, false)
    OR coalesce((p_provider_metadata ->> 'e2e_test') IN ('true', 't', '1'), false)
    OR (p_provider_payment_id IS NOT NULL AND p_provider_payment_id LIKE 'e2e-%');
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;
GRANT SELECT ON TABLE public.practices TO authenticated;
GRANT SELECT ON TABLE public.author_members TO authenticated;
GRANT ALL ON TABLE public.user_practices TO service_role;
GRANT SELECT ON TABLE public.user_practices TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;
GRANT ALL ON TABLE public.payment_webhook_events TO service_role;
