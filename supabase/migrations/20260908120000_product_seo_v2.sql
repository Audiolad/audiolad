BEGIN;

-- Product SEO v2 content is intentionally normalized so author tooling can
-- reorder individual entries without rewriting a JSON document. No backfill:
-- NULL/empty related rows retain current public-page behaviour.

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
    );
$$;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS seo_about text,
  ADD COLUMN IF NOT EXISTS seo_secondary_queries text[];

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_seo_secondary_queries_count_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_seo_secondary_queries_count_check
  CHECK (
    seo_secondary_queries IS NULL
    OR public.valid_practice_seo_secondary_queries(seo_secondary_queries)
  );

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_seo_about_length_check;
ALTER TABLE public.practices
  ADD CONSTRAINT practices_seo_about_length_check
  CHECK (seo_about IS NULL OR char_length(btrim(seo_about)) <= 3000);

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_seo_scalar_length_check;
ALTER TABLE public.practices
  ADD CONSTRAINT practices_seo_scalar_length_check
  CHECK (
    (seo_primary_query IS NULL OR char_length(btrim(seo_primary_query)) <= 120)
    AND (seo_title IS NULL OR char_length(btrim(seo_title)) <= 140)
    AND (seo_description IS NULL OR char_length(btrim(seo_description)) <= 300)
  );

COMMENT ON COLUMN public.practices.seo_about IS
  'Optional extended SEO about text for a public product page. NULL preserves existing rendering.';
COMMENT ON COLUMN public.practices.seo_secondary_queries IS
  'Optional secondary search phrases. Database caps the array at 10; application validates every phrase.';

CREATE TABLE IF NOT EXISTS public.practice_seo_usage_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  content text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_seo_usage_items_content_check
    CHECK (NULLIF(btrim(content), '') IS NOT NULL AND char_length(btrim(content)) <= 240),
  CONSTRAINT practice_seo_usage_items_position_check
    CHECK (position >= 0 AND position < 8),
  CONSTRAINT practice_seo_usage_items_practice_position_key
    UNIQUE (practice_id, position)
);

CREATE TABLE IF NOT EXISTS public.practice_seo_faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_seo_faq_items_pair_check
    CHECK (
      NULLIF(btrim(question), '') IS NOT NULL
      AND NULLIF(btrim(answer), '') IS NOT NULL
      AND char_length(btrim(question)) <= 240
      AND char_length(btrim(answer)) <= 1500
    ),
  CONSTRAINT practice_seo_faq_items_position_check
    CHECK (position >= 0 AND position < 8),
  CONSTRAINT practice_seo_faq_items_practice_position_key
    UNIQUE (practice_id, position)
);

CREATE TABLE IF NOT EXISTS public.practice_related_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  related_practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_related_products_not_self_check
    CHECK (practice_id <> related_practice_id),
  CONSTRAINT practice_related_products_position_check
    CHECK (position >= 0 AND position < 8),
  CONSTRAINT practice_related_products_practice_related_key
    UNIQUE (practice_id, related_practice_id),
  CONSTRAINT practice_related_products_practice_position_key
    UNIQUE (practice_id, position)
);

CREATE TABLE IF NOT EXISTS public.practice_related_listens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  listen_slug text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_related_listens_slug_check
    CHECK (
      listen_slug = lower(btrim(listen_slug))
      AND listen_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  CONSTRAINT practice_related_listens_position_check
    CHECK (position >= 0 AND position < 8),
  CONSTRAINT practice_related_listens_practice_slug_key
    UNIQUE (practice_id, listen_slug),
  CONSTRAINT practice_related_listens_practice_position_key
    UNIQUE (practice_id, position)
);

CREATE INDEX IF NOT EXISTS practice_seo_usage_items_practice_position_idx
  ON public.practice_seo_usage_items (practice_id, position, id);
CREATE INDEX IF NOT EXISTS practice_seo_faq_items_practice_position_idx
  ON public.practice_seo_faq_items (practice_id, position, id);
CREATE INDEX IF NOT EXISTS practice_related_products_practice_position_idx
  ON public.practice_related_products (practice_id, position, id);
CREATE INDEX IF NOT EXISTS practice_related_products_related_practice_idx
  ON public.practice_related_products (related_practice_id);
CREATE INDEX IF NOT EXISTS practice_related_listens_practice_position_idx
  ON public.practice_related_listens (practice_id, position, id);

CREATE OR REPLACE FUNCTION public.set_practice_seo_item_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_practice_seo_usage_item_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM 1 FROM public.practices WHERE id = NEW.practice_id FOR UPDATE;
  SELECT count(*) INTO v_count
  FROM public.practice_seo_usage_items
  WHERE practice_id = NEW.practice_id;

  IF v_count >= 8 THEN
    RAISE EXCEPTION 'practice_seo_usage_item_limit_exceeded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_practice_seo_faq_item_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM 1 FROM public.practices WHERE id = NEW.practice_id FOR UPDATE;
  SELECT count(*) INTO v_count
  FROM public.practice_seo_faq_items
  WHERE practice_id = NEW.practice_id;

  IF v_count >= 8 THEN
    RAISE EXCEPTION 'practice_seo_faq_item_limit_exceeded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_practice_related_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_author_id uuid;
  v_related_author_id uuid;
BEGIN
  SELECT author_id INTO v_source_author_id
  FROM public.practices
  WHERE id = NEW.practice_id;

  SELECT author_id INTO v_related_author_id
  FROM public.practices
  WHERE id = NEW.related_practice_id
    AND status = 'published'
    AND deleted_at IS NULL
    AND catalog_visibility = 'listed'
    AND is_catalog_listed IS TRUE;

  IF v_source_author_id IS NULL OR v_related_author_id IS NULL THEN
    RAISE EXCEPTION 'related_practice_must_be_published_and_listed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_source_author_id <> v_related_author_id
     AND NOT public.has_platform_permission(auth.uid(), 'admin_panel.access') THEN
    RAISE EXCEPTION 'related_practice_must_belong_to_same_author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_practice_seo(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_practice_author_member(p_practice_id, auth.uid())
      OR public.has_platform_permission(auth.uid(), 'admin_panel.access')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_public_listed_practice(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.id = p_practice_id
      AND p.status = 'published'
      AND p.deleted_at IS NULL
      AND p.catalog_visibility = 'listed'
      AND p.is_catalog_listed IS TRUE
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
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_text text;
  v_related_text text;
  v_position integer := 0;
  v_related_id uuid;
BEGIN
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

  -- Lock the parent so every replace is one serializable child-set mutation.
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
    BEGIN v_related_id := btrim(v_related_text)::uuid; EXCEPTION WHEN invalid_text_representation THEN
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

COMMENT ON TABLE public.practice_seo_usage_items IS
  'Ordered optional usage items for a practice public SEO page; maximum 8 per practice.';
COMMENT ON TABLE public.practice_seo_faq_items IS
  'Ordered valid question/answer pairs for a practice public SEO page; maximum 8 per practice.';
COMMENT ON TABLE public.practice_related_products IS
  'Ordered product relations. Related targets must be published and listed; non-admin authors may only use their own products.';
COMMENT ON TABLE public.practice_related_listens IS
  'Ordered references to app-registry listen pages. The database validates slug shape only; the application must verify registry membership.';

DROP TRIGGER IF EXISTS practice_seo_usage_items_set_updated_at
  ON public.practice_seo_usage_items;
CREATE TRIGGER practice_seo_usage_items_set_updated_at
  BEFORE UPDATE ON public.practice_seo_usage_items
  FOR EACH ROW EXECUTE FUNCTION public.set_practice_seo_item_updated_at();

DROP TRIGGER IF EXISTS practice_seo_faq_items_set_updated_at
  ON public.practice_seo_faq_items;
CREATE TRIGGER practice_seo_faq_items_set_updated_at
  BEFORE UPDATE ON public.practice_seo_faq_items
  FOR EACH ROW EXECUTE FUNCTION public.set_practice_seo_item_updated_at();

DROP TRIGGER IF EXISTS practice_related_products_set_updated_at
  ON public.practice_related_products;
CREATE TRIGGER practice_related_products_set_updated_at
  BEFORE UPDATE ON public.practice_related_products
  FOR EACH ROW EXECUTE FUNCTION public.set_practice_seo_item_updated_at();

DROP TRIGGER IF EXISTS practice_related_listens_set_updated_at
  ON public.practice_related_listens;
CREATE TRIGGER practice_related_listens_set_updated_at
  BEFORE UPDATE ON public.practice_related_listens
  FOR EACH ROW EXECUTE FUNCTION public.set_practice_seo_item_updated_at();

DROP TRIGGER IF EXISTS practice_seo_usage_items_enforce_limit
  ON public.practice_seo_usage_items;
CREATE TRIGGER practice_seo_usage_items_enforce_limit
  BEFORE INSERT ON public.practice_seo_usage_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_practice_seo_usage_item_limit();

DROP TRIGGER IF EXISTS practice_seo_faq_items_enforce_limit
  ON public.practice_seo_faq_items;
CREATE TRIGGER practice_seo_faq_items_enforce_limit
  BEFORE INSERT ON public.practice_seo_faq_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_practice_seo_faq_item_limit();

DROP TRIGGER IF EXISTS practice_related_products_validate_target
  ON public.practice_related_products;
CREATE TRIGGER practice_related_products_validate_target
  BEFORE INSERT OR UPDATE OF practice_id, related_practice_id
  ON public.practice_related_products
  FOR EACH ROW EXECUTE FUNCTION public.validate_practice_related_product();

ALTER TABLE public.practice_seo_usage_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_seo_faq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_related_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_related_listens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.practice_seo_usage_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.practice_seo_faq_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.practice_related_products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.practice_related_listens FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.practice_seo_usage_items TO anon, authenticated;
GRANT SELECT ON TABLE public.practice_seo_faq_items TO anon, authenticated;
GRANT SELECT ON TABLE public.practice_related_products TO anon, authenticated;
GRANT SELECT ON TABLE public.practice_related_listens TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.practice_seo_usage_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.practice_seo_faq_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.practice_related_products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.practice_related_listens TO authenticated;
GRANT ALL ON TABLE public.practice_seo_usage_items TO service_role;
GRANT ALL ON TABLE public.practice_seo_faq_items TO service_role;
GRANT ALL ON TABLE public.practice_related_products TO service_role;
GRANT ALL ON TABLE public.practice_related_listens TO service_role;

DROP POLICY IF EXISTS "Public can read listed practice SEO usage items"
  ON public.practice_seo_usage_items;
CREATE POLICY "Public can read listed practice SEO usage items"
  ON public.practice_seo_usage_items FOR SELECT TO anon, authenticated
  USING (public.is_public_listed_practice(practice_id));

DROP POLICY IF EXISTS "Public can read listed practice SEO FAQ items"
  ON public.practice_seo_faq_items;
CREATE POLICY "Public can read listed practice SEO FAQ items"
  ON public.practice_seo_faq_items FOR SELECT TO anon, authenticated
  USING (public.is_public_listed_practice(practice_id));

DROP POLICY IF EXISTS "Public can read verified listed related products"
  ON public.practice_related_products;
CREATE POLICY "Public can read verified listed related products"
  ON public.practice_related_products FOR SELECT TO anon, authenticated
  USING (
    public.is_public_listed_practice(practice_id)
    AND public.is_public_listed_practice(related_practice_id)
  );

DROP POLICY IF EXISTS "Public can read listed practice related listens"
  ON public.practice_related_listens;
CREATE POLICY "Public can read listed practice related listens"
  ON public.practice_related_listens FOR SELECT TO anon, authenticated
  USING (public.is_public_listed_practice(practice_id));

DROP POLICY IF EXISTS "Authors can manage practice SEO usage items"
  ON public.practice_seo_usage_items;
CREATE POLICY "Authors can manage practice SEO usage items"
  ON public.practice_seo_usage_items FOR ALL TO authenticated
  USING (public.can_manage_practice_seo(practice_id))
  WITH CHECK (public.can_manage_practice_seo(practice_id));

DROP POLICY IF EXISTS "Authors can manage practice SEO FAQ items"
  ON public.practice_seo_faq_items;
CREATE POLICY "Authors can manage practice SEO FAQ items"
  ON public.practice_seo_faq_items FOR ALL TO authenticated
  USING (public.can_manage_practice_seo(practice_id))
  WITH CHECK (public.can_manage_practice_seo(practice_id));

DROP POLICY IF EXISTS "Authors can manage practice related products"
  ON public.practice_related_products;
CREATE POLICY "Authors can manage practice related products"
  ON public.practice_related_products FOR ALL TO authenticated
  USING (public.can_manage_practice_seo(practice_id))
  WITH CHECK (public.can_manage_practice_seo(practice_id));

DROP POLICY IF EXISTS "Authors can manage practice related listens"
  ON public.practice_related_listens;
CREATE POLICY "Authors can manage practice related listens"
  ON public.practice_related_listens FOR ALL TO authenticated
  USING (public.can_manage_practice_seo(practice_id))
  WITH CHECK (public.can_manage_practice_seo(practice_id));

-- Child rows are only changed by the transactional replacement RPC.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.practice_seo_usage_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.practice_seo_faq_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.practice_related_products FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.practice_related_listens FROM authenticated;

REVOKE ALL ON FUNCTION public.set_practice_seo_item_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.valid_practice_seo_secondary_queries(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_practice_seo_usage_item_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_practice_seo_faq_item_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_practice_related_product() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_practice_seo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_public_listed_practice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_practice_seo_content(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_practice_seo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_public_listed_practice(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.valid_practice_seo_secondary_queries(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_practice_seo_content(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated, service_role;

COMMIT;
