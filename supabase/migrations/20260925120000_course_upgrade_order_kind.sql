BEGIN;

-- Phase 4: native course access-level upgrade checkout.
-- Additive only. Existing rows become product_purchase via DEFAULT.
-- No mass UPDATE. Target is stored on the order (immutable snapshot).
-- Payments do not duplicate target_access_level — order is the SoT.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_kind text NOT NULL DEFAULT 'product_purchase';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS target_access_level integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_order_kind_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_kind_check
      CHECK (order_kind IN ('product_purchase', 'course_upgrade'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_target_access_level_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_target_access_level_check
      CHECK (target_access_level IS NULL OR target_access_level >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_course_upgrade_target_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_course_upgrade_target_check
      CHECK (
        (order_kind = 'product_purchase' AND target_access_level IS NULL)
        OR (order_kind = 'course_upgrade' AND target_access_level >= 2)
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.orders.order_kind IS
  'product_purchase = existing base sale (DEFAULT). course_upgrade = native sequential access-level upgrade for the same practices.id. Not a second public Product.';

COMMENT ON COLUMN public.orders.target_access_level IS
  'Immutable snapshot of the level this order grants. NULL for product_purchase. course_upgrade requires >= 2. Sequential checkout validates current+1 against catalog; no join CHECK.';

-- Config drift: pending/paid upgrade orders keep their snapshot amount.
-- Deleting the corresponding catalog row would break grant_practice_access
-- L2+ catalog checks on webhook replay. Block DELETE for live orders.
CREATE OR REPLACE FUNCTION public.prevent_delete_access_level_with_live_upgrade_orders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.practice_id = OLD.practice_id
      AND o.order_kind = 'course_upgrade'
      AND o.target_access_level = OLD.level
      AND o.status IN ('pending', 'paid')
  ) THEN
    RAISE EXCEPTION 'level_has_live_upgrade_orders'
      USING ERRCODE = 'P0001',
            DETAIL = 'pending_or_paid_course_upgrade';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS practice_access_levels_protect_live_upgrade_orders
  ON public.practice_access_levels;
CREATE TRIGGER practice_access_levels_protect_live_upgrade_orders
  BEFORE DELETE ON public.practice_access_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_access_level_with_live_upgrade_orders();

COMMENT ON FUNCTION public.prevent_delete_access_level_with_live_upgrade_orders() IS
  'Blocks DELETE of a practice_access_levels row while a pending/paid course_upgrade order targets that level. Failed/cancelled/refunded orders do not block; retries after terminal failure use the live catalog price.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'order_kind'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: orders.order_kind missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'target_access_level'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: orders.target_access_level missing';
  END IF;

  IF to_regprocedure('public.prevent_delete_access_level_with_live_upgrade_orders()') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: delete-guard function missing';
  END IF;
END
$$;

COMMIT;
