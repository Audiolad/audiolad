BEGIN;

-- ---------------------------------------------------------------------------
-- Promo page external CTA + landing analytics
-- ---------------------------------------------------------------------------

ALTER TABLE public.promo_pages
  ADD COLUMN IF NOT EXISTS cta_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cta_heading text NULL,
  ADD COLUMN IF NOT EXISTS cta_description text NULL,
  ADD COLUMN IF NOT EXISTS cta_open_in_new_tab boolean NOT NULL DEFAULT false;

-- Published rows are locked by promo_pages_mutation_guard; disable for one-time backfill only.
ALTER TABLE public.promo_pages DISABLE TRIGGER promo_pages_mutation_guard;

UPDATE public.promo_pages AS pp
SET cta_enabled = true
WHERE pp.cta_enabled IS FALSE
  AND NULLIF(btrim(pp.cta_label), '') IS NOT NULL
  AND NULLIF(btrim(pp.cta_href), '') IS NOT NULL;

ALTER TABLE public.promo_pages ENABLE TRIGGER promo_pages_mutation_guard;

ALTER TABLE public.promo_pages
  DROP CONSTRAINT IF EXISTS promo_pages_cta_heading_check;

ALTER TABLE public.promo_pages
  ADD CONSTRAINT promo_pages_cta_heading_check
  CHECK (
    cta_heading IS NULL
    OR char_length(cta_heading) <= 120
  );

ALTER TABLE public.promo_pages
  DROP CONSTRAINT IF EXISTS promo_pages_cta_description_check;

ALTER TABLE public.promo_pages
  ADD CONSTRAINT promo_pages_cta_description_check
  CHECK (
    cta_description IS NULL
    OR char_length(cta_description) <= 500
  );

CREATE OR REPLACE FUNCTION public.is_safe_promo_page_cta_target(p_target text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trimmed text;
  v_lower text;
  v_pathname text;
  v_host text;
BEGIN
  IF p_target IS NULL THEN
    RETURN true;
  END IF;

  v_trimmed := btrim(p_target);

  IF v_trimmed = '' THEN
    RETURN true;
  END IF;

  IF char_length(v_trimmed) > 512 THEN
    RETURN false;
  END IF;

  IF v_trimmed ~ '[[:cntrl:]]' THEN
    RETURN false;
  END IF;

  v_lower := lower(v_trimmed);

  IF v_lower LIKE 'javascript:%'
    OR v_lower LIKE 'data:%'
    OR v_lower LIKE 'file:%'
    OR v_lower LIKE 'vbscript:%'
  THEN
    RETURN false;
  END IF;

  IF left(v_trimmed, 2) = '//' THEN
    RETURN false;
  END IF;

  IF v_lower LIKE 'http://%' THEN
    RETURN false;
  END IF;

  IF v_lower LIKE 'https://%' THEN
    IF position('://' in v_lower) = 0 THEN
      RETURN false;
    END IF;

    v_host := lower(split_part(split_part(v_trimmed, '://', 2), '/', 1));
    v_host := split_part(v_host, '@', 1);
    v_host := split_part(v_host, ':', 1);

    IF v_host = '' THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;

  IF left(v_trimmed, 1) <> '/' OR left(v_trimmed, 2) = '//' THEN
    RETURN false;
  END IF;

  IF v_trimmed LIKE '%\\%' THEN
    RETURN false;
  END IF;

  IF v_lower LIKE '%://%' THEN
    RETURN false;
  END IF;

  v_pathname := split_part(split_part(replace(replace(v_lower, '%2f', '/'), '%252f', '/'), '#', 1), '?', 1);

  IF left(v_pathname, 1) <> '/' OR left(v_pathname, 2) = '//' THEN
    RETURN false;
  END IF;

  IF v_pathname ~ '^/(auth/sign-in|auth/sign-up|api/)(/|$)' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.is_safe_promo_page_cta_target(text) IS
  'audiolad:promo-page-cta-target:v1; validates internal /... or external https:// promo page CTA targets.';

CREATE OR REPLACE FUNCTION public.is_safe_promo_page_cta_href(p_href text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.is_safe_promo_page_cta_target(p_href);
$$;

ALTER TABLE public.promo_pages
  DROP CONSTRAINT IF EXISTS promo_pages_cta_href_check;

ALTER TABLE public.promo_pages
  ADD CONSTRAINT promo_pages_cta_href_check
  CHECK (public.is_safe_promo_page_cta_target(cta_href));

CREATE OR REPLACE FUNCTION public.validate_promo_page_cta_for_publish(
  p_enabled boolean,
  p_label text,
  p_href text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(p_enabled, false) IS NOT TRUE THEN
    RETURN;
  END IF;

  IF p_label IS NULL OR char_length(btrim(p_label)) = 0 THEN
    RAISE EXCEPTION 'promo_page_cta_label_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_href IS NULL OR char_length(btrim(p_href)) = 0 THEN
    RAISE EXCEPTION 'promo_page_cta_href_required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_safe_promo_page_cta_target(p_href) THEN
    RAISE EXCEPTION 'promo_page_cta_href_invalid'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- publish_promo_page — validate enabled CTA
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_promo_page(
  p_promo_page_id uuid,
  p_published_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_page public.promo_pages%ROWTYPE;
  v_product_count integer;
  v_invalid_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_page
  FROM public.promo_pages AS pp
  WHERE pp.id = p_promo_page_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promo_page_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.user_can_read_author_promotion(v_page.author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_page.status NOT IN ('draft', 'unpublished') THEN
    RAISE EXCEPTION 'promo_page_publish_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  IF btrim(v_page.slug) = '' OR v_page.slug !~ '^[a-z0-9-]{2,64}$' THEN
    RAISE EXCEPTION 'promo_page_slug_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(v_page.public_title)) = 0 THEN
    RAISE EXCEPTION 'promo_page_public_title_required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validate_promo_page_cta_for_publish(
    v_page.cta_enabled,
    v_page.cta_label,
    v_page.cta_href
  );

  SELECT count(*)::integer
  INTO v_product_count
  FROM public.promo_page_products AS ppp
  WHERE ppp.promo_page_id = v_page.id;

  IF v_product_count < 1 OR v_product_count > 3 THEN
    RAISE EXCEPTION 'promo_page_product_count_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_invalid_count
  FROM public.promo_page_products AS ppp
  INNER JOIN public.practices AS p ON p.id = ppp.practice_id
  WHERE ppp.promo_page_id = v_page.id
    AND (
      p.author_id IS DISTINCT FROM v_page.author_id
      OR NOT public.is_practice_promo_page_eligible(
        p.status,
        p.is_free,
        p.is_catalog_listed,
        p.guest_access_enabled
      )
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'promo_page_product_not_eligible'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('audiolad.promo_page_status_bypass', '1', true);

  UPDATE public.promo_pages AS pp
  SET
    status = 'published',
    published_at = COALESCE(pp.published_at, p_published_at),
    updated_at = clock_timestamp()
  WHERE pp.id = v_page.id;

  RETURN jsonb_build_object(
    'promo_page_id', v_page.id,
    'status', 'published',
    'published_at', COALESCE(v_page.published_at, p_published_at),
    'product_count', v_product_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Draft RPCs — extended CTA fields
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_promo_page_draft(
  uuid, text, text, text, text, text, text, text, uuid[]
);

CREATE OR REPLACE FUNCTION public.update_promo_page_draft(
  p_promo_page_id uuid,
  p_internal_name text,
  p_slug text,
  p_public_title text,
  p_public_description text,
  p_footer_text text,
  p_cta_enabled boolean,
  p_cta_heading text,
  p_cta_description text,
  p_cta_label text,
  p_cta_href text,
  p_cta_open_in_new_tab boolean,
  p_practice_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_page public.promo_pages%ROWTYPE;
  v_product_count integer;
  v_slug text;
  v_cta_href text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_promo_page_id IS NULL THEN
    RAISE EXCEPTION 'promo_page_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_page
  FROM public.promo_pages AS pp
  WHERE pp.id = p_promo_page_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promo_page_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.user_can_read_author_promotion(v_page.author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_page.status = 'published' THEN
    RAISE EXCEPTION 'promo_page_edit_locked'
      USING ERRCODE = '42501';
  END IF;

  IF p_internal_name IS NULL OR char_length(btrim(p_internal_name)) = 0 THEN
    RAISE EXCEPTION 'promo_page_internal_name_required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(p_internal_name)) > 120 THEN
    RAISE EXCEPTION 'promo_page_internal_name_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_public_title IS NULL OR char_length(btrim(p_public_title)) = 0 THEN
    RAISE EXCEPTION 'promo_page_public_title_required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(p_public_title)) > 160 THEN
    RAISE EXCEPTION 'promo_page_public_title_too_long'
      USING ERRCODE = '22023';
  END IF;

  v_slug := lower(btrim(p_slug));

  IF v_slug IS NULL OR v_slug = '' OR v_slug !~ '^[a-z0-9-]{2,64}$' THEN
    RAISE EXCEPTION 'promo_page_slug_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_public_description IS NOT NULL AND char_length(p_public_description) > 2000 THEN
    RAISE EXCEPTION 'promo_page_public_description_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_footer_text IS NOT NULL AND char_length(p_footer_text) > 2000 THEN
    RAISE EXCEPTION 'promo_page_footer_text_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_cta_heading IS NOT NULL AND char_length(p_cta_heading) > 120 THEN
    RAISE EXCEPTION 'promo_page_cta_heading_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_cta_description IS NOT NULL AND char_length(p_cta_description) > 500 THEN
    RAISE EXCEPTION 'promo_page_cta_description_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_cta_label IS NOT NULL AND char_length(btrim(p_cta_label)) > 80 THEN
    RAISE EXCEPTION 'promo_page_cta_label_too_long'
      USING ERRCODE = '22023';
  END IF;

  v_cta_href := NULLIF(btrim(p_cta_href), '');

  IF NOT public.is_safe_promo_page_cta_target(v_cta_href) THEN
    RAISE EXCEPTION 'promo_page_cta_href_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.promo_pages AS pp
    WHERE pp.author_id = v_page.author_id
      AND pp.slug = v_slug
      AND pp.id <> v_page.id
  ) THEN
    RAISE EXCEPTION 'promo_page_slug_taken'
      USING ERRCODE = '23505';
  END IF;

  v_product_count := public.promo_page_replace_products_core(
    v_page.id,
    v_page.author_id,
    p_practice_ids
  );

  UPDATE public.promo_pages AS pp
  SET
    internal_name = btrim(p_internal_name),
    slug = v_slug,
    public_title = btrim(p_public_title),
    public_description = NULLIF(btrim(p_public_description), ''),
    footer_text = NULLIF(btrim(p_footer_text), ''),
    cta_enabled = COALESCE(p_cta_enabled, false),
    cta_heading = NULLIF(btrim(p_cta_heading), ''),
    cta_description = NULLIF(btrim(p_cta_description), ''),
    cta_label = NULLIF(btrim(p_cta_label), ''),
    cta_href = v_cta_href,
    cta_open_in_new_tab = COALESCE(p_cta_open_in_new_tab, false),
    updated_at = clock_timestamp()
  WHERE pp.id = v_page.id;

  RETURN jsonb_build_object(
    'promo_page_id', v_page.id,
    'product_count', v_product_count
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_promo_page_draft(
  uuid, text, text, text, text, text, text, text, uuid[]
);

CREATE OR REPLACE FUNCTION public.create_promo_page_draft(
  p_author_id uuid,
  p_internal_name text,
  p_slug text,
  p_public_title text,
  p_public_description text,
  p_footer_text text,
  p_cta_enabled boolean,
  p_cta_heading text,
  p_cta_description text,
  p_cta_label text,
  p_cta_href text,
  p_cta_open_in_new_tab boolean,
  p_practice_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_page_id uuid;
  v_slug text;
  v_cta_href text;
  v_product_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_can_read_author_promotion(p_author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_internal_name IS NULL OR char_length(btrim(p_internal_name)) = 0 THEN
    RAISE EXCEPTION 'promo_page_internal_name_required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(p_internal_name)) > 120 THEN
    RAISE EXCEPTION 'promo_page_internal_name_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_public_title IS NULL OR char_length(btrim(p_public_title)) = 0 THEN
    RAISE EXCEPTION 'promo_page_public_title_required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(p_public_title)) > 160 THEN
    RAISE EXCEPTION 'promo_page_public_title_too_long'
      USING ERRCODE = '22023';
  END IF;

  v_slug := lower(btrim(p_slug));

  IF v_slug IS NULL OR v_slug = '' OR v_slug !~ '^[a-z0-9-]{2,64}$' THEN
    RAISE EXCEPTION 'promo_page_slug_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_public_description IS NOT NULL AND char_length(p_public_description) > 2000 THEN
    RAISE EXCEPTION 'promo_page_public_description_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_footer_text IS NOT NULL AND char_length(p_footer_text) > 2000 THEN
    RAISE EXCEPTION 'promo_page_footer_text_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_cta_heading IS NOT NULL AND char_length(p_cta_heading) > 120 THEN
    RAISE EXCEPTION 'promo_page_cta_heading_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_cta_description IS NOT NULL AND char_length(p_cta_description) > 500 THEN
    RAISE EXCEPTION 'promo_page_cta_description_too_long'
      USING ERRCODE = '22023';
  END IF;

  IF p_cta_label IS NOT NULL AND char_length(btrim(p_cta_label)) > 80 THEN
    RAISE EXCEPTION 'promo_page_cta_label_too_long'
      USING ERRCODE = '22023';
  END IF;

  v_cta_href := NULLIF(btrim(p_cta_href), '');

  IF NOT public.is_safe_promo_page_cta_target(v_cta_href) THEN
    RAISE EXCEPTION 'promo_page_cta_href_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.promo_pages AS pp
    WHERE pp.author_id = p_author_id
      AND pp.slug = v_slug
  ) THEN
    RAISE EXCEPTION 'promo_page_slug_taken'
      USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('audiolad.promo_page_insert_bypass', '1', true);

  INSERT INTO public.promo_pages (
    author_id,
    internal_name,
    slug,
    status,
    public_title,
    public_description,
    footer_text,
    cta_enabled,
    cta_heading,
    cta_description,
    cta_label,
    cta_href,
    cta_open_in_new_tab,
    published_at,
    created_by
  )
  VALUES (
    p_author_id,
    btrim(p_internal_name),
    v_slug,
    'draft',
    btrim(p_public_title),
    NULLIF(btrim(p_public_description), ''),
    NULLIF(btrim(p_footer_text), ''),
    COALESCE(p_cta_enabled, false),
    NULLIF(btrim(p_cta_heading), ''),
    NULLIF(btrim(p_cta_description), ''),
    NULLIF(btrim(p_cta_label), ''),
    v_cta_href,
    COALESCE(p_cta_open_in_new_tab, false),
    NULL,
    v_user_id
  )
  RETURNING id INTO v_page_id;

  v_product_count := public.promo_page_replace_products_core(
    v_page_id,
    p_author_id,
    COALESCE(p_practice_ids, ARRAY[]::uuid[])
  );

  RETURN jsonb_build_object(
    'promo_page_id', v_page_id,
    'product_count', v_product_count,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_promo_page_draft(
  uuid, text, text, text, text, text, boolean, text, text, text, text, boolean, uuid[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_promo_page_draft(
  uuid, text, text, text, text, text, boolean, text, text, text, text, boolean, uuid[]
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_promo_page_draft(
  uuid, text, text, text, text, text, boolean, text, text, text, text, boolean, uuid[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_promo_page_draft(
  uuid, text, text, text, text, text, boolean, text, text, text, text, boolean, uuid[]
) TO service_role;

-- ---------------------------------------------------------------------------
-- Public read RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_promo_page(
  p_author_slug text,
  p_promo_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page public.promo_pages%ROWTYPE;
  v_author_slug text;
  v_products jsonb;
BEGIN
  IF p_author_slug IS NULL OR btrim(p_author_slug) = '' THEN
    RETURN NULL;
  END IF;

  IF p_promo_slug IS NULL OR btrim(p_promo_slug) = '' THEN
    RETURN NULL;
  END IF;

  SELECT pp.*
  INTO v_page
  FROM public.promo_pages AS pp
  INNER JOIN public.authors AS a ON a.id = pp.author_id
  WHERE a.slug = btrim(p_author_slug)
    AND pp.slug = btrim(p_promo_slug)
    AND pp.status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT a.slug
  INTO v_author_slug
  FROM public.authors AS a
  WHERE a.id = v_page.author_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'practice_id', p.id,
        'slug', p.slug,
        'title', p.title,
        'format', p.format,
        'duration_minutes', p.duration_minutes,
        'cover_url', p.cover_url,
        'cover_image', p.cover_image,
        'author_name', a.name,
        'author_slug', a.slug,
        'position', ppp.position
      )
      ORDER BY ppp.position ASC
    ),
    '[]'::jsonb
  )
  INTO v_products
  FROM public.promo_page_products AS ppp
  INNER JOIN public.practices AS p ON p.id = ppp.practice_id
  INNER JOIN public.authors AS a ON a.id = p.author_id
  WHERE ppp.promo_page_id = v_page.id
    AND public.is_practice_promo_page_eligible(
      p.status,
      p.is_free,
      p.is_catalog_listed,
      p.guest_access_enabled
    );

  IF jsonb_array_length(v_products) < 1 THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'promo_page_id', v_page.id,
    'author_slug', v_author_slug,
    'slug', v_page.slug,
    'public_title', v_page.public_title,
    'public_description', v_page.public_description,
    'banner_path', v_page.banner_path,
    'footer_text', v_page.footer_text,
    'cta_enabled', v_page.cta_enabled,
    'cta_heading', v_page.cta_heading,
    'cta_description', v_page.cta_description,
    'cta_label', v_page.cta_label,
    'cta_href', v_page.cta_href,
    'cta_open_in_new_tab', v_page.cta_open_in_new_tab,
    'published_at', v_page.published_at,
    'products', v_products
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Analytics insert — promo_page_id dimension
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.insert_analytics_event(
  text, uuid, uuid, text, text, text, text, text, text, integer, integer, jsonb
);

CREATE OR REPLACE FUNCTION public.insert_analytics_event(
  p_event_name text,
  p_practice_id uuid DEFAULT NULL,
  p_track_id uuid DEFAULT NULL,
  p_anonymous_session_id text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_current_position integer DEFAULT NULL,
  p_duration integer DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_promo_page_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_event_id uuid;
  v_allowed boolean;
BEGIN
  v_user_id := auth.uid();

  IF p_event_name IS NULL OR btrim(p_event_name) = '' THEN
    RAISE EXCEPTION 'event_name_required'
      USING ERRCODE = '22023';
  END IF;

  v_allowed := btrim(p_event_name) LIKE 'promo\_%' ESCAPE '\'
    OR btrim(p_event_name) LIKE 'pwa\_%' ESCAPE '\';

  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'event_name_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  IF p_practice_id IS NOT NULL THEN
    PERFORM 1 FROM public.practices WHERE id = p_practice_id;
    IF NOT FOUND THEN
      p_practice_id := NULL;
    END IF;
  END IF;

  IF p_promo_page_id IS NOT NULL THEN
    PERFORM 1 FROM public.promo_pages WHERE id = p_promo_page_id;
    IF NOT FOUND THEN
      p_promo_page_id := NULL;
    END IF;
  END IF;

  INSERT INTO public.analytics_events (
    event_name,
    practice_id,
    track_id,
    user_id,
    anonymous_session_id,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    referrer,
    current_position,
    duration,
    payload,
    promo_page_id
  )
  VALUES (
    btrim(p_event_name),
    p_practice_id,
    p_track_id,
    v_user_id,
    NULLIF(btrim(COALESCE(p_anonymous_session_id, '')), ''),
    NULLIF(left(btrim(COALESCE(p_utm_source, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_medium, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_campaign, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_content, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_referrer, '')), 512), ''),
    p_current_position,
    p_duration,
    COALESCE(p_payload, '{}'::jsonb),
    p_promo_page_id
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_analytics_event(
  text, uuid, uuid, text, text, text, text, text, text, integer, integer, jsonb, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_analytics_event(
  text, uuid, uuid, text, text, text, text, text, text, integer, integer, jsonb, uuid
) TO anon, authenticated;

COMMENT ON FUNCTION public.insert_analytics_event IS
  'audiolad:analytics:v3; inserts promo_* and pwa_* analytics events with optional promo_page_id.';

-- ---------------------------------------------------------------------------
-- Campaign stats — practice and promo_page campaigns
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_promotion_campaign_stats(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_promotion_campaign_stats(
  p_campaign_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  utm_source text,
  utm_medium text,
  utm_content text,
  event_name text,
  unique_visitors bigint,
  event_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_campaign public.promotion_campaigns%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_campaign
  FROM public.promotion_campaigns AS pc
  WHERE pc.id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.user_can_read_author_promotion(v_campaign.author_id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(NULLIF(btrim(ae.utm_source), ''), '(none)') AS utm_source,
    COALESCE(NULLIF(btrim(ae.utm_medium), ''), '(none)') AS utm_medium,
    COALESCE(NULLIF(btrim(ae.utm_content), ''), '(none)') AS utm_content,
    ae.event_name,
    COUNT(
      DISTINCT COALESCE(ae.user_id::text, ae.anonymous_session_id)
    )::bigint AS unique_visitors,
    COUNT(*)::bigint AS event_count
  FROM public.analytics_events AS ae
  WHERE ae.utm_campaign = v_campaign.campaign_key
    AND ae.event_name LIKE 'promo\_%' ESCAPE '\'
    AND (
      (
        v_campaign.practice_id IS NOT NULL
        AND ae.practice_id = v_campaign.practice_id
      )
      OR (
        v_campaign.promo_page_id IS NOT NULL
        AND ae.promo_page_id = v_campaign.promo_page_id
      )
    )
    AND (p_date_from IS NULL OR ae.created_at >= p_date_from)
    AND (p_date_to IS NULL OR ae.created_at <= p_date_to)
  GROUP BY 1, 2, 3, 4
  ORDER BY 4, 1, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.get_promotion_campaign_stats(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_promotion_campaign_stats(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_promotion_campaign_stats(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_promotion_campaign_stats(uuid, timestamptz, timestamptz) TO service_role;

COMMIT;
