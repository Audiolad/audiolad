-- Isolated enqueue used after canonical helpers exist.
-- Never apply to production.

CREATE OR REPLACE FUNCTION public.enqueue_author_sale_email(p_sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.canonical_sale_qualifies(p_sale_id) THEN
    RETURN false;
  END IF;

  INSERT INTO public.author_sale_email_outbox (
    sale_id,
    idempotency_key,
    recipient_email,
    payload
  )
  VALUES (
    p_sale_id,
    'author_product_sold:' || p_sale_id::text,
    'author@example.test',
    jsonb_build_object('amount_minor', (
      SELECT amount_minor FROM public.orders WHERE id = p_sale_id
    ))
  )
  ON CONFLICT (sale_id) DO UPDATE
  SET
    payload = EXCLUDED.payload,
    updated_at = now()
  WHERE public.author_sale_email_outbox.status IN ('pending', 'failed');

  RETURN true;
END;
$$;
