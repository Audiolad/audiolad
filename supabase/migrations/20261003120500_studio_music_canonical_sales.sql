BEGIN;

-- Paid studio_music_license orders are canonical sales from the paid
-- transaction, not from user_practices. product_purchase still requires
-- access_source='purchase'. course_upgrade semantics are unchanged.
-- ensure_author_sale_accrual already accrues any succeeded payment with
-- an author snapshot; this helper is what previously excluded Studio
-- licenses from author finance lists.

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
    WHEN coalesce(p_order_kind, 'product_purchase') IN (
      'course_upgrade',
      'studio_music_license'
    ) THEN
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
  'audiolad:canonical-sales-studio-music:v1; product_purchase still requires access_source=purchase. course_upgrade and studio_music_license qualify from the paid order. Studio sales must not fake user_practices.';

DO $$
BEGIN
  IF to_regprocedure('public.canonical_sale_qualifies(uuid)') IS NOT NULL THEN
    EXECUTE $c$
      COMMENT ON FUNCTION public.canonical_sale_qualifies(uuid) IS
        'audiolad:canonical-sales-studio-music:v1; paid + succeeded real payment + valid amount. course_upgrade and studio_music_license do not require access_source=purchase.';
    $c$;
  END IF;

  IF to_regprocedure('public.author_canonical_sales_base(uuid, boolean, boolean)') IS NOT NULL THEN
    EXECUTE $c$
      COMMENT ON FUNCTION public.author_canonical_sales_base(uuid, boolean, boolean) IS
        'audiolad:canonical-sales; author-scoped canonical sales projection. course_upgrade and studio_music_license count from the paid transaction; product_purchase still requires access_source=purchase. Succeeded payment must match order amount/currency and RUB, same as canonical_sale_qualifies. No buyer email/phone/ids.';
    $c$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regprocedure(
    'public.canonical_sale_has_paid_access(text, uuid, uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: canonical_sale_has_paid_access missing';
  END IF;
END
$$;

COMMIT;
