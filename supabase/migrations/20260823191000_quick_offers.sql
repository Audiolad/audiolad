BEGIN;

-- ---------------------------------------------------------------------------
-- Quick offers — reusable selling-page template (catalog / quick-offer)
-- Regular price stays on practices.price. Promo price lives on the offer
-- because the platform has no separate sale-price / discount table.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quick_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,

  practice_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE RESTRICT,

  title text NOT NULL,
  slug text NOT NULL,

  hero_image_path text NULL,
  short_description text NOT NULL,

  promo_price integer NOT NULL,

  cta_text text NOT NULL,
  timer_duration_seconds integer NOT NULL DEFAULT 1200,

  status text NOT NULL DEFAULT 'draft',
  template_key text NOT NULL DEFAULT 'catalog/quick-offer',
  mid_cta_after_count integer NULL,

  published_at timestamptz NULL,

  created_by uuid NULL
    REFERENCES auth.users (id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT quick_offers_slug_unique
    UNIQUE (slug),

  CONSTRAINT quick_offers_status_check
    CHECK (status IN ('draft', 'published')),

  CONSTRAINT quick_offers_slug_check
    CHECK (slug ~ '^[a-z0-9-]{2,64}$'),

  CONSTRAINT quick_offers_title_check
    CHECK (
      char_length(btrim(title)) > 0
      AND char_length(title) <= 160
    ),

  CONSTRAINT quick_offers_description_check
    CHECK (
      char_length(btrim(short_description)) > 0
      AND char_length(short_description) <= 500
    ),

  CONSTRAINT quick_offers_cta_check
    CHECK (
      char_length(btrim(cta_text)) > 0
      AND char_length(cta_text) <= 80
    ),

  CONSTRAINT quick_offers_promo_price_check
    CHECK (promo_price > 0 AND promo_price <= 999999),

  CONSTRAINT quick_offers_timer_check
    CHECK (
      timer_duration_seconds >= 60
      AND timer_duration_seconds <= 86400
    ),

  CONSTRAINT quick_offers_template_key_check
    CHECK (template_key = 'catalog/quick-offer'),

  CONSTRAINT quick_offers_mid_cta_check
    CHECK (
      mid_cta_after_count IS NULL
      OR mid_cta_after_count >= 1
    )
);

CREATE INDEX IF NOT EXISTS quick_offers_author_id_status_updated_idx
  ON public.quick_offers (author_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS quick_offers_practice_id_idx
  ON public.quick_offers (practice_id);

COMMENT ON TABLE public.quick_offers IS
  'Reusable selling pages. Charge amount is resolved server-side from practices.price (regular) and quick_offers.promo_price (active visitor window).';

COMMENT ON COLUMN public.quick_offers.promo_price IS
  'Offer selling price in whole rubles. Not a second catalog discount system; used only on this selling page while the visitor timer is active.';

COMMENT ON COLUMN public.quick_offers.template_key IS
  'First template is catalog/quick-offer. Later templates can be added without rewriting the entity.';

COMMENT ON COLUMN public.quick_offers.hero_image_path IS
  'Storage object path in author-assets: authors/{author_id}/quick-offers/{offer_id}/hero/...';

-- ---------------------------------------------------------------------------
-- Materials (vertical 3:4 cards). Format label only; numbers come from order.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quick_offer_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  offer_id uuid NOT NULL
    REFERENCES public.quick_offers (id) ON DELETE CASCADE,

  image_path text NULL,
  format_label text NOT NULL,
  sort_order integer NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT quick_offer_materials_offer_sort_unique
    UNIQUE (offer_id, sort_order),

  CONSTRAINT quick_offer_materials_sort_check
    CHECK (sort_order >= 0 AND sort_order < 60),

  CONSTRAINT quick_offer_materials_format_check
    CHECK (
      char_length(btrim(format_label)) > 0
      AND char_length(format_label) <= 6
      AND format_label !~ E'[\r\n]'
    )
  -- char_length counts characters, not bytes. Cyrillic «Аудио» is 5.
);

CREATE INDEX IF NOT EXISTS quick_offer_materials_offer_id_sort_idx
  ON public.quick_offer_materials (offer_id, sort_order);

COMMENT ON TABLE public.quick_offer_materials IS
  'Ordered gallery cards for a quick offer. Caption is auto-numbered from sort_order + format_label.';

-- ---------------------------------------------------------------------------
-- updated_at + ownership + status guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_quick_offers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quick_offers_set_updated_at ON public.quick_offers;
CREATE TRIGGER quick_offers_set_updated_at
  BEFORE UPDATE ON public.quick_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_quick_offers_updated_at();

CREATE OR REPLACE FUNCTION public.set_quick_offer_materials_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quick_offer_materials_set_updated_at ON public.quick_offer_materials;
CREATE TRIGGER quick_offer_materials_set_updated_at
  BEFORE UPDATE ON public.quick_offer_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_quick_offer_materials_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_quick_offer_product_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_practice_author uuid;
BEGIN
  SELECT p.author_id
  INTO v_practice_author
  FROM public.practices AS p
  WHERE p.id = NEW.practice_id;

  IF v_practice_author IS NULL THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice_author IS DISTINCT FROM NEW.author_id THEN
    RAISE EXCEPTION 'quick_offer_product_owner_mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'published'
    AND NEW.practice_id IS DISTINCT FROM OLD.practice_id THEN
    RAISE EXCEPTION 'quick_offer_product_locked'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quick_offers_product_owner ON public.quick_offers;
CREATE TRIGGER quick_offers_product_owner
  BEFORE INSERT OR UPDATE OF practice_id, author_id
  ON public.quick_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_quick_offer_product_owner();

CREATE OR REPLACE FUNCTION public.enforce_quick_offer_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('audiolad.quick_offer_status_bypass', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'quick_offer_status_change_requires_rpc'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quick_offers_status_change_guard ON public.quick_offers;
CREATE TRIGGER quick_offers_status_change_guard
  BEFORE UPDATE OF status
  ON public.quick_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_quick_offer_status_change();

CREATE OR REPLACE FUNCTION public.enforce_quick_offer_materials_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_count
  FROM public.quick_offer_materials AS m
  WHERE m.offer_id = NEW.offer_id;

  IF v_count >= 60 THEN
    RAISE EXCEPTION 'quick_offer_materials_too_many'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quick_offer_materials_limit ON public.quick_offer_materials;
CREATE TRIGGER quick_offer_materials_limit
  BEFORE INSERT
  ON public.quick_offer_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_quick_offer_materials_limit();

-- ---------------------------------------------------------------------------
-- RLS — reuse user_can_read_author_promotion
-- ---------------------------------------------------------------------------

ALTER TABLE public.quick_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_offer_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quick_offers_select ON public.quick_offers;
CREATE POLICY quick_offers_select
  ON public.quick_offers
  FOR SELECT
  TO authenticated
  USING (public.user_can_read_author_promotion(author_id));

DROP POLICY IF EXISTS quick_offers_insert ON public.quick_offers;
CREATE POLICY quick_offers_insert
  ON public.quick_offers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_read_author_promotion(author_id));

DROP POLICY IF EXISTS quick_offers_update ON public.quick_offers;
CREATE POLICY quick_offers_update
  ON public.quick_offers
  FOR UPDATE
  TO authenticated
  USING (public.user_can_read_author_promotion(author_id))
  WITH CHECK (public.user_can_read_author_promotion(author_id));

DROP POLICY IF EXISTS quick_offers_delete ON public.quick_offers;
CREATE POLICY quick_offers_delete
  ON public.quick_offers
  FOR DELETE
  TO authenticated
  USING (public.user_can_read_author_promotion(author_id));

DROP POLICY IF EXISTS quick_offer_materials_select ON public.quick_offer_materials;
CREATE POLICY quick_offer_materials_select
  ON public.quick_offer_materials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.quick_offers AS qo
      WHERE qo.id = quick_offer_materials.offer_id
        AND public.user_can_read_author_promotion(qo.author_id)
    )
  );

DROP POLICY IF EXISTS quick_offer_materials_insert ON public.quick_offer_materials;
CREATE POLICY quick_offer_materials_insert
  ON public.quick_offer_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.quick_offers AS qo
      WHERE qo.id = quick_offer_materials.offer_id
        AND public.user_can_read_author_promotion(qo.author_id)
    )
  );

DROP POLICY IF EXISTS quick_offer_materials_update ON public.quick_offer_materials;
CREATE POLICY quick_offer_materials_update
  ON public.quick_offer_materials
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.quick_offers AS qo
      WHERE qo.id = quick_offer_materials.offer_id
        AND public.user_can_read_author_promotion(qo.author_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.quick_offers AS qo
      WHERE qo.id = quick_offer_materials.offer_id
        AND public.user_can_read_author_promotion(qo.author_id)
    )
  );

DROP POLICY IF EXISTS quick_offer_materials_delete ON public.quick_offer_materials;
CREATE POLICY quick_offer_materials_delete
  ON public.quick_offer_materials
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.quick_offers AS qo
      WHERE qo.id = quick_offer_materials.offer_id
        AND public.user_can_read_author_promotion(qo.author_id)
    )
  );

REVOKE ALL ON public.quick_offers FROM PUBLIC;
REVOKE ALL ON public.quick_offer_materials FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_offer_materials TO authenticated;
GRANT ALL ON public.quick_offers TO service_role;
GRANT ALL ON public.quick_offer_materials TO service_role;

-- ---------------------------------------------------------------------------
-- Publish / unpublish
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_quick_offer(
  p_offer_id uuid,
  p_published_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_offer public.quick_offers%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_material_count integer;
  v_missing_images integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_offer
  FROM public.quick_offers AS qo
  WHERE qo.id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quick_offer_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.user_can_read_author_promotion(v_offer.author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_offer.status = 'published' THEN
    RAISE EXCEPTION 'quick_offer_publish_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  IF v_offer.hero_image_path IS NULL OR btrim(v_offer.hero_image_path) = '' THEN
    RAISE EXCEPTION 'quick_offer_hero_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = v_offer.practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.author_id IS DISTINCT FROM v_offer.author_id
     OR v_practice.status IS DISTINCT FROM 'published'
     OR v_practice.is_free IS TRUE
     OR v_practice.price IS NULL
     OR v_practice.price <= 0 THEN
    RAISE EXCEPTION 'quick_offer_product_not_eligible'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_material_count
  FROM public.quick_offer_materials AS m
  WHERE m.offer_id = v_offer.id;

  IF v_material_count < 1 THEN
    RAISE EXCEPTION 'quick_offer_materials_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_missing_images
  FROM public.quick_offer_materials AS m
  WHERE m.offer_id = v_offer.id
    AND (m.image_path IS NULL OR btrim(m.image_path) = '');

  IF v_missing_images > 0 THEN
    RAISE EXCEPTION 'quick_offer_materials_required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('audiolad.quick_offer_status_bypass', '1', true);

  UPDATE public.quick_offers AS qo
  SET
    status = 'published',
    published_at = COALESCE(qo.published_at, p_published_at),
    updated_at = clock_timestamp()
  WHERE qo.id = v_offer.id;

  RETURN jsonb_build_object(
    'offer_id', v_offer.id,
    'status', 'published',
    'published_at', COALESCE(v_offer.published_at, p_published_at)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_quick_offer(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_quick_offer(uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_quick_offer(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_quick_offer(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.unpublish_quick_offer(
  p_offer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_offer public.quick_offers%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_offer
  FROM public.quick_offers AS qo
  WHERE qo.id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quick_offer_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.user_can_read_author_promotion(v_offer.author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_offer.status <> 'published' THEN
    RAISE EXCEPTION 'quick_offer_unpublish_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('audiolad.quick_offer_status_bypass', '1', true);

  UPDATE public.quick_offers AS qo
  SET
    status = 'draft',
    updated_at = clock_timestamp()
  WHERE qo.id = v_offer.id;

  RETURN jsonb_build_object(
    'offer_id', v_offer.id,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unpublish_quick_offer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_quick_offer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unpublish_quick_offer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_quick_offer(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Public read — published only. Drafts are not reachable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_quick_offer(
  p_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offer public.quick_offers%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_materials jsonb;
BEGIN
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_offer
  FROM public.quick_offers AS qo
  WHERE qo.slug = btrim(p_slug)
    AND qo.status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = v_offer.practice_id
    AND p.status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'offer_id', m.offer_id,
        'image_path', m.image_path,
        'format_label', m.format_label,
        'sort_order', m.sort_order,
        'created_at', m.created_at,
        'updated_at', m.updated_at
      )
      ORDER BY m.sort_order
    ),
    '[]'::jsonb
  )
  INTO v_materials
  FROM public.quick_offer_materials AS m
  WHERE m.offer_id = v_offer.id;

  RETURN jsonb_build_object(
    'id', v_offer.id,
    'author_id', v_offer.author_id,
    'practice_id', v_offer.practice_id,
    'title', v_offer.title,
    'slug', v_offer.slug,
    'hero_image_path', v_offer.hero_image_path,
    'short_description', v_offer.short_description,
    'promo_price', v_offer.promo_price,
    'cta_text', v_offer.cta_text,
    'timer_duration_seconds', v_offer.timer_duration_seconds,
    'status', v_offer.status,
    'template_key', v_offer.template_key,
    'mid_cta_after_count', v_offer.mid_cta_after_count,
    'published_at', v_offer.published_at,
    'created_at', v_offer.created_at,
    'updated_at', v_offer.updated_at,
    'practices', jsonb_build_object(
      'id', v_practice.id,
      'slug', v_practice.slug,
      'title', v_practice.title,
      'status', v_practice.status,
      'is_free', v_practice.is_free,
      'price', v_practice.price,
      'author_id', v_practice.author_id
    ),
    'quick_offer_materials', v_materials
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_quick_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_quick_offer(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_quick_offer(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_quick_offer(text) TO service_role;

COMMENT ON FUNCTION public.get_public_quick_offer(text) IS
  'audiolad:quick-offer-public:v1; published offers only.';

-- Remember which published offer repriced a pending order so payment
-- can re-resolve the amount immediately before the payment intent.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quick_offer_id uuid NULL
  REFERENCES public.quick_offers (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_quick_offer_id_idx
  ON public.orders (quick_offer_id)
  WHERE quick_offer_id IS NOT NULL;

COMMENT ON COLUMN public.orders.quick_offer_id IS
  'Published quick offer that last priced this pending order. Payment re-resolves from the signed visitor window; client amounts are ignored.';

-- ---------------------------------------------------------------------------
-- Server-side offer amount. Never trusts a client-sent ruble amount.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_quick_offer_charge_rubles(
  p_regular_price integer,
  p_promo_price integer,
  p_timer_duration_seconds integer,
  p_window_expires_at timestamptz,
  p_now timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now timestamptz := coalesce(p_now, clock_timestamp());
BEGIN
  IF p_regular_price IS NULL OR p_regular_price <= 0 THEN
    RETURN NULL;
  END IF;

  IF p_promo_price IS NULL OR p_promo_price <= 0 OR p_promo_price >= p_regular_price THEN
    RETURN p_regular_price;
  END IF;

  -- Missing / unproven window is regular price. Promo requires a
  -- server-verified visitor window that is still in the future.
  IF p_window_expires_at IS NULL THEN
    RETURN p_regular_price;
  END IF;

  IF p_window_expires_at <= v_now THEN
    RETURN p_regular_price;
  END IF;

  IF p_window_expires_at > v_now + make_interval(secs => coalesce(p_timer_duration_seconds, 0) + 60) THEN
    RETURN p_regular_price;
  END IF;

  RETURN p_promo_price;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_quick_offer_amount(
  p_order_id uuid,
  p_quick_offer_id uuid,
  p_window_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_offer public.quick_offers%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_charge integer;
  v_charge_minor bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_order_id IS NULL OR p_quick_offer_id IS NULL THEN
    RAISE EXCEPTION 'quick_offer_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'quick_offer_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'quick_offer_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = v_order.practice_id
    AND p.status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_offer
  FROM public.quick_offers AS qo
  WHERE qo.id = p_quick_offer_id;

  IF NOT FOUND
    OR v_offer.status IS DISTINCT FROM 'published'
    OR v_offer.practice_id IS DISTINCT FROM v_order.practice_id THEN
    v_charge := v_practice.price;
  ELSE
    v_charge := public.resolve_quick_offer_charge_rubles(
      v_practice.price,
      v_offer.promo_price,
      v_offer.timer_duration_seconds,
      p_window_expires_at
    );
  END IF;

  IF v_charge IS NULL OR v_charge <= 0 THEN
    RAISE EXCEPTION 'invalid_practice_price'
      USING ERRCODE = '22023';
  END IF;

  v_charge_minor := v_charge::bigint * 100;

  UPDATE public.orders AS o
  SET
    amount_minor = v_charge_minor,
    price_minor_snapshot = v_charge_minor,
    quick_offer_id = p_quick_offer_id,
    updated_at = now()
  WHERE o.id = v_order.id
    AND o.status = 'pending'
    AND o.user_id = v_user_id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'amount_minor', v_order.amount_minor,
    'price_minor_snapshot', v_order.price_minor_snapshot,
    'currency', v_order.currency
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_quick_offer_amount(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_quick_offer_amount(uuid, uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_quick_offer_amount(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_quick_offer_amount(uuid, uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.apply_quick_offer_amount(uuid, uuid, timestamptz) IS
  'audiolad:quick-offer-amount:v1; rewrites pending order amount from product + published offer. Client amount is ignored.';

COMMIT;
