BEGIN;

-- The replacement operation needs child-table privileges, but callers must
-- never receive those privileges directly. Keep all names schema-qualified
-- and resolve built-ins only from pg_catalog.
CREATE OR REPLACE FUNCTION public.valid_practice_seo_secondary_queries(p_values text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT cardinality(p_values) <= 10
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(p_values) AS value
      WHERE NULLIF(btrim(value), '') IS NULL
         OR char_length(btrim(value)) > 120
    )
    AND cardinality(
      ARRAY(
        SELECT lower(btrim(value))
        FROM unnest(p_values) AS value
      )
    ) = (
      SELECT count(DISTINCT lower(btrim(value)))
      FROM unnest(p_values) AS value
    );
$$;

CREATE OR REPLACE FUNCTION public.replace_practice_seo_content(
  p_practice_id uuid,
  p_usage_items jsonb,
  p_faq_items jsonb,
  p_related_practice_ids jsonb,
  p_related_listen_slugs jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_text text;
  v_related_text text;
  v_position integer := 0;
  v_related_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'practice_seo_not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_manage_practice_seo(p_practice_id) THEN
    RAISE EXCEPTION 'practice_seo_access_denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(p_usage_items) <> 'array'
     OR jsonb_typeof(p_faq_items) <> 'array'
     OR jsonb_typeof(p_related_practice_ids) <> 'array'
     OR jsonb_typeof(p_related_listen_slugs) <> 'array'
     OR jsonb_array_length(p_usage_items) > 8
     OR jsonb_array_length(p_faq_items) > 8
     OR jsonb_array_length(p_related_practice_ids) > 8
     OR jsonb_array_length(p_related_listen_slugs) > 8 THEN
    RAISE EXCEPTION 'invalid_practice_seo_content' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.practices WHERE id = p_practice_id FOR UPDATE;
  DELETE FROM public.practice_seo_usage_items WHERE practice_id = p_practice_id;
  DELETE FROM public.practice_seo_faq_items WHERE practice_id = p_practice_id;
  DELETE FROM public.practice_related_products WHERE practice_id = p_practice_id;
  DELETE FROM public.practice_related_listens WHERE practice_id = p_practice_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_usage_items)
  LOOP
    v_text := btrim(v_item->>'content');
    IF jsonb_typeof(v_item) <> 'object' OR v_text IS NULL OR v_text = '' OR char_length(v_text) > 240 THEN
      RAISE EXCEPTION 'invalid_practice_seo_usage_item' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.practice_seo_usage_items (practice_id, content, position)
    VALUES (p_practice_id, v_text, v_position);
    v_position := v_position + 1;
  END LOOP;

  v_position := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_faq_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR NULLIF(btrim(v_item->>'question'), '') IS NULL
       OR NULLIF(btrim(v_item->>'answer'), '') IS NULL
       OR char_length(btrim(v_item->>'question')) > 240
       OR char_length(btrim(v_item->>'answer')) > 1500 THEN
      RAISE EXCEPTION 'invalid_practice_seo_faq_item' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.practice_seo_faq_items (practice_id, question, answer, position)
    VALUES (p_practice_id, btrim(v_item->>'question'), btrim(v_item->>'answer'), v_position);
    v_position := v_position + 1;
  END LOOP;

  v_position := 0;
  FOR v_related_text IN SELECT value FROM jsonb_array_elements_text(p_related_practice_ids)
  LOOP
    BEGIN
      v_related_id := btrim(v_related_text)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_related_product' USING ERRCODE = 'check_violation';
    END;
    INSERT INTO public.practice_related_products (practice_id, related_practice_id, position)
    VALUES (p_practice_id, v_related_id, v_position);
    v_position := v_position + 1;
  END LOOP;

  v_position := 0;
  FOR v_related_text IN SELECT value FROM jsonb_array_elements_text(p_related_listen_slugs)
  LOOP
    v_text := lower(btrim(v_related_text));
    IF v_text IS NULL OR v_text = '' OR char_length(v_text) > 160 THEN
      RAISE EXCEPTION 'invalid_related_listen' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.practice_related_listens (practice_id, listen_slug, position)
    VALUES (p_practice_id, v_text, v_position);
    v_position := v_position + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_practice_seo_content(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_practice_seo_content(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.practice_seo_usage_items, public.practice_seo_faq_items, public.practice_related_products, public.practice_related_listens FROM anon, authenticated;

COMMIT;
