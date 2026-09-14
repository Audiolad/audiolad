BEGIN;

-- ---------------------------------------------------------------------------
-- One-time author project capacity packs (+1 / +5). Permanent entitlement.
-- Extends existing profiles limit model; reuses Tochka order/payment/fulfill.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS author_project_slots_purchased integer;

UPDATE public.profiles
SET author_project_slots_purchased = 0
WHERE author_project_slots_purchased IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN author_project_slots_purchased SET DEFAULT 0,
  ALTER COLUMN author_project_slots_purchased SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_author_project_slots_purchased_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_author_project_slots_purchased_check
      CHECK (author_project_slots_purchased >= 0);
  END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.author_project_slots_purchased IS
  'audiolad:author-project-capacity:v1; permanent extra owned-project slots from one-time purchases; never expires';

-- Protect purchased slots from JWT self-updates (same guard as other limit cols).
CREATE OR REPLACE FUNCTION public.protect_profiles_author_project_limit_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_sub text;
BEGIN
  v_jwt_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_sub IS NOT NULL THEN
      NEW.author_project_limit_override := NULL;
      NEW.author_projects_unlimited := false;
      NEW.author_premium_enabled := false;
      NEW.author_project_slots_purchased := 0;
    END IF;
    RETURN NEW;
  END IF;

  IF v_jwt_sub IS NOT NULL THEN
    IF NEW.author_project_limit_override IS DISTINCT FROM OLD.author_project_limit_override THEN
      NEW.author_project_limit_override := OLD.author_project_limit_override;
    END IF;
    IF NEW.author_projects_unlimited IS DISTINCT FROM OLD.author_projects_unlimited THEN
      NEW.author_projects_unlimited := OLD.author_projects_unlimited;
    END IF;
    IF NEW.author_premium_enabled IS DISTINCT FROM OLD.author_premium_enabled THEN
      NEW.author_premium_enabled := OLD.author_premium_enabled;
    END IF;
    IF NEW.author_project_slots_purchased IS DISTINCT FROM OLD.author_project_slots_purchased THEN
      NEW.author_project_slots_purchased := OLD.author_project_slots_purchased;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_author_project_limits_on_update
  ON public.profiles;
CREATE TRIGGER profiles_protect_author_project_limits_on_update
  BEFORE UPDATE OF
    author_project_limit_override,
    author_projects_unlimited,
    author_premium_enabled,
    author_project_slots_purchased
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_author_project_limit_columns();

CREATE TABLE IF NOT EXISTS public.author_project_capacity_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  payment_id uuid NULL REFERENCES public.payments (id) ON DELETE SET NULL,
  sku text NOT NULL,
  slots integer NOT NULL,
  amount_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_project_capacity_grants_slots_check CHECK (slots > 0),
  CONSTRAINT author_project_capacity_grants_amount_check CHECK (amount_minor > 0),
  CONSTRAINT author_project_capacity_grants_sku_check CHECK (
    sku IN ('author_project_slot_1', 'author_project_slots_5')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS author_project_capacity_grants_order_id_uidx
  ON public.author_project_capacity_grants (order_id);

CREATE INDEX IF NOT EXISTS author_project_capacity_grants_user_id_idx
  ON public.author_project_capacity_grants (user_id, created_at DESC);

COMMENT ON TABLE public.author_project_capacity_grants IS
  'audiolad:author-project-capacity:v1; one grant row per paid capacity order; UNIQUE(order_id) blocks duplicate webhook grants';

REVOKE ALL ON TABLE public.author_project_capacity_grants FROM PUBLIC;
REVOKE ALL ON TABLE public.author_project_capacity_grants FROM anon, authenticated;
ALTER TABLE public.author_project_capacity_grants ENABLE ROW LEVEL SECURITY;

-- Capacity orders are platform SKUs: no practice / author sale snapshot.
ALTER TABLE public.orders
  ALTER COLUMN practice_id DROP NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_kind_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_kind_check
  CHECK (order_kind IN (
    'product_purchase',
    'course_upgrade',
    'studio_music_license',
    'author_project_capacity'
  ));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_course_upgrade_target_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_course_upgrade_target_check
  CHECK (
    (order_kind = 'product_purchase' AND target_access_level IS NULL)
    OR (order_kind = 'course_upgrade' AND target_access_level >= 2)
    OR (order_kind = 'studio_music_license' AND target_access_level IS NULL)
    OR (
      order_kind = 'author_project_capacity'
      AND target_access_level IS NULL
      AND practice_id IS NULL
    )
  );

COMMENT ON COLUMN public.orders.order_kind IS
  'product_purchase | course_upgrade | studio_music_license | author_project_capacity (one-time permanent project slots; practice_id NULL).';

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_pending_author_project_capacity_per_user_idx
  ON public.orders (user_id)
  WHERE status = 'pending' AND order_kind = 'author_project_capacity';

COMMENT ON INDEX public.orders_one_pending_author_project_capacity_per_user_idx IS
  'At most one live pending author_project_capacity charge per user.';

-- Allow platform capacity orders without author_id_snapshot.
CREATE OR REPLACE FUNCTION public.orders_enforce_author_id_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_author uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.author_id_snapshot IS NOT NULL
     AND NEW.author_id_snapshot IS DISTINCT FROM OLD.author_id_snapshot THEN
    NEW.author_id_snapshot := OLD.author_id_snapshot;
  END IF;

  IF coalesce(NEW.order_kind, 'product_purchase') = 'author_project_capacity' THEN
    NEW.author_id_snapshot := NULL;
    NEW.practice_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.author_id_snapshot IS NULL THEN
    SELECT pr.author_id
    INTO v_practice_author
    FROM public.practices AS pr
    WHERE pr.id = NEW.practice_id;

    NEW.author_id_snapshot := v_practice_author;
  END IF;

  IF coalesce(NEW.amount_minor, 0) > 0 AND NEW.author_id_snapshot IS NULL THEN
    RAISE EXCEPTION 'author_snapshot_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.order_sale_accrual_ready(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_practice_author uuid;
  v_author_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders AS o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ready', false, 'code', 'order_not_found');
  END IF;

  IF coalesce(v_order.order_kind, 'product_purchase') = 'author_project_capacity' THEN
    RETURN jsonb_build_object('ready', true, 'code', 'platform_capacity_sale');
  END IF;

  IF coalesce(v_order.amount_minor, 0) <= 0 THEN
    RETURN jsonb_build_object('ready', true, 'code', 'zero_amount');
  END IF;

  SELECT pr.author_id INTO v_practice_author
  FROM public.practices AS pr
  WHERE pr.id = v_order.practice_id;

  v_author_id := coalesce(v_order.author_id_snapshot, v_practice_author);
  IF v_author_id IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'code', 'author_snapshot_missing');
  END IF;

  IF v_order.author_id_snapshot IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'code', 'author_snapshot_missing');
  END IF;

  RETURN public.author_sale_accrual_ready(v_author_id, now());
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_author_project_capacity_package(
  p_sku text
)
RETURNS TABLE (
  sku text,
  slots integer,
  amount_minor bigint,
  display_amount_minor bigint,
  title text
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sku text := btrim(coalesce(p_sku, ''));
BEGIN
  IF v_sku = 'author_project_slot_1' THEN
    sku := v_sku;
    slots := 1;
    amount_minor := 99900;
    display_amount_minor := NULL;
    title := '+1 проект';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_sku = 'author_project_slots_5' THEN
    sku := v_sku;
    slots := 5;
    amount_minor := 249900;
    display_amount_minor := 499500;
    title := '+5 проектов';
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE EXCEPTION 'invalid_sku' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_author_project_capacity_package(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_author_project_capacity_package(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_user_author_project_limit(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_override integer;
  v_premium boolean;
  v_purchased integer;
  v_base integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 1;
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    p.author_project_limit_override,
    coalesce(p.author_premium_enabled, false),
    coalesce(p.author_project_slots_purchased, 0)
  INTO v_override, v_premium, v_purchased
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF v_override IS NOT NULL AND v_override >= 1 THEN
    v_base := v_override;
  ELSIF v_premium IS TRUE THEN
    v_base := 3;
  ELSE
    v_base := 1;
  END IF;

  RETURN v_base + greatest(coalesce(v_purchased, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_author_project(
  p_name text,
  p_slug text DEFAULT NULL,
  p_short_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug_input text := nullif(btrim(coalesce(p_slug, '')), '');
  v_slug text;
  v_description text := nullif(btrim(coalesce(p_short_description, '')), '');
  v_limit integer;
  v_unlimited boolean;
  v_purchased integer;
  v_used integer;
  v_author_id uuid;
  v_base integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'invalid_project_name' USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 280 THEN
    RAISE EXCEPTION 'invalid_project_description' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT
    coalesce(p.author_projects_unlimited, false),
    coalesce(p.author_project_slots_purchased, 0),
    CASE
      WHEN p.author_project_limit_override IS NOT NULL
           AND p.author_project_limit_override >= 1
        THEN p.author_project_limit_override
      WHEN coalesce(p.author_premium_enabled, false) THEN 3
      ELSE 1
    END
  INTO v_unlimited, v_purchased, v_base
  FROM public.profiles AS p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF v_unlimited IS NULL THEN
    v_unlimited := false;
  END IF;
  IF v_base IS NULL THEN
    v_base := 1;
  END IF;
  IF v_purchased IS NULL OR v_purchased < 0 THEN
    v_purchased := 0;
  END IF;

  v_limit := v_base + v_purchased;

  SELECT count(*)::integer
  INTO v_used
  FROM public.author_members AS am
  WHERE am.user_id = v_user_id
    AND am.role = 'owner';

  IF NOT v_unlimited AND v_used >= v_limit THEN
    RAISE EXCEPTION 'author_project_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  IF v_slug_input IS NOT NULL THEN
    v_slug := public.slugify_author_display_name(v_slug_input);
    IF v_slug IS NULL OR char_length(v_slug) < 2 THEN
      RAISE EXCEPTION 'invalid_project_slug' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.authors AS a WHERE a.slug = v_slug) THEN
      RAISE EXCEPTION 'project_slug_taken' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_slug := public.allocate_unique_author_slug(v_name);
  END IF;

  INSERT INTO public.authors (
    name, slug, author_type, access_status, short_bio, description
  ) VALUES (
    v_name, v_slug, 'project', 'free', v_description, v_description
  )
  RETURNING id INTO v_author_id;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, v_user_id, 'owner');

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', v_author_id,
    'slug', v_slug,
    'name', v_name,
    'used', v_used + 1,
    'limit', CASE WHEN v_unlimited THEN NULL ELSE v_limit END,
    'unlimited', v_unlimited
  );
END;
$$;

COMMENT ON FUNCTION public.create_author_project(text, text, text) IS
  'audiolad:create-author-project:v3; limit = base(override|premium|1) + purchased slots; unlimited entitlement unchanged';

CREATE OR REPLACE FUNCTION public.create_author_project_capacity_order(
  p_sku text,
  p_idempotency_key uuid
)
RETURNS TABLE (
  order_id uuid,
  status text,
  amount_minor bigint,
  currency text,
  order_kind text,
  sku text,
  slots integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_package record;
  v_idempotency_key text;
  v_existing public.orders%ROWTYPE;
  v_new_order public.orders%ROWTYPE;
  v_unlimited boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  v_idempotency_key := p_idempotency_key::text;

  SELECT * INTO v_package
  FROM public.resolve_author_project_capacity_package(p_sku);

  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM v_user_id
       OR v_existing.order_kind IS DISTINCT FROM 'author_project_capacity'
       OR v_existing.practice_slug_snapshot IS DISTINCT FROM v_package.sku THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.status,
      v_existing.amount_minor,
      v_existing.currency,
      v_existing.order_kind,
      v_existing.practice_slug_snapshot,
      CASE
        WHEN v_existing.practice_slug_snapshot = 'author_project_slot_1' THEN 1
        WHEN v_existing.practice_slug_snapshot = 'author_project_slots_5' THEN 5
        ELSE 0
      END,
      v_existing.created_at;
    RETURN;
  END IF;

  SELECT coalesce(p.author_projects_unlimited, false)
  INTO v_unlimited
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  IF coalesce(v_unlimited, false) THEN
    RAISE EXCEPTION 'unlimited_account' USING ERRCODE = 'P0001';
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
      author_id_snapshot,
      idempotency_key,
      order_kind,
      target_access_level
    ) VALUES (
      v_user_id,
      NULL,
      'pending',
      v_package.amount_minor,
      'RUB',
      v_package.title,
      v_package.sku,
      v_package.amount_minor,
      coalesce(v_package.display_amount_minor, v_package.amount_minor),
      NULL,
      v_idempotency_key,
      'author_project_capacity',
      NULL
    )
    RETURNING * INTO v_new_order;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT o.*
      INTO v_existing
      FROM public.orders AS o
      WHERE o.idempotency_key = v_idempotency_key;

      IF FOUND THEN
        IF v_existing.user_id IS DISTINCT FROM v_user_id
           OR v_existing.order_kind IS DISTINCT FROM 'author_project_capacity'
           OR v_existing.practice_slug_snapshot IS DISTINCT FROM v_package.sku THEN
          RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
        END IF;

        order_id := v_existing.id;
        status := v_existing.status;
        amount_minor := v_existing.amount_minor;
        currency := v_existing.currency;
        order_kind := v_existing.order_kind;
        sku := v_existing.practice_slug_snapshot;
        slots := v_package.slots;
        created_at := v_existing.created_at;
        RETURN NEXT;
        RETURN;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.orders AS o
        WHERE o.user_id = v_user_id
          AND o.order_kind = 'author_project_capacity'
          AND o.status = 'pending'
      ) THEN
        RAISE EXCEPTION 'pending_order_exists' USING ERRCODE = 'P0001';
      END IF;

      RAISE;
  END;

  RETURN QUERY
  SELECT
    v_new_order.id,
    v_new_order.status,
    v_new_order.amount_minor,
    v_new_order.currency,
    v_new_order.order_kind,
    v_package.sku,
    v_package.slots,
    v_new_order.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_author_project_capacity_order(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_author_project_capacity_order(text, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.create_author_project_capacity_order(text, uuid) IS
  'audiolad:author-project-capacity-order:v1; server SKU catalog only; ignores client amount/slots/author_id; one pending per user';

CREATE OR REPLACE FUNCTION public.grant_author_project_capacity_for_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_package record;
  v_existing public.author_project_capacity_grants%ROWTYPE;
  v_new public.author_project_capacity_grants%ROWTYPE;
  v_before integer;
  v_after integer;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(v_order.order_kind, '') IS DISTINCT FROM 'author_project_capacity' THEN
    RAISE EXCEPTION 'invalid_order_kind' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'order_not_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_package
  FROM public.resolve_author_project_capacity_package(v_order.practice_slug_snapshot);

  IF v_order.amount_minor IS DISTINCT FROM v_package.amount_minor THEN
    RAISE EXCEPTION 'capacity_amount_mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT g.*
  INTO v_existing
  FROM public.author_project_capacity_grants AS g
  WHERE g.order_id = v_order.id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'inserted', false,
      'already_granted', true,
      'grant_id', v_existing.id,
      'slots', v_existing.slots,
      'user_id', v_existing.user_id
    );
  END IF;

  SELECT p.*
  INTO v_payment
  FROM public.payments AS p
  WHERE p.order_id = v_order.id
    AND p.status = 'succeeded'
  ORDER BY p.confirmed_at DESC NULLS LAST, p.created_at DESC
  LIMIT 1;

  SELECT coalesce(pr.author_project_slots_purchased, 0)
  INTO v_before
  FROM public.profiles AS pr
  WHERE pr.id = v_order.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.author_project_capacity_grants (
    user_id, order_id, payment_id, sku, slots, amount_minor
  ) VALUES (
    v_order.user_id,
    v_order.id,
    v_payment.id,
    v_package.sku,
    v_package.slots,
    v_package.amount_minor
  )
  ON CONFLICT (order_id) DO NOTHING
  RETURNING * INTO v_new;

  IF v_new.id IS NULL THEN
    SELECT g.* INTO v_existing
    FROM public.author_project_capacity_grants AS g
    WHERE g.order_id = v_order.id;

    RETURN jsonb_build_object(
      'ok', true,
      'inserted', false,
      'already_granted', true,
      'grant_id', v_existing.id,
      'slots', v_existing.slots,
      'user_id', v_existing.user_id
    );
  END IF;

  UPDATE public.profiles
  SET author_project_slots_purchased = coalesce(author_project_slots_purchased, 0) + v_package.slots
  WHERE id = v_order.user_id
  RETURNING author_project_slots_purchased INTO v_after;

  IF v_after IS DISTINCT FROM (coalesce(v_before, 0) + v_package.slots) THEN
    RAISE EXCEPTION 'capacity_increment_mismatch' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', true,
    'already_granted', false,
    'grant_id', v_new.id,
    'slots', v_package.slots,
    'user_id', v_order.user_id,
    'purchased_before', v_before,
    'purchased_after', v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_author_project_capacity_for_order(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_author_project_capacity_for_order(uuid)
  TO service_role;

COMMENT ON FUNCTION public.grant_author_project_capacity_for_order(uuid) IS
  'audiolad:author-project-capacity-grant:v1; idempotent by order_id; increments profiles.author_project_slots_purchased once';

CREATE OR REPLACE FUNCTION public.fulfill_tochka_payment_transactional(
  p_webhook_event_id uuid,
  p_provider_payment_id text,
  p_payment_id uuid,
  p_provider_amount_minor bigint,
  p_provider_currency text,
  p_provider_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.payment_webhook_events%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_now timestamptz := now();
  v_is_test boolean := false;
  v_test_reason text := NULL;
  v_access_before integer := 0;
  v_access_after integer := 0;
  v_grant jsonb;
  v_was_repaired boolean := false;
  v_was_already_complete boolean := false;
  v_access_inserted boolean := false;
  v_outcome text;
  v_review_reason text := NULL;
  v_payment_before text;
  v_order_before text;
  v_payment_found boolean := false;
  v_publication_class text;
  v_order_kind text;
BEGIN
  IF p_webhook_event_id IS NULL THEN
    RAISE EXCEPTION 'webhook_event_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_event
  FROM public.payment_webhook_events AS e
  WHERE e.id = p_webhook_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.provider IS DISTINCT FROM 'tochka' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'ignored',
      processed_at = v_now,
      updated_at = v_now,
      last_error = 'unsupported_provider'
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'ignored',
      'review_reason', 'unsupported_provider',
      'webhook_event_id', v_event.id,
      'processing_status', 'ignored'
    );
  END IF;

  IF v_event.processing_status IN ('processed', 'duplicate') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'already_complete',
      'was_already_complete', true,
      'was_repaired', false,
      'payment_id', v_event.payment_id,
      'order_id', v_event.order_id,
      'webhook_event_id', v_event.id,
      'processing_status', v_event.processing_status
    );
  END IF;

  IF v_event.processing_status = 'requires_review' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', v_event.review_reason,
      'payment_id', v_event.payment_id,
      'order_id', v_event.order_id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'was_already_complete', true,
      'was_repaired', false
    );
  END IF;

  IF p_provider_status IS DISTINCT FROM 'APPROVED' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'ignored',
      processed_at = v_now,
      updated_at = v_now,
      last_error = 'unsupported_status'
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'ignored',
      'review_reason', 'unsupported_status',
      'webhook_event_id', v_event.id,
      'processing_status', 'ignored'
    );
  END IF;

  -- Locate payment: prefer internal id, else provider operation id.
  IF p_payment_id IS NOT NULL THEN
    SELECT *
    INTO v_payment
    FROM public.payments AS p
    WHERE p.id = p_payment_id
      AND p.provider = 'tochka'
    FOR UPDATE;

    v_payment_found := FOUND;
  END IF;

  IF NOT v_payment_found
     AND p_provider_payment_id IS NOT NULL
     AND btrim(p_provider_payment_id) <> '' THEN
    SELECT *
    INTO v_payment
    FROM public.payments AS p
    WHERE p.provider = 'tochka'
      AND p.provider_payment_id = p_provider_payment_id
    FOR UPDATE;

    v_payment_found := FOUND;
  END IF;

  IF NOT v_payment_found THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'payment_not_found',
      last_error = 'payment_not_found',
      provider_payment_id = coalesce(
        provider_payment_id,
        nullif(btrim(coalesce(p_provider_payment_id, '')), '')
      )
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'payment_not_found',
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review'
    );
  END IF;

  IF p_provider_payment_id IS NOT NULL
     AND btrim(p_provider_payment_id) <> ''
     AND v_payment.provider_payment_id IS NOT NULL
     AND v_payment.provider_payment_id IS DISTINCT FROM btrim(p_provider_payment_id) THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'provider_payment_id_mismatch',
      last_error = 'provider_payment_id_mismatch',
      payment_id = v_payment.id,
      order_id = v_payment.order_id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'provider_payment_id_mismatch',
      'payment_id', v_payment.id,
      'order_id', v_payment.order_id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review'
    );
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = v_payment.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'order_not_found',
      last_error = 'order_not_found',
      payment_id = v_payment.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'order_not_found',
      'payment_id', v_payment.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review'
    );
  END IF;

  v_payment_before := v_payment.status;
  v_order_before := v_order.status;

  -- Amount / currency integrity (integer minor units only).
  IF v_payment.amount_minor IS DISTINCT FROM v_order.amount_minor
     OR v_payment.currency IS DISTINCT FROM v_order.currency
     OR v_payment.currency IS DISTINCT FROM 'RUB'
     OR p_provider_currency IS DISTINCT FROM 'RUB'
     OR p_provider_amount_minor IS NULL
     OR p_provider_amount_minor IS DISTINCT FROM v_payment.amount_minor THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'amount_or_currency_mismatch',
      last_error = 'amount_or_currency_mismatch',
      payment_id = v_payment.id,
      order_id = v_order.id,
      provider_payment_id = coalesce(v_payment.provider_payment_id, p_provider_payment_id)
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'amount_or_currency_mismatch',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'payment_status', v_payment.status,
      'order_status', v_order.status,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_payment.is_test
    );
  END IF;

  -- Test classification from trusted row fields (+ provider id / e2e metadata).
  v_is_test := public.payment_is_test_from_row(
    coalesce(nullif(btrim(coalesce(p_provider_payment_id, '')), ''), v_payment.provider_payment_id),
    v_payment.provider_metadata,
    v_payment.is_test OR v_order.is_test
  );

  IF v_is_test THEN
    IF v_payment.is_test AND v_payment.test_reason IS NOT NULL THEN
      v_test_reason := v_payment.test_reason;
    ELSIF v_order.is_test AND v_order.test_reason IS NOT NULL THEN
      v_test_reason := v_order.test_reason;
    ELSIF coalesce((v_payment.provider_metadata ->> 'e2e_test') IN ('true', 't', '1'), false)
       OR coalesce(p_provider_payment_id, v_payment.provider_payment_id, '') LIKE 'e2e-%' THEN
      v_test_reason := 'e2e_test';
    ELSE
      v_test_reason := 'server_test_flag';
    END IF;
  END IF;

  -- Refunded order cannot return to paid.
  IF v_order.status = 'refunded' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'refunded_order',
      last_error = 'refunded_order',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'refunded_order',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'payment_status', v_payment.status,
      'order_status', v_order.status,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  -- Cancelled / failed order + APPROVED → keep money signal, no silent paid/access.
  IF v_order.status IN ('cancelled', 'failed') THEN
    IF v_payment.status IS DISTINCT FROM 'succeeded' THEN
      IF v_payment.status NOT IN ('pending', 'failed', 'cancelled') THEN
        UPDATE public.payment_webhook_events
        SET
          processing_status = 'requires_review',
          processed_at = v_now,
          updated_at = v_now,
          review_reason = 'unsupported_payment_status',
          last_error = 'unsupported_payment_status',
          payment_id = v_payment.id,
          order_id = v_order.id
        WHERE id = v_event.id;

        RETURN jsonb_build_object(
          'ok', true,
          'outcome', 'requires_review',
          'review_reason', 'unsupported_payment_status',
          'payment_id', v_payment.id,
          'order_id', v_order.id,
          'payment_status', v_payment.status,
          'order_status', v_order.status,
          'webhook_event_id', v_event.id,
          'processing_status', 'requires_review',
          'is_test', v_is_test
        );
      END IF;

      UPDATE public.payments
      SET
        status = 'succeeded',
        provider_payment_id = coalesce(
          nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
          provider_payment_id
        ),
        confirmed_at = coalesce(confirmed_at, v_now),
        updated_at = v_now,
        is_test = v_is_test,
        test_reason = CASE WHEN v_is_test THEN coalesce(test_reason, v_test_reason) ELSE test_reason END,
        provider_metadata = provider_metadata || jsonb_build_object(
          'provider_status', p_provider_status,
          'fulfilled_at', v_now,
          'fulfill_outcome', 'requires_review_cancelled_or_failed_order'
        )
      WHERE id = v_payment.id;
    END IF;

    UPDATE public.orders
    SET
      is_test = CASE WHEN v_is_test THEN true ELSE is_test END,
      test_reason = CASE
        WHEN v_is_test THEN coalesce(test_reason, v_test_reason)
        ELSE test_reason
      END,
      updated_at = v_now
    WHERE id = v_order.id;

    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = CASE
        WHEN v_order.status = 'cancelled' THEN 'cancelled_order_late_approved'
        ELSE 'failed_order_late_approved'
      END,
      last_error = NULL,
      payment_id = v_payment.id,
      order_id = v_order.id,
      provider_payment_id = coalesce(
        nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
        v_payment.provider_payment_id
      )
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', CASE
        WHEN v_order.status = 'cancelled' THEN 'cancelled_order_late_approved'
        ELSE 'failed_order_late_approved'
      END,
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'payment_status', 'succeeded',
      'order_status', v_order.status,
      'access_granted', false,
      'access_inserted', false,
      'was_repaired', false,
      'was_already_complete', false,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  -- Payment transition: pending|failed|cancelled|succeeded → succeeded.
  IF v_payment.status = 'refunded' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'refunded_payment',
      last_error = 'refunded_payment',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'refunded_payment',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  IF v_payment.status NOT IN ('pending', 'failed', 'cancelled', 'succeeded') THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'unsupported_payment_status',
      last_error = 'unsupported_payment_status',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'unsupported_payment_status',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  IF v_order.status NOT IN ('pending', 'paid') THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'unsupported_order_status',
      last_error = 'unsupported_order_status',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'unsupported_order_status',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  v_order_kind := coalesce(v_order.order_kind, 'product_purchase');

  IF v_order_kind = 'author_project_capacity' THEN
    SELECT count(*)::integer
    INTO v_access_before
    FROM public.author_project_capacity_grants AS g
    WHERE g.order_id = v_order.id;
  ELSIF v_order_kind = 'studio_music_license' THEN
    SELECT count(*)::integer
    INTO v_access_before
    FROM public.studio_music_entitlements AS e
    WHERE e.user_id = v_order.user_id
      AND e.practice_id = v_order.practice_id
      AND e.revoked_at IS NULL;
  ELSE
    SELECT count(*)::integer
    INTO v_access_before
    FROM public.user_practices AS up
    WHERE up.user_id = v_order.user_id
      AND up.practice_id = v_order.practice_id;
  END IF;

  -- Apply payment succeeded (idempotent).
  UPDATE public.payments
  SET
    status = 'succeeded',
    provider_payment_id = coalesce(
      nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
      provider_payment_id
    ),
    confirmed_at = coalesce(confirmed_at, v_now),
    updated_at = v_now,
    is_test = v_is_test,
    test_reason = CASE WHEN v_is_test THEN coalesce(test_reason, v_test_reason) ELSE test_reason END,
    provider_metadata = provider_metadata || jsonb_build_object(
      'provider_status', p_provider_status,
      'fulfilled_at', v_now
    )
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  -- Apply order paid (pending → paid; paid stays paid).
  IF v_order.status = 'pending' THEN
    UPDATE public.orders
    SET
      status = 'paid',
      paid_at = coalesce(paid_at, v_now),
      updated_at = v_now,
      is_test = v_is_test,
      test_reason = CASE WHEN v_is_test THEN coalesce(test_reason, v_test_reason) ELSE test_reason END
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  ELSE
    UPDATE public.orders
    SET
      paid_at = coalesce(paid_at, v_now),
      updated_at = v_now,
      is_test = CASE WHEN v_is_test THEN true ELSE is_test END,
      test_reason = CASE
        WHEN v_is_test THEN coalesce(test_reason, v_test_reason)
        ELSE test_reason
      END
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  v_order_kind := coalesce(v_order.order_kind, 'product_purchase');

  IF v_order_kind = 'author_project_capacity' THEN
    v_grant := public.grant_author_project_capacity_for_order(v_order.id);
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);
  ELSIF v_order_kind = 'studio_music_license' THEN
    v_grant := public.grant_studio_music_purchase_entitlement(v_order.id);
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);
  ELSIF v_order_kind = 'course_upgrade' THEN
    IF v_order.target_access_level IS NULL OR v_order.target_access_level < 2 THEN
      RAISE EXCEPTION 'invalid_upgrade_target' USING ERRCODE = '22023';
    END IF;

    SELECT p.publication_class
    INTO v_publication_class
    FROM public.practices AS p
    WHERE p.id = v_order.practice_id;

    IF v_publication_class IS DISTINCT FROM 'course' THEN
      RAISE EXCEPTION 'upgrade_not_course' USING ERRCODE = '22023';
    END IF;

    -- Fulfill from immutable order snapshots (amount already matched
    -- payment/provider). Do not re-read live upgrade_price.
    v_grant := public.grant_practice_access(
      v_order.user_id,
      v_order.practice_id,
      v_order.target_access_level,
      'purchase',
      jsonb_build_object(
        'order_id', v_order.id,
        'payment_id', v_payment.id,
        'target_access_level', v_order.target_access_level,
        'granted_via', 'course_upgrade'
      )
    );
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);

    IF coalesce((v_grant ->> 'access_level')::integer, 0) < v_order.target_access_level THEN
      RAISE EXCEPTION 'access_grant_below_target' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_grant := public.grant_practice_purchase_access(v_order.id);
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);
  END IF;

  IF v_order_kind = 'author_project_capacity' THEN
    SELECT count(*)::integer
    INTO v_access_after
    FROM public.author_project_capacity_grants AS g
    WHERE g.order_id = v_order.id;
  ELSIF v_order_kind = 'studio_music_license' THEN
    SELECT count(*)::integer
    INTO v_access_after
    FROM public.studio_music_entitlements AS e
    WHERE e.user_id = v_order.user_id
      AND e.practice_id = v_order.practice_id
      AND e.revoked_at IS NULL;
  ELSE
    SELECT count(*)::integer
    INTO v_access_after
    FROM public.user_practices AS up
    WHERE up.user_id = v_order.user_id
      AND up.practice_id = v_order.practice_id;
  END IF;

  IF v_access_after < 1 THEN
    -- Replay of a paid Studio order after that order's entitlement was
    -- revoked must not invent a new active grant. grant_* returns
    -- already_revoked; do not treat that as a missing first-time grant.
    IF v_order_kind = 'studio_music_license'
       AND coalesce((v_grant ->> 'already_revoked')::boolean, false) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'access_grant_missing_after_fulfill' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Success = valid payment + successful grant, not access_inserted.
  -- Upgrade typically UPDATE (inserted=false, raised=true). Existing
  -- entitlement must not classify a first upgrade as repaired/review.
  IF v_order_kind IN ('course_upgrade', 'studio_music_license', 'author_project_capacity') THEN
    IF v_payment_before = 'succeeded'
       AND v_order_before = 'paid' THEN
      v_was_already_complete := true;
      v_outcome := 'already_complete';
    ELSIF v_payment_before = 'succeeded'
       OR v_order_before = 'paid' THEN
      v_was_repaired := true;
      v_outcome := 'repaired';
    ELSE
      v_outcome := 'completed';
    END IF;
  ELSIF v_payment_before = 'succeeded'
     AND v_order_before = 'paid'
     AND v_access_before >= 1
     AND NOT v_access_inserted THEN
    v_was_already_complete := true;
    v_outcome := 'already_complete';
  ELSIF v_payment_before = 'succeeded'
     OR v_order_before = 'paid'
     OR v_access_before >= 1 THEN
    v_was_repaired := true;
    v_outcome := 'repaired';
  ELSE
    v_outcome := 'completed';
  END IF;

  UPDATE public.payment_webhook_events
  SET
    processing_status = CASE
      WHEN v_was_already_complete THEN 'duplicate'
      ELSE 'processed'
    END,
    processed_at = v_now,
    updated_at = v_now,
    last_error = NULL,
    review_reason = NULL,
    payment_id = v_payment.id,
    order_id = v_order.id,
    provider_payment_id = v_payment.provider_payment_id
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', v_outcome,
    'review_reason', NULL,
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'payment_status', v_payment.status,
    'order_status', v_order.status,
    'access_granted', (v_access_after >= 1),
    'access_inserted', v_access_inserted,
    'access_rows', v_access_after,
    'was_repaired', v_was_repaired,
    'was_already_complete', v_was_already_complete,
    'webhook_event_id', v_event.id,
    'processing_status', CASE
      WHEN v_was_already_complete THEN 'duplicate'
      ELSE 'processed'
    END,
    'is_test', v_is_test,
    'test_reason', v_test_reason
  );
EXCEPTION
  WHEN OTHERS THEN
    -- PL/pgSQL subtransaction: main-body writes roll back; this UPDATE is kept
    -- when we RETURN (not RAISE), so the event stays retryable as `failed`.
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'failed',
      updated_at = now(),
      last_error = left(SQLERRM, 500)
    WHERE id = p_webhook_event_id
      AND processing_status NOT IN ('processed', 'duplicate', 'requires_review');

    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'failed',
      'review_reason', 'transient_or_internal_error',
      'error_code', SQLSTATE,
      'webhook_event_id', p_webhook_event_id,
      'processing_status', 'failed'
    );
END;
$$;


REVOKE ALL ON FUNCTION public.fulfill_tochka_payment_transactional(
  uuid, text, uuid, bigint, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_tochka_payment_transactional(
  uuid, text, uuid, bigint, text, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_tochka_payment_transactional(
  uuid, text, uuid, bigint, text, text
) TO service_role;

COMMENT ON FUNCTION public.fulfill_tochka_payment_transactional IS
  'audiolad:payments-p30-author-project-capacity:v1; product_purchase | course_upgrade | studio_music_license | author_project_capacity; capacity grants permanent slots via author_project_capacity_grants UNIQUE(order_id); service_role only';

-- Analytics allowlist for capacity funnel events.
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
    'buy_clicked',
    'product_promo_clicked',
    'author_page_view',
    'help_article_view',
    'help_search',
    'help_search_no_results',
    'help_support_open',
    'help_support_submit',
    'help_article_cta_click',
    'guest_studio_open',
    'guest_project_created',
    'guest_render_started',
    'guest_render_completed',
    'guest_mp3_downloaded',
    'guest_registration_gate_shown',
    'guest_auth_cta_clicked',
    'author_project_create_clicked',
    'author_project_capacity_offer_viewed',
    'author_project_capacity_package_selected',
    'author_project_capacity_checkout_started',
    'author_project_capacity_purchase_succeeded',
    'author_project_capacity_purchase_failed'
  );
$$;

DO $$
BEGIN
  IF to_regclass('public.author_project_capacity_grants') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: author_project_capacity_grants missing';
  END IF;
  IF to_regprocedure('public.create_author_project_capacity_order(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: create_author_project_capacity_order missing';
  END IF;
  IF to_regprocedure('public.grant_author_project_capacity_for_order(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: grant_author_project_capacity_for_order missing';
  END IF;
  IF public.is_platform_analytics_event('author_project_capacity_purchase_succeeded') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: capacity analytics events not allowlisted';
  END IF;
END;
$$;

COMMIT;
