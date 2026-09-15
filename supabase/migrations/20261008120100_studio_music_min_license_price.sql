-- Studio license minimum: 499 ₽ (49900 minor).
-- Slice 1: effective acquisition floor + NOT VALID CHECK for new/updated rows.
-- Does NOT rewrite existing studio_music_price_minor values.
-- Listener MIN_PAID_PRICE_RUB (49) is unchanged.

-- 1) Canonical SQL resolve: FIXED and AUTO never return amount_minor < 49900.
CREATE OR REPLACE FUNCTION public.resolve_studio_music_acquisition(
  p_practice public.practices,
  p_user_id uuid DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  acquisition_status text,
  pricing_mode text,
  studio_is_free boolean,
  amount_minor bigint,
  listener_is_free boolean,
  listener_amount_minor bigint,
  base_price_minor bigint,
  promotion_price_minor bigint,
  promotion_id uuid,
  promotion_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text;
  v_resolved record;
  v_listener_minor bigint;
  v_listener_free boolean;
  v_amount bigint;
BEGIN
  IF p_practice.id IS NULL
     OR p_practice.deleted_at IS NOT NULL
     OR p_practice.status IS DISTINCT FROM 'published'
     OR NOT public.is_studio_music_publication(p_practice)
     OR p_practice.music_usage_permission IS DISTINCT FROM 'platform_reuse_allowed' THEN
    acquisition_status := 'unavailable';
    pricing_mode := p_practice.studio_music_pricing_mode;
    studio_is_free := false;
    amount_minor := NULL;
    listener_is_free := coalesce(p_practice.is_free, false)
      OR p_practice.price IS NULL
      OR p_practice.price <= 0;
    listener_amount_minor := NULL;
    base_price_minor := NULL;
    promotion_price_minor := NULL;
    promotion_id := NULL;
    promotion_type := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_mode := p_practice.studio_music_pricing_mode;
  IF v_mode IS NULL THEN
    IF p_practice.is_free IS TRUE
       OR p_practice.price IS NULL
       OR p_practice.price <= 0 THEN
      v_mode := 'free';
    ELSE
      v_mode := 'auto_2x_listener';
    END IF;
  END IF;

  SELECT *
  INTO v_resolved
  FROM public.resolve_practice_effective_price(
    p_practice.id,
    'checkout',
    NULL,
    p_user_id,
    coalesce(p_now, now())
  );

  v_listener_minor := v_resolved.final_price_minor;
  v_listener_free :=
    coalesce(v_resolved.is_free, false)
    OR v_listener_minor IS NULL
    OR v_listener_minor <= 0
    OR p_practice.is_free IS TRUE
    OR p_practice.price IS NULL
    OR p_practice.price <= 0;

  IF v_mode = 'free' THEN
    acquisition_status := 'free';
    pricing_mode := 'free';
    studio_is_free := true;
    amount_minor := NULL;
    listener_is_free := v_listener_free;
    listener_amount_minor := CASE WHEN v_listener_free THEN NULL ELSE v_listener_minor END;
    base_price_minor := v_resolved.base_price_minor;
    promotion_price_minor := v_resolved.sale_price_minor;
    promotion_id := v_resolved.promotion_id;
    promotion_type := v_resolved.promotion_type;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_mode = 'fixed' THEN
    v_amount := p_practice.studio_music_price_minor;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      acquisition_status := 'unavailable';
      pricing_mode := 'fixed';
      studio_is_free := false;
      amount_minor := NULL;
      listener_is_free := v_listener_free;
      listener_amount_minor := CASE WHEN v_listener_free THEN NULL ELSE v_listener_minor END;
      base_price_minor := v_resolved.base_price_minor;
      promotion_price_minor := v_resolved.sale_price_minor;
      promotion_id := v_resolved.promotion_id;
      promotion_type := v_resolved.promotion_type;
      RETURN NEXT;
      RETURN;
    END IF;

    acquisition_status := 'paid';
    pricing_mode := 'fixed';
    studio_is_free := false;
    -- Effective floor: legacy stored fixed < 49900 still checkouts at 49900.
    amount_minor := GREATEST(v_amount, 49900);
    listener_is_free := v_listener_free;
    listener_amount_minor := CASE WHEN v_listener_free THEN NULL ELSE v_listener_minor END;
    base_price_minor := v_resolved.base_price_minor;
    promotion_price_minor := v_resolved.sale_price_minor;
    promotion_id := v_resolved.promotion_id;
    promotion_type := v_resolved.promotion_type;
    RETURN NEXT;
    RETURN;
  END IF;

  -- auto_2x_listener: 2 × current listener checkout effective.
  IF v_listener_minor IS NULL OR v_listener_minor <= 0 THEN
    acquisition_status := 'unavailable';
    pricing_mode := 'auto_2x_listener';
    studio_is_free := false;
    amount_minor := NULL;
    listener_is_free := true;
    listener_amount_minor := NULL;
    base_price_minor := v_resolved.base_price_minor;
    promotion_price_minor := v_resolved.sale_price_minor;
    promotion_id := v_resolved.promotion_id;
    promotion_type := v_resolved.promotion_type;
    RETURN NEXT;
    RETURN;
  END IF;

  acquisition_status := 'paid';
  pricing_mode := 'auto_2x_listener';
  studio_is_free := false;
  -- AUTO floor: max(2 × listener effective, 49900).
  amount_minor := GREATEST(v_listener_minor * 2, 49900);
  listener_is_free := false;
  listener_amount_minor := v_listener_minor;
  base_price_minor := v_resolved.base_price_minor;
  promotion_price_minor := v_resolved.sale_price_minor;
  promotion_id := v_resolved.promotion_id;
  promotion_type := v_resolved.promotion_type;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.resolve_studio_music_acquisition(public.practices, uuid, timestamptz) IS
  'audiolad:studio-music-acquisition:v2; canonical Studio acquire price/status. free | auto_2x_listener (GREATEST(2 × listener checkout effective, 49900)) | fixed (GREATEST(studio_music_price_minor, 49900)). Listener promotions affect AUTO only before floor. Does not write entitlements or user_practices.';

-- 2) Strengthen CHECK for new/changed rows to >= 49900 without failing legacy rows.
-- NOT VALID skips existing-row scan; INSERT/UPDATE still enforce the new check.
ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_studio_music_price_minor_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_studio_music_price_minor_check
  CHECK (
    (
      studio_music_pricing_mode IS DISTINCT FROM 'fixed'
      AND studio_music_price_minor IS NULL
    )
    OR (
      studio_music_pricing_mode = 'fixed'
      AND studio_music_price_minor IS NOT NULL
      AND studio_music_price_minor >= 49900
      AND studio_music_price_minor <= 10000000
      AND studio_music_price_minor % 100 = 0
    )
  ) NOT VALID;

COMMENT ON COLUMN public.practices.studio_music_price_minor IS
  'Fixed Studio-use amount in kopecks. Used only when studio_music_pricing_mode=fixed. New/updated rows require whole-ruble range 499–100000 ₽; legacy lower values may remain until a later normalization slice. Checkout floors via resolve_studio_music_acquisition.';

COMMENT ON CONSTRAINT practices_studio_music_price_minor_check ON public.practices IS
  'Studio fixed price >= 49900 minor for new/updated rows. NOT VALID: existing legacy rows below 499 are not scanned; VALIDATE after a future data slice.';

DO $$
BEGIN
  IF to_regprocedure('public.resolve_studio_music_acquisition(public.practices, uuid, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: resolve_studio_music_acquisition missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_studio_music_price_minor_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    RAISE EXCEPTION 'Post-check failed: practices_studio_music_price_minor_check missing';
  END IF;
END
$$;
