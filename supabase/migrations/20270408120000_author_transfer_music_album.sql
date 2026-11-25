BEGIN;

CREATE TABLE public.practice_project_redirects (
  author_slug text NOT NULL,
  product_slug text NOT NULL,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  PRIMARY KEY (author_slug, product_slug)
);
CREATE INDEX practice_project_redirects_practice_idx
  ON public.practice_project_redirects (practice_id);

ALTER TABLE public.practice_project_redirects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_project_redirects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_project_redirects TO anon, authenticated;
CREATE POLICY practice_project_redirects_select ON public.practice_project_redirects
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.practices p
    WHERE p.id = practice_project_redirects.practice_id
      AND p.deleted_at IS NULL AND NOT p.business_only
  ));

-- Client updates cannot bypass the transfer RPC by patching author_id directly.
CREATE FUNCTION public.guard_music_album_project_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND NEW.author_id IS DISTINCT FROM OLD.author_id
     AND (OLD.product_kind = 'music' OR OLD.publication_class = 'release') THEN
    RAISE EXCEPTION 'album_transfer_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_music_album_project_update
  BEFORE UPDATE OF author_id ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_music_album_project_update();

CREATE FUNCTION public.transfer_author_music_album(
  p_practice_id uuid, p_source_author_id uuid, p_target_author_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_practice public.practices%ROWTYPE;
  v_source public.authors%ROWTYPE;
  v_target public.authors%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR p_source_author_id IS NULL OR p_target_author_id IS NULL
     OR p_source_author_id = p_target_author_id THEN
    RAISE EXCEPTION 'album_transfer_forbidden' USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM (
      SELECT 1 FROM public.author_members
      WHERE user_id = v_user_id AND role = 'owner'
        AND author_id IN (p_source_author_id, p_target_author_id)
      ORDER BY author_id FOR SHARE
    ) AS memberships) <> 2 THEN
    RAISE EXCEPTION 'album_transfer_forbidden' USING ERRCODE = '42501';
  END IF;

  -- The reservation linker locks its reservation before the practice.
  PERFORM 1 FROM public.seo_query_reservations
    WHERE product_id = p_practice_id AND author_id = p_source_author_id
    ORDER BY id FOR UPDATE;
  SELECT * INTO v_practice FROM public.practices WHERE id = p_practice_id FOR UPDATE;
  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'album_transfer_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.author_id IS DISTINCT FROM p_source_author_id THEN
    RAISE EXCEPTION 'album_transfer_stale';
  END IF;

  IF v_practice.business_only
     OR NOT (v_practice.product_kind IS NOT DISTINCT FROM 'music'
             OR v_practice.publication_class IS NOT DISTINCT FROM 'release')
     OR coalesce(v_practice.status, '') NOT IN ('draft', 'unpublished', 'published')
     OR v_practice.moderation_status = 'submitted' THEN
    RAISE EXCEPTION 'album_transfer_unavailable';
  END IF;

  PERFORM 1 FROM public.authors WHERE id IN (p_source_author_id, p_target_author_id)
    ORDER BY id FOR SHARE;
  SELECT * INTO STRICT v_source FROM public.authors WHERE id = p_source_author_id;
  SELECT * INTO STRICT v_target FROM public.authors WHERE id = p_target_author_id;
  IF v_target.closed_catalog_only
     OR NOT public.author_access_allows_content_mutations(v_source.access_status)
     OR NOT public.author_access_allows_content_mutations(v_target.access_status) THEN
    RAISE EXCEPTION 'album_transfer_forbidden' USING ERRCODE = '42501';
  END IF;

  IF (NOT coalesce(v_practice.is_free, false) OR coalesce(v_practice.price, 0) > 0
      OR v_practice.music_usage_permission = 'platform_reuse_allowed')
     AND (NOT public.author_access_allows_paid_products(v_target.access_status)
          OR NOT public.author_has_accepted_current_terms(v_target.id)) THEN
    RAISE EXCEPTION 'album_transfer_commercial_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.practice_project_redirects
    WHERE author_slug IN (v_source.slug, v_target.slug)
      AND product_slug = v_practice.slug AND practice_id <> v_practice.id
  ) THEN
    RAISE EXCEPTION 'album_transfer_slug_taken' USING ERRCODE = '23505';
  END IF;

  IF v_practice.slug IS NOT NULL AND (
    v_practice.status IN ('published', 'unpublished')
    OR v_practice.published_at IS NOT NULL
    OR v_practice.first_published_at IS NOT NULL
    OR v_practice.first_publication_date_unknown
  ) THEN
    INSERT INTO public.practice_project_redirects (author_slug, product_slug, practice_id)
    VALUES (v_source.slug, v_practice.slug, v_practice.id)
    ON CONFLICT (author_slug, product_slug) DO UPDATE SET practice_id = excluded.practice_id
      WHERE practice_project_redirects.practice_id = excluded.practice_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'album_transfer_slug_taken' USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.practices SET author_id = v_target.id, updated_at = now()
    WHERE id = v_practice.id;
  UPDATE public.seo_query_reservations SET author_id = v_target.id, updated_at = now()
    WHERE product_id = v_practice.id AND author_id = v_source.id;

  RETURN jsonb_build_object(
    'source_slug', v_source.slug,
    'target_slug', v_target.slug,
    'product_slug', v_practice.slug,
    'status', v_practice.status,
    'scheduled_publish_at', v_practice.scheduled_publish_at,
    'published_at', v_practice.published_at,
    'catalog_visibility', v_practice.catalog_visibility,
    'is_catalog_listed', v_practice.is_catalog_listed
  );
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'album_transfer_slug_taken' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_author_music_album(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_author_music_album(uuid, uuid, uuid) TO authenticated;

COMMIT;
