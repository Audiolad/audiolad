BEGIN;

CREATE TABLE public.seo_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  canonical_query text NULL,
  intent text NULL,
  recommended_format text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_clusters_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE public.seo_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  normalized_query text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  frequency integer NULL,
  frequency_checked_at timestamptz NULL,
  cluster_id uuid NULL REFERENCES public.seo_clusters(id) ON DELETE SET NULL,
  intent text NULL,
  recommended_format text NULL,
  audio_fit text NULL,
  analysis_status text NOT NULL DEFAULT 'not_analyzed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_queries_query_text_not_blank CHECK (btrim(query_text) <> ''),
  CONSTRAINT seo_queries_source_check CHECK (
    source IN ('manual', 'wordstat', 'search_console', 'yandex_webmaster', 'other')
  ),
  CONSTRAINT seo_queries_frequency_non_negative CHECK (
    frequency IS NULL OR frequency >= 0
  ),
  CONSTRAINT seo_queries_analysis_status_check CHECK (
    analysis_status IN ('not_analyzed', 'analyzed', 'not_applicable')
  ),
  CONSTRAINT seo_queries_normalized_query_unique UNIQUE (normalized_query)
);

CREATE TABLE public.seo_query_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id uuid NOT NULL REFERENCES public.seo_queries(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  product_id uuid NULL REFERENCES public.practices(id) ON DELETE SET NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  released_at timestamptz NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_query_reservations_status_check CHECK (
    status IN ('active', 'released', 'used')
  ),
  CONSTRAINT seo_query_reservations_expiry_check CHECK (
    expires_at IS NULL OR expires_at > reserved_at
  ),
  CONSTRAINT seo_query_reservations_released_check CHECK (
    (status = 'released') = (released_at IS NOT NULL)
  ),
  CONSTRAINT seo_query_reservations_product_active_check CHECK (
    product_id IS NULL OR status IN ('active', 'used')
  )
);

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS primary_seo_query_id uuid NULL
  REFERENCES public.seo_queries(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX seo_query_reservations_one_open_or_used_query_idx
  ON public.seo_query_reservations(query_id)
  WHERE status IN ('active', 'used');
CREATE UNIQUE INDEX practices_primary_seo_query_unique_idx
  ON public.practices(primary_seo_query_id)
  WHERE primary_seo_query_id IS NOT NULL;
CREATE INDEX seo_queries_cluster_listing_idx
  ON public.seo_queries(cluster_id, created_at DESC);
CREATE INDEX seo_query_reservations_author_active_idx
  ON public.seo_query_reservations(author_id, reserved_at DESC)
  WHERE status = 'active';
CREATE INDEX seo_query_reservations_query_lookup_idx
  ON public.seo_query_reservations(query_id, status);
CREATE INDEX seo_query_reservations_product_lookup_idx
  ON public.seo_query_reservations(product_id)
  WHERE product_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_seo_query(p_query text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(lower(translate(p_query, 'Ёё', 'Ее')), '[[:punct:]]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.set_seo_query_normalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.query_text := btrim(NEW.query_text);
  NEW.normalized_query := public.normalize_seo_query(NEW.query_text);
  IF NEW.normalized_query = '' THEN
    RAISE EXCEPTION 'seo_query_empty' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER seo_queries_normalize_before_write
  BEFORE INSERT OR UPDATE OF query_text ON public.seo_queries
  FOR EACH ROW EXECUTE FUNCTION public.set_seo_query_normalized();

CREATE OR REPLACE FUNCTION public.touch_seo_cluster()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER seo_clusters_touch_before_update
  BEFORE UPDATE ON public.seo_clusters
  FOR EACH ROW EXECUTE FUNCTION public.touch_seo_cluster();

CREATE OR REPLACE FUNCTION public.touch_seo_reservation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER seo_query_reservations_touch_before_update
  BEFORE UPDATE ON public.seo_query_reservations
  FOR EACH ROW EXECUTE FUNCTION public.touch_seo_reservation();

CREATE OR REPLACE FUNCTION public.guard_practice_primary_seo_query()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (
    (TG_OP = 'INSERT' AND NEW.primary_seo_query_id IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.primary_seo_query_id IS DISTINCT FROM OLD.primary_seo_query_id)
  ) AND current_setting('audiolad.allow_primary_seo_query_link', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'primary_seo_query_requires_rpc' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER practices_primary_seo_query_guard
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_primary_seo_query();

CREATE OR REPLACE FUNCTION public.expire_seo_query_reservation(
  p_query_id uuid DEFAULT NULL,
  p_author_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.seo_query_reservations
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE status = 'active'
    AND product_id IS NULL
    AND expires_at IS NOT NULL
    AND expires_at <= now()
    AND (p_query_id IS NULL OR query_id = p_query_id)
    AND (p_author_id IS NULL OR author_id = p_author_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_seo_query(p_query_id uuid, p_author_id uuid)
RETURNS public.seo_query_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query public.seo_queries%ROWTYPE;
  v_reservation public.seo_query_reservations%ROWTYPE;
  v_active_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.author_members
    WHERE author_id = p_author_id AND user_id = auth.uid() AND role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Serialize all reservations for one author, including different queries.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_author_id::text, 73051));
  SELECT * INTO v_query FROM public.seo_queries WHERE id = p_query_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_query_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expire_seo_query_reservation(p_query_id, NULL);
  PERFORM public.expire_seo_query_reservation(NULL, p_author_id);

  SELECT count(*) INTO v_active_count
  FROM public.seo_query_reservations
  WHERE author_id = p_author_id AND status = 'active';
  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'seo_reservation_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.seo_query_reservations
    WHERE query_id = p_query_id AND status IN ('active', 'used')
  ) THEN
    RAISE EXCEPTION 'seo_query_already_reserved' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.seo_query_reservations (
    query_id, author_id, reserved_at, expires_at, status
  ) VALUES (p_query_id, p_author_id, now(), now() + interval '7 days', 'active')
  RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_seo_reservation_to_product(
  p_reservation_id uuid,
  p_product_id uuid
)
RETURNS public.seo_query_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.seo_query_reservations%ROWTYPE;
  v_practice public.practices%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_reservation FROM public.seo_query_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_reservation.status <> 'active' THEN
    RAISE EXCEPTION 'seo_reservation_not_linkable' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_practice FROM public.practices WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.status <> 'draft'
     OR v_practice.moderation_status NOT IN ('not_submitted', 'changes_requested') THEN
    RAISE EXCEPTION 'seo_reservation_product_not_linkable' USING ERRCODE = 'P0001';
  END IF;
  IF v_practice.author_id IS DISTINCT FROM v_reservation.author_id
     OR NOT EXISTS (
       SELECT 1 FROM public.author_members
       WHERE author_id = v_reservation.author_id AND user_id = auth.uid() AND role IN ('owner', 'editor')
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_practice.primary_seo_query_id IS NOT NULL
     AND v_practice.primary_seo_query_id IS DISTINCT FROM v_reservation.query_id THEN
    RAISE EXCEPTION 'practice_already_has_primary_seo_query' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);
  UPDATE public.practices SET primary_seo_query_id = v_reservation.query_id, updated_at = now()
  WHERE id = v_practice.id;
  UPDATE public.seo_query_reservations
  SET product_id = v_practice.id, expires_at = NULL, updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_seo_query_reservation(p_reservation_id uuid)
RETURNS public.seo_query_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.seo_query_reservations%ROWTYPE;
  v_practice public.practices%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_reservation FROM public.seo_query_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_reservation.status <> 'active' THEN
    RAISE EXCEPTION 'seo_reservation_not_releasable' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.author_members
    WHERE author_id = v_reservation.author_id AND user_id = auth.uid() AND role IN ('owner', 'editor')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  IF v_reservation.product_id IS NOT NULL THEN
    SELECT * INTO v_practice FROM public.practices WHERE id = v_reservation.product_id FOR UPDATE;
    IF NOT FOUND OR v_practice.status <> 'draft' OR v_practice.moderation_status = 'submitted' THEN
      RAISE EXCEPTION 'seo_reservation_product_lifecycle_locked' USING ERRCODE = 'P0001';
    END IF;
    PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);
    UPDATE public.practices SET primary_seo_query_id = NULL, updated_at = now()
    WHERE id = v_practice.id AND primary_seo_query_id = v_reservation.query_id;
  END IF;

  UPDATE public.seo_query_reservations
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_published_seo_query_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.primary_seo_query_id IS NOT NULL THEN
    UPDATE public.seo_query_reservations
    SET status = 'used', expires_at = NULL, updated_at = now()
    WHERE product_id = NEW.id AND query_id = NEW.primary_seo_query_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER practices_mark_published_seo_query_used
  AFTER UPDATE OF status ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.mark_published_seo_query_used();

CREATE OR REPLACE FUNCTION public.admin_release_seo_query_reservation(p_reservation_id uuid)
RETURNS public.seo_query_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.seo_query_reservations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(), 'seo.manage') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_reservation FROM public.seo_query_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_reservation.status <> 'active' THEN
    RAISE EXCEPTION 'seo_reservation_not_releasable' USING ERRCODE = 'P0001';
  END IF;
  IF v_reservation.product_id IS NOT NULL THEN
    PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);
    UPDATE public.practices SET primary_seo_query_id = NULL, updated_at = now()
    WHERE id = v_reservation.product_id AND primary_seo_query_id = v_reservation.query_id;
  END IF;
  UPDATE public.seo_query_reservations
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE id = p_reservation_id
  RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$;

ALTER TABLE public.seo_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_query_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY seo_clusters_select_authenticated ON public.seo_clusters
  FOR SELECT TO authenticated USING (
    public.is_platform_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.author_members WHERE user_id = auth.uid() AND role IN ('owner', 'editor'))
  );
CREATE POLICY seo_queries_select_authenticated ON public.seo_queries
  FOR SELECT TO authenticated USING (
    public.is_platform_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.author_members WHERE user_id = auth.uid() AND role IN ('owner', 'editor'))
  );
CREATE POLICY seo_query_reservations_select_owner_or_staff ON public.seo_query_reservations
  FOR SELECT TO authenticated USING (
    public.is_platform_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.author_members
      WHERE author_id = seo_query_reservations.author_id
        AND user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  );
CREATE POLICY seo_clusters_manage_staff ON public.seo_clusters
  FOR ALL TO authenticated
  USING (public.is_platform_staff(auth.uid()))
  WITH CHECK (public.is_platform_staff(auth.uid()));
CREATE POLICY seo_queries_manage_staff ON public.seo_queries
  FOR ALL TO authenticated
  USING (public.is_platform_staff(auth.uid()))
  WITH CHECK (public.is_platform_staff(auth.uid()));
CREATE POLICY seo_query_reservations_manage_staff ON public.seo_query_reservations
  FOR ALL TO authenticated
  USING (public.is_platform_staff(auth.uid()))
  WITH CHECK (public.is_platform_staff(auth.uid()));

REVOKE ALL ON public.seo_clusters, public.seo_queries, public.seo_query_reservations FROM PUBLIC, anon;
GRANT SELECT ON public.seo_clusters, public.seo_queries, public.seo_query_reservations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.seo_clusters, public.seo_queries, public.seo_query_reservations TO authenticated;
GRANT ALL ON public.seo_clusters, public.seo_queries, public.seo_query_reservations TO service_role;

INSERT INTO public.platform_permissions (code, description)
VALUES ('seo.manage', 'Manage SEO queries, clusters, and reservations')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.platform_role_permissions (role_code, permission_code)
VALUES ('owner', 'seo.manage'), ('admin', 'seo.manage'), ('editor', 'seo.manage')
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.reserve_seo_query(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_seo_query_reservation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_seo_reservation_to_product(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_seo_query_reservation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_release_seo_query_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_seo_query(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_seo_query_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_seo_reservation_to_product(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_seo_query_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_release_seo_query_reservation(uuid) TO authenticated;

COMMIT;
