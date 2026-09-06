BEGIN;

-- Paid native course upgrades are canonical sales from the paid
-- transaction, not from historical user_practices.access_source.
-- product_purchase keeps requiring access_source='purchase'.
-- This migration does not rewrite entitlement origin.

CREATE OR REPLACE FUNCTION public.canonical_sale_has_paid_access(
  p_order_kind text,
  p_user_id uuid,
  p_practice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_order_kind, 'product_purchase') = 'course_upgrade' THEN
      true
    ELSE EXISTS (
      SELECT 1
      FROM public.user_practices AS up
      WHERE up.user_id = p_user_id
        AND up.practice_id = p_practice_id
        AND up.access_source = 'purchase'
    )
  END;
$$;

COMMENT ON FUNCTION public.canonical_sale_has_paid_access(text, uuid, uuid) IS
  'audiolad:canonical-sales-course-upgrade:v1; product_purchase still requires access_source=purchase. course_upgrade qualifies from the paid order regardless of entitlement origin.';

REVOKE ALL ON FUNCTION public.canonical_sale_has_paid_access(text, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.canonical_sale_has_paid_access(text, uuid, uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_sale_has_paid_access(text, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.canonical_sale_qualifies(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders AS o
    INNER JOIN public.payments AS p
      ON p.order_id = o.id
     AND p.status = 'succeeded'
     AND p.confirmed_at IS NOT NULL
    WHERE o.id = p_order_id
      AND o.paid_at IS NOT NULL
      AND o.status IN ('paid', 'refunded')
      AND coalesce(o.is_test, false) = false
      AND coalesce(p.is_test, false) = false
      AND p.amount_minor = o.amount_minor
      AND p.currency = o.currency
      AND p.currency = 'RUB'
      AND public.canonical_sale_has_paid_access(
        o.order_kind,
        o.user_id,
        o.practice_id
      )
  );
$$;

COMMENT ON FUNCTION public.canonical_sale_qualifies(uuid) IS
  'audiolad:canonical-sales-course-upgrade:v1; paid + succeeded real payment + valid amount. course_upgrade does not require access_source=purchase.';

REVOKE ALL ON FUNCTION public.canonical_sale_qualifies(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.canonical_sale_qualifies(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_sale_qualifies(uuid) TO service_role;

DO $$
BEGIN
  IF to_regprocedure(
    'public.canonical_sale_has_paid_access(text, uuid, uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: canonical_sale_has_paid_access missing';
  END IF;

  IF to_regprocedure('public.canonical_sale_qualifies(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: canonical_sale_qualifies missing';
  END IF;
END
$$;

COMMIT;
