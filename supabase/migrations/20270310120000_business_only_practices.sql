-- Closed Business albums. Existing albums retain their current access semantics.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.practices
  ADD COLUMN business_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.practices
  ADD CONSTRAINT practices_business_only_visibility_check
  CHECK (business_only = false OR
    (catalog_visibility = 'selected_users' AND is_catalog_listed = false)) NOT VALID;
-- Validate separately after COMMIT so the metadata locks are released first.

COMMENT ON COLUMN public.practices.business_only IS
  'Только Бизнес – необратимый закрытый режим нового альбома. Only author members and platform admins may read it; no listener grants or allowlist. Business playback is gated separately. Known PR-A limitation: business-only cover images must not be uploaded to the public practice-covers bucket; PR-C will store them privately. Existing public delivery is unchanged.';

-- Invoker trigger: the role GUC preserves the original SET ROLE even inside
-- SECURITY DEFINER author RPCs; do not trust the RPC function owner as caller.
CREATE FUNCTION public.guard_practice_business_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller text := coalesce(nullif(current_setting('role', true), 'none'), session_user);
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.business_only AND NOT NEW.business_only THEN
    RAISE EXCEPTION 'business_only_is_one_way' USING ERRCODE = '42501';
  END IF;
  IF NEW.business_only AND (TG_OP = 'INSERT' OR NOT OLD.business_only) THEN
    IF v_caller NOT IN ('service_role', 'postgres')
       AND NOT coalesce(public.has_platform_permission(auth.uid(), 'admin_panel.access'), false) THEN
      RAISE EXCEPTION 'business_only_requires_admin' USING ERRCODE = '42501';
    END IF;
    -- Check OLD too: a caller cannot hide a previous publication in this write.
    -- Historical uncertainty is not proof of never publishing: fail closed.
    IF NEW.first_published_at IS NOT NULL OR NEW.status = 'published'
       OR NEW.first_publication_date_unknown
       OR (TG_OP = 'UPDATE' AND
         (OLD.first_published_at IS NOT NULL OR OLD.status = 'published'
          OR OLD.first_publication_date_unknown)) THEN
      RAISE EXCEPTION 'business_only_requires_never_published' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM 'draft'
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'draft') THEN
      RAISE EXCEPTION 'business_only_requires_draft' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_practice_business_only_trigger
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_business_only();

-- Definer is necessary to see closed rows through RLS. The shared row lock
-- serializes admission against a concurrent flag change. UPDATE is guarded too
-- so an old normal-album grant cannot be moved onto a Business album.
CREATE FUNCTION public.reject_business_only_listener_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_only boolean;
BEGIN
  SELECT p.business_only INTO v_business_only
  FROM public.practices AS p WHERE p.id = NEW.practice_id FOR SHARE;
  IF v_business_only THEN
    RAISE EXCEPTION 'business_only_listener_access_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_business_only_listener_access() FROM PUBLIC;
CREATE TRIGGER reject_business_only_visibility_user_trigger
  BEFORE INSERT OR UPDATE ON public.practice_visibility_users
  FOR EACH ROW EXECUTE FUNCTION public.reject_business_only_listener_access();
CREATE TRIGGER reject_business_only_user_practice_trigger
  BEFORE INSERT OR UPDATE ON public.user_practices
  FOR EACH ROW EXECUTE FUNCTION public.reject_business_only_listener_access();

CREATE TRIGGER reject_business_only_playlist_item_trigger
  BEFORE INSERT OR UPDATE ON public.playlist_items
  FOR EACH ROW EXECUTE FUNCTION public.reject_business_only_listener_access();

-- Guard direct service-role issuance/retargeting too. Revocation of historical
-- links remains possible without rewriting practice_id.
CREATE TRIGGER reject_business_only_access_link_trigger
  BEFORE INSERT OR UPDATE OF practice_id ON public.practice_access_links
  FOR EACH ROW EXECUTE FUNCTION public.reject_business_only_listener_access();

-- Flag lookup must bypass parent RLS: normal legacy entitlements can read
-- audio even when the parent is hidden/deleted. Preserve that exact behavior.
CREATE FUNCTION public.practice_is_business_only(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.practices
    WHERE id = p_practice_id AND business_only);
$$;
REVOKE ALL ON FUNCTION public.practice_is_business_only(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_is_business_only(uuid) TO anon, authenticated, service_role;

-- Non-Business branch copied from 20261210120000_practice_scheduled_publication.sql.
CREATE OR REPLACE FUNCTION public.can_current_viewer_read_practice(
  p_practice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.id = p_practice_id
      AND p.deleted_at IS NULL
      AND (
        (p.business_only AND auth.uid() IS NOT NULL AND (
          public.is_practice_author_member(p.id, auth.uid())
          OR public.has_platform_permission(auth.uid(), 'admin_panel.access')
        ))
        OR (NOT p.business_only
          AND public.practice_is_publicly_available(
            p.status,
            p.scheduled_publish_at,
            p.published_at
          )
          AND (
            p.catalog_visibility IN ('listed', 'unlisted')
            OR (
              p.catalog_visibility = 'selected_users'
              AND auth.uid() IS NOT NULL
              AND (
                EXISTS (
                  SELECT 1
                  FROM public.practice_visibility_users AS v
                  WHERE v.practice_id = p.id
                    AND v.user_id = auth.uid()
                )
                OR public.is_practice_author_member(p.id, auth.uid())
                OR public.has_platform_permission(auth.uid(), 'admin_panel.access')
                OR EXISTS (
                  SELECT 1
                  FROM public.user_practices AS up
                  WHERE up.practice_id = p.id
                    AND up.user_id = auth.uid()
                    AND (up.expires_at IS NULL OR up.expires_at > now())
                )
              )
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_current_viewer_read_practice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_current_viewer_read_practice(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_current_viewer_read_practice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_current_viewer_read_practice(uuid) TO service_role;

-- Previous definition: 20261210120000_practice_scheduled_publication.sql
DROP POLICY "Selected users can read allowlisted practices" ON public.practices;
CREATE POLICY "Selected users can read allowlisted practices"
  ON public.practices
  FOR SELECT
  TO authenticated
  USING (
    public.practice_is_publicly_available(
      status,
      scheduled_publish_at,
      published_at
    )
    AND deleted_at IS NULL
    AND catalog_visibility = 'selected_users'
    AND (
      EXISTS (
        SELECT 1
        FROM public.practice_visibility_users AS v
        WHERE v.practice_id = practices.id
          AND NOT practices.business_only
          AND v.user_id = auth.uid()
      )
      OR public.is_practice_author_member(practices.id, auth.uid())
      OR public.has_platform_permission(auth.uid(), 'admin_panel.access')
    )
  );

-- Previous definition: 20260731180000_practice_moderation_mvp_schema.sql
DROP POLICY "Entitled users can read entitled practices" ON public.practices;
CREATE POLICY "Entitled users can read entitled practices"
  ON public.practices
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND NOT business_only
    AND EXISTS (
      SELECT 1
      FROM public.user_practices AS up
      WHERE up.practice_id = practices.id
        AND up.user_id = auth.uid()
        AND (up.expires_at IS NULL OR up.expires_at > now())
    )
  );

-- Previous definition: 20260714180000_unified_audio_product_foundation.sql
DROP POLICY "Entitled users can read audio items" ON public.audio_items;
CREATE POLICY "Entitled users can read audio items"
      ON public.audio_items
      FOR SELECT
      TO authenticated
      USING (
        NOT public.practice_is_business_only(audio_items.practice_id)
        AND EXISTS (
          SELECT 1
          FROM public.user_practices AS up
          WHERE up.user_id = auth.uid()
            AND up.practice_id = audio_items.practice_id
            AND (
              up.expires_at IS NULL
              OR up.expires_at > now()
            )
        )
      );

-- Previous definition: 20260711071529_create_private_practice_audio_bucket.sql
DROP POLICY "Authenticated users can read entitled practice audio" ON storage.objects;
CREATE POLICY "Authenticated users can read entitled practice audio"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'practice-audio'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.user_practices AS up
      WHERE up.user_id = auth.uid()
        AND NOT public.practice_is_business_only(up.practice_id)
        AND up.practice_id::text = split_part(name, '/', 2)
        AND (
          up.expires_at IS NULL
          OR up.expires_at > now()
        )
    )
  );

-- Previous definition: 20260717140000_topics_foundation.sql
DROP POLICY "Entitled users can read practice topics" ON public.practice_topics;
CREATE POLICY "Entitled users can read practice topics"
      ON public.practice_topics
      FOR SELECT
      TO authenticated
      USING (
        NOT public.practice_is_business_only(practice_topics.practice_id)
        AND EXISTS (
          SELECT 1
          FROM public.user_practices AS up
          WHERE up.user_id = auth.uid()
            AND up.practice_id = practice_topics.practice_id
            AND (
              up.expires_at IS NULL
              OR up.expires_at > now()
            )
        )
      );

-- Previous definition: 20260716120000_playlist_covers.sql
CREATE OR REPLACE FUNCTION public.get_owned_playlist_mosaic_covers()
RETURNS TABLE (
  playlist_id uuid,
  item_position integer,
  cover_url text,
  practice_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    pl.id AS playlist_id,
    src.item_position,
    pr.cover_url,
    pr.updated_at AS practice_updated_at
  FROM public.playlists AS pl
  CROSS JOIN LATERAL (
    SELECT pi.practice_id, pi.position AS item_position
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = pl.id
    ORDER BY pi.position ASC
    LIMIT 4
  ) AS src
  INNER JOIN public.practices AS pr
    ON pr.id = src.practice_id
  WHERE pl.user_id = auth.uid()
    AND NOT pr.business_only
  ORDER BY pl.id, src.item_position ASC;
$$;

-- Previous definition: 20260831120000_personal_start_sale_price_snapshot.sql
CREATE OR REPLACE FUNCTION public.resolve_practice_effective_price(
  p_practice_id uuid,
  p_surface text,
  p_visitor_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  is_free boolean,
  base_price integer,
  sale_price integer,
  final_price integer,
  promotion_id uuid,
  promotion_name text,
  promotion_type text,
  ends_at timestamptz,
  expires_at timestamptz,
  base_price_minor bigint,
  sale_price_minor bigint,
  final_price_minor bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_now timestamptz := coalesce(p_now, now());
  v_allow_personal boolean := coalesce(p_surface, 'product') IS DISTINCT FROM 'catalog';
  v_promo public.practice_price_promotions%ROWTYPE;
  v_expires timestamptz;
  v_effective integer;
  v_best public.practice_price_promotions%ROWTYPE;
  v_best_expires timestamptz;
  v_best_price integer;
BEGIN
  -- Public pricing must not reveal closed Business album metadata or bind starts.
  IF public.practice_is_business_only(p_practice_id) THEN
    RETURN;
  END IF;
  IF p_practice_id IS NULL THEN
    RETURN;
  END IF;

  IF p_user_id IS NOT NULL
     AND p_visitor_id IS NOT NULL
     AND btrim(p_visitor_id) <> '' THEN
    PERFORM public.bind_practice_price_promotion_starts(p_visitor_id, p_user_id);
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_practice.is_free IS TRUE
     OR v_practice.price IS NULL
     OR v_practice.price <= 0 THEN
    is_free := true;
    base_price := 0;
    sale_price := NULL;
    final_price := 0;
    promotion_id := NULL;
    promotion_name := NULL;
    promotion_type := NULL;
    ends_at := NULL;
    expires_at := NULL;
    base_price_minor := 0;
    sale_price_minor := NULL;
    final_price_minor := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_promo IN
    SELECT *
    FROM public.practice_price_promotions AS promo
    WHERE promo.practice_id = p_practice_id
      AND promo.is_active IS TRUE
  LOOP
    v_expires := NULL;
    v_effective := NULL;

    IF v_promo.promotion_type = 'calendar'
       AND v_promo.starts_at IS NOT NULL
       AND v_promo.ends_at IS NOT NULL
       AND v_promo.ends_at > v_promo.starts_at
       AND v_now >= v_promo.starts_at
       AND v_now < v_promo.ends_at
       AND v_promo.sale_price > 0
       AND v_promo.sale_price < v_practice.price THEN
      v_expires := v_promo.ends_at;
      v_effective := v_promo.sale_price;
    ELSIF v_allow_personal
          AND v_promo.promotion_type = 'personal_countdown'
          AND v_promo.duration_seconds IS NOT NULL
          AND v_promo.duration_seconds > 0 THEN
      SELECT canonical.expires_at, canonical.sale_price_snapshot
      INTO v_expires, v_effective
      FROM (
        SELECT s.started_at, s.expires_at, s.sale_price_snapshot
        FROM public.practice_price_promotion_starts AS s
        WHERE s.promotion_id = v_promo.id
          AND (
            (
              p_visitor_id IS NOT NULL
              AND btrim(p_visitor_id) <> ''
              AND s.visitor_id = lower(btrim(p_visitor_id))
            )
            OR (
              p_user_id IS NOT NULL
              AND s.user_id = p_user_id
            )
          )
        ORDER BY s.started_at ASC, s.id ASC
        LIMIT 1
      ) AS canonical
      WHERE v_now >= canonical.started_at
        AND v_now < canonical.expires_at
        AND canonical.sale_price_snapshot > 0
        AND canonical.sale_price_snapshot < v_practice.price;
    END IF;

    IF v_expires IS NULL OR v_effective IS NULL THEN
      CONTINUE;
    END IF;

    IF v_best.id IS NULL OR v_effective < v_best_price THEN
      v_best := v_promo;
      v_best_expires := v_expires;
      v_best_price := v_effective;
    END IF;
  END LOOP;

  is_free := false;
  base_price := v_practice.price;
  base_price_minor := v_practice.price::bigint * 100;

  IF v_best.id IS NULL THEN
    sale_price := NULL;
    final_price := v_practice.price;
    promotion_id := NULL;
    promotion_name := NULL;
    promotion_type := NULL;
    ends_at := NULL;
    expires_at := NULL;
    sale_price_minor := NULL;
    final_price_minor := base_price_minor;
  ELSE
    sale_price := v_best_price;
    final_price := v_best_price;
    promotion_id := v_best.id;
    promotion_name := v_best.name;
    promotion_type := v_best.promotion_type;
    ends_at := v_best.ends_at;
    expires_at := v_best_expires;
    sale_price_minor := v_best_price::bigint * 100;
    final_price_minor := sale_price_minor;
  END IF;

  RETURN NEXT;
END;
$$;

-- Previous definition: 20260831120000_personal_start_sale_price_snapshot.sql
CREATE OR REPLACE FUNCTION public.start_practice_price_promotion(
  p_start_token text,
  p_visitor_id text,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  practice_id uuid,
  promotion_id uuid,
  started_at timestamptz,
  expires_at timestamptz,
  sale_price integer,
  reused boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_promo public.practice_price_promotions%ROWTYPE;
  v_visitor text;
  v_user uuid;
  v_now timestamptz := now();
  v_existing public.practice_price_promotion_starts%ROWTYPE;
  v_start public.practice_price_promotion_starts%ROWTYPE;
  v_expires timestamptz;
  v_inserted boolean := false;
BEGIN
  v_visitor := lower(btrim(coalesce(p_visitor_id, '')));
  v_user := coalesce(p_user_id, auth.uid());

  IF v_visitor = '' OR char_length(v_visitor) < 8 THEN
    RAISE EXCEPTION 'visitor_id_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_start_token IS NULL OR btrim(p_start_token) = '' THEN
    RAISE EXCEPTION 'start_token_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT promo.*
  INTO v_promo
  FROM public.practice_price_promotions AS promo
  WHERE promo.start_token = btrim(p_start_token);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promotion_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_promo.is_active IS NOT TRUE
     OR v_promo.promotion_type IS DISTINCT FROM 'personal_countdown'
     OR v_promo.duration_seconds IS NULL
     OR v_promo.duration_seconds <= 0 THEN
    RAISE EXCEPTION 'promotion_not_startable'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.id = v_promo.practice_id
      AND NOT p.business_only
      AND p.status = 'published'
      AND p.deleted_at IS NULL
      AND p.is_free IS NOT TRUE
      AND p.price IS NOT NULL
      AND p.price > v_promo.sale_price
  ) THEN
    RAISE EXCEPTION 'promotion_not_startable'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_user IS NOT NULL THEN
    PERFORM public.bind_practice_price_promotion_starts(v_visitor, v_user);
  END IF;

  SELECT s.*
  INTO v_existing
  FROM public.practice_price_promotion_starts AS s
  WHERE s.promotion_id = v_promo.id
    AND (
      s.visitor_id = v_visitor
      OR (
        v_user IS NOT NULL
        AND s.user_id = v_user
      )
    )
  ORDER BY s.started_at ASC, s.id ASC
  LIMIT 1;

  IF FOUND THEN
    practice_id := v_promo.practice_id;
    promotion_id := v_promo.id;
    started_at := v_existing.started_at;
    expires_at := v_existing.expires_at;
    sale_price := v_existing.sale_price_snapshot;
    reused := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_expires := v_now + make_interval(secs => v_promo.duration_seconds);

  BEGIN
    -- ON CONFLICT inference columns cannot be table-qualified. Execute the
    -- statement as SQL so OUT promotion_id is not substituted into the target.
    EXECUTE
      $insert$
        INSERT INTO public.practice_price_promotion_starts AS starts (
          promotion_id,
          visitor_id,
          user_id,
          started_at,
          expires_at,
          sale_price_snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (promotion_id, visitor_id) DO NOTHING
        RETURNING starts.*
      $insert$
    INTO v_start
    USING v_promo.id, v_visitor, v_user, v_now, v_expires, v_promo.sale_price;

    IF v_start.id IS NOT NULL THEN
      v_inserted := true;
    ELSE
      SELECT s.*
      INTO v_start
      FROM public.practice_price_promotion_starts AS s
      WHERE s.promotion_id = v_promo.id
        AND s.visitor_id = v_visitor
      ORDER BY s.started_at ASC, s.id ASC
      LIMIT 1;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT s.*
      INTO v_start
      FROM public.practice_price_promotion_starts AS s
      WHERE s.promotion_id = v_promo.id
        AND (
          s.visitor_id = v_visitor
          OR (
            v_user IS NOT NULL
            AND s.user_id = v_user
          )
        )
      ORDER BY s.started_at ASC, s.id ASC
      LIMIT 1;
  END;

  IF v_user IS NOT NULL THEN
    PERFORM public.bind_practice_price_promotion_starts(v_visitor, v_user);

    SELECT s.*
    INTO v_start
    FROM public.practice_price_promotion_starts AS s
    WHERE s.promotion_id = v_promo.id
      AND (
        s.visitor_id = v_visitor
        OR s.user_id = v_user
      )
    ORDER BY s.started_at ASC, s.id ASC
    LIMIT 1;
  END IF;

  practice_id := v_promo.practice_id;
  promotion_id := v_promo.id;
  started_at := v_start.started_at;
  expires_at := v_start.expires_at;
  sale_price := v_start.sale_price_snapshot;
  reused := NOT v_inserted;
  RETURN NEXT;
END;
$$;

-- Previous definition: 20261005120000_create_course_upgrade_order_base_price_snapshot.sql
CREATE OR REPLACE FUNCTION public.create_course_upgrade_order(
  p_practice_id uuid,
  p_idempotency_key uuid,
  p_expected_target_access_level integer DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  practice_id uuid,
  practice_slug text,
  status text,
  amount_minor bigint,
  currency text,
  order_kind text,
  target_access_level integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_current integer;
  v_target integer;
  v_level public.practice_access_levels%ROWTYPE;
  v_amount_minor bigint;
  v_idempotency_key text;
  v_existing public.orders%ROWTYPE;
  v_new_order public.orders%ROWTYPE;
  v_entitled boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required'
      USING ERRCODE = '22023';
  END IF;

  v_idempotency_key := p_idempotency_key::text;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id AND NOT p.business_only;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.publication_class IS DISTINCT FROM 'course' THEN
    RAISE EXCEPTION 'not_course'
      USING ERRCODE = '22023';
  END IF;

  -- True idempotency: return the original snapshot before published /
  -- commercial / entitlement gates. A later unpublish must not block
  -- replay of an already created upgrade.
  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM v_user_id
       OR v_existing.practice_id IS DISTINCT FROM v_practice.id
       OR v_existing.order_kind IS DISTINCT FROM 'course_upgrade' THEN
      RAISE EXCEPTION 'idempotency_key_conflict'
        USING ERRCODE = '23505';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.practice_id,
      v_existing.practice_slug_snapshot,
      v_existing.status,
      v_existing.amount_minor,
      v_existing.currency,
      v_existing.order_kind,
      v_existing.target_access_level,
      v_existing.created_at;
    RETURN;
  END IF;

  SELECT up.access_level
  INTO v_current
  FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = v_practice.id
    AND (up.expires_at IS NULL OR up.expires_at > now());

  v_entitled := FOUND AND v_current IS NOT NULL;

  -- Unpublished / unlisted catalog gates apply only to new buyers.
  -- An already-entitled learner (purchase, access link, admin) may
  -- start the next sequential upgrade without the product being public.
  IF NOT v_entitled THEN
    IF v_practice.status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'practice_not_published'
        USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.viewer_can_commercially_access_practice(v_practice, v_user_id) THEN
      RAISE EXCEPTION 'practice_not_found'
        USING ERRCODE = 'P0002';
    END IF;

    RAISE EXCEPTION 'not_entitled'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_practice.is_free IS TRUE
     OR v_practice.price IS NULL
     OR v_practice.price <= 0 THEN
    RAISE EXCEPTION 'practice_not_for_sale'
      USING ERRCODE = 'P0002';
  END IF;

  v_target := v_current + 1;

  IF v_target < 2 THEN
    RAISE EXCEPTION 'invalid_upgrade_target'
      USING ERRCODE = '22023';
  END IF;

  IF p_expected_target_access_level IS NOT NULL
     AND p_expected_target_access_level IS DISTINCT FROM v_target THEN
    RAISE EXCEPTION 'invalid_target_access_level'
      USING ERRCODE = '22023',
            DETAIL = format('expected=%s;current=%s', v_target, v_current);
  END IF;

  SELECT pal.*
  INTO v_level
  FROM public.practice_access_levels AS pal
  WHERE pal.practice_id = v_practice.id
    AND pal.level = v_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'upgrade_not_configured'
      USING ERRCODE = 'P0001',
            DETAIL = 'level_not_in_catalog';
  END IF;

  IF v_level.currency IS DISTINCT FROM 'RUB' THEN
    RAISE EXCEPTION 'invalid_upgrade_currency'
      USING ERRCODE = '22023';
  END IF;

  IF v_level.upgrade_price IS NULL OR v_level.upgrade_price <= 0 THEN
    RAISE EXCEPTION 'upgrade_not_configured'
      USING ERRCODE = 'P0001',
            DETAIL = 'upgrade_price_required';
  END IF;

  -- Integer RUB → kopecks. Client amount is ignored.
  v_amount_minor := (v_level.upgrade_price::bigint) * 100;

  IF v_amount_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_upgrade_price'
      USING ERRCODE = '22023';
  END IF;

  -- Reuse live pending upgrade for same user+practice+target.
  -- Existing UNIQUE (user_id, practice_id) WHERE pending is the SoT
  -- against two live charges. Amount stays (config drift).
  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.user_id = v_user_id
    AND o.practice_id = v_practice.id
    AND o.status = 'pending'
    AND o.order_kind = 'course_upgrade'
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.order_kind IS DISTINCT FROM 'course_upgrade'
       OR v_existing.target_access_level IS DISTINCT FROM v_target THEN
      RAISE EXCEPTION 'pending_order_exists'
        USING ERRCODE = '23505',
              HINT = format('existing_order_id=%s', v_existing.id);
    END IF;

    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.practice_id,
      v_existing.practice_slug_snapshot,
      v_existing.status,
      v_existing.amount_minor,
      v_existing.currency,
      v_existing.order_kind,
      v_existing.target_access_level,
      v_existing.created_at;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.orders (
      user_id,
      practice_id,
      status,
      amount_minor,
      currency,
      practice_title_snapshot,
      practice_slug_snapshot,
      price_minor_snapshot,
      base_price_minor_snapshot,
      author_id_snapshot,
      idempotency_key,
      order_kind,
      target_access_level
    )
    VALUES (
      v_user_id,
      v_practice.id,
      'pending',
      v_amount_minor,
      'RUB',
      v_practice.title,
      v_practice.slug,
      v_amount_minor,
      v_amount_minor,
      v_practice.author_id,
      v_idempotency_key,
      'course_upgrade',
      v_target
    )
    RETURNING * INTO v_new_order;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT o.*
      INTO v_existing
      FROM public.orders AS o
      WHERE o.idempotency_key = v_idempotency_key;

      IF FOUND THEN
        IF v_existing.user_id IS DISTINCT FROM v_user_id
           OR v_existing.practice_id IS DISTINCT FROM v_practice.id
           OR v_existing.order_kind IS DISTINCT FROM 'course_upgrade' THEN
          RAISE EXCEPTION 'idempotency_key_conflict'
            USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT
          v_existing.id,
          v_existing.practice_id,
          v_existing.practice_slug_snapshot,
          v_existing.status,
          v_existing.amount_minor,
          v_existing.currency,
          v_existing.order_kind,
          v_existing.target_access_level,
          v_existing.created_at;
        RETURN;
      END IF;

      SELECT o.*
      INTO v_existing
      FROM public.orders AS o
      WHERE o.user_id = v_user_id
        AND o.practice_id = v_practice.id
        AND o.status = 'pending'
        AND o.order_kind = 'course_upgrade'
      ORDER BY o.created_at DESC
      LIMIT 1;

      IF FOUND
         AND v_existing.order_kind = 'course_upgrade'
         AND v_existing.target_access_level IS NOT DISTINCT FROM v_target THEN
        RETURN QUERY
        SELECT
          v_existing.id,
          v_existing.practice_id,
          v_existing.practice_slug_snapshot,
          v_existing.status,
          v_existing.amount_minor,
          v_existing.currency,
          v_existing.order_kind,
          v_existing.target_access_level,
          v_existing.created_at;
        RETURN;
      END IF;

      IF FOUND THEN
        RAISE EXCEPTION 'pending_order_exists'
          USING ERRCODE = '23505',
                HINT = format('existing_order_id=%s', v_existing.id);
      END IF;

      RAISE;
  END;

  RETURN QUERY
  SELECT
    v_new_order.id,
    v_new_order.practice_id,
    v_new_order.practice_slug_snapshot,
    v_new_order.status,
    v_new_order.amount_minor,
    v_new_order.currency,
    v_new_order.order_kind,
    v_new_order.target_access_level,
    v_new_order.created_at;
END;
$$;

-- Previous definition: 20260804130000_remove_library_practice.sql
CREATE OR REPLACE FUNCTION public.remove_library_practice(p_practice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_row public.user_practices%ROWTYPE;
  v_practice_slug text;
  v_deleted_count integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT up.*
  INTO v_row
  FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_in_library'
      USING ERRCODE = 'P0002';
  END IF;

  -- v1: only manual free_claim saves are removable.
  -- starter is a platform signup grant, not a user save — never delete here.
  IF v_row.access_source IS DISTINCT FROM 'free_claim' THEN
    RAISE EXCEPTION 'not_removable'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT p.slug
  INTO v_practice_slug
  FROM public.practices AS p
  WHERE p.id = p_practice_id AND NOT p.business_only;

  DELETE FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = p_practice_id
    AND up.access_source = 'free_claim';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION 'not_removable'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'practice_id', p_practice_id,
    'practice_slug', COALESCE(v_practice_slug, ''),
    'removed', true,
    'in_library', false
  );
END;
$$;

-- Previous definition: 20260823191000_quick_offers.sql
CREATE OR REPLACE FUNCTION public.apply_quick_offer_amount(
  p_order_id uuid,
  p_quick_offer_id uuid,
  p_window_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_offer public.quick_offers%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_charge integer;
  v_charge_minor bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_order_id IS NULL OR p_quick_offer_id IS NULL THEN
    RAISE EXCEPTION 'quick_offer_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'quick_offer_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'quick_offer_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = v_order.practice_id
    AND p.status = 'published'
    AND NOT p.business_only;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_offer
  FROM public.quick_offers AS qo
  WHERE qo.id = p_quick_offer_id;

  IF NOT FOUND
    OR v_offer.status IS DISTINCT FROM 'published'
    OR v_offer.practice_id IS DISTINCT FROM v_order.practice_id THEN
    v_charge := v_practice.price;
  ELSE
    v_charge := public.resolve_quick_offer_charge_rubles(
      v_practice.price,
      v_offer.promo_price,
      v_offer.timer_duration_seconds,
      p_window_expires_at
    );
  END IF;

  IF v_charge IS NULL OR v_charge <= 0 THEN
    RAISE EXCEPTION 'invalid_practice_price'
      USING ERRCODE = '22023';
  END IF;

  v_charge_minor := v_charge::bigint * 100;

  UPDATE public.orders AS o
  SET
    amount_minor = v_charge_minor,
    price_minor_snapshot = v_charge_minor,
    quick_offer_id = p_quick_offer_id,
    updated_at = now()
  WHERE o.id = v_order.id
    AND o.status = 'pending'
    AND o.user_id = v_user_id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'amount_minor', v_order.amount_minor,
    'price_minor_snapshot', v_order.price_minor_snapshot,
    'currency', v_order.currency
  );
END;
$$;

-- Previous definition: 20261210120000_practice_scheduled_publication.sql
CREATE OR REPLACE FUNCTION public.viewer_can_commercially_access_practice(
  p_practice public.practices,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_practice.business_only THEN
    RETURN p_practice.deleted_at IS NULL AND p_user_id IS NOT NULL AND (
      public.is_practice_author_member(p_practice.id, p_user_id)
      OR public.has_platform_permission(p_user_id, 'admin_panel.access')
    );
  END IF;
  IF p_practice.deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF NOT public.practice_is_publicly_available(
    p_practice.status,
    p_practice.scheduled_publish_at,
    p_practice.published_at
  ) THEN
    RETURN false;
  END IF;

  IF p_practice.catalog_visibility IN ('listed', 'unlisted') THEN
    RETURN true;
  END IF;

  IF p_practice.catalog_visibility IS DISTINCT FROM 'selected_users' THEN
    RETURN false;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.practice_visibility_users AS v
    WHERE v.practice_id = p_practice.id
      AND v.user_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  IF public.is_practice_author_member(p_practice.id, p_user_id) THEN
    RETURN true;
  END IF;

  RETURN public.has_platform_permission(p_user_id, 'admin_panel.access');
END;
$$;

-- Public practices require listed/unlisted, impossible for Business by CHECK.
-- Audio metadata/gallery/topics/classical links inherit the updated read helper.
-- Author-member policies stay unchanged. practice_tracks does not exist;
-- music_audio_assets has RLS enabled and no client SELECT policies.
-- External access links: retain normal-album behavior and existing RPC ACLs.

-- Previous definition: 20260926120000_practice_access_links.sql
CREATE OR REPLACE FUNCTION public.preview_practice_access_link(
  p_token_hash text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.practice_access_links%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_author_slug text;
  v_level_title text;
  v_level_description text;
  v_display_status text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  SELECT *
  INTO v_link
  FROM public.practice_access_links
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = v_link.practice_id;

  IF NOT FOUND OR v_practice.deleted_at IS NOT NULL OR v_practice.business_only THEN
    RAISE EXCEPTION 'invalid_token'
      USING ERRCODE = 'P0002', DETAIL = 'invalid_token';
  END IF;

  SELECT a.slug
  INTO v_author_slug
  FROM public.authors AS a
  WHERE a.id = v_practice.author_id;

  SELECT pal.title, pal.description
  INTO v_level_title, v_level_description
  FROM public.practice_access_levels AS pal
  WHERE pal.practice_id = v_link.practice_id
    AND pal.level = v_link.target_access_level;

  IF v_link.status = 'revoked' THEN
    v_display_status := 'revoked';
  ELSIF v_link.status = 'redeemed' THEN
    IF p_user_id IS NOT NULL
       AND v_link.redeemed_by_user_id IS NOT DISTINCT FROM p_user_id THEN
      v_display_status := 'already_redeemed_by_you';
    ELSE
      v_display_status := 'redeemed';
    END IF;
  ELSIF v_link.expires_at IS NOT NULL AND v_link.expires_at < clock_timestamp() THEN
    v_display_status := 'expired';
  ELSE
    v_display_status := 'active';
  END IF;

  RETURN jsonb_build_object(
    'status', v_display_status,
    'product_title', v_practice.title,
    'product_slug', v_practice.slug,
    'author_slug', v_author_slug,
    'publication_class', v_practice.publication_class,
    'target_access_level', v_link.target_access_level,
    'level_title', v_level_title,
    'level_description', v_level_description,
    'expires_at', v_link.expires_at
  );
END;
$$;

-- Previous definition: 20260926120000_practice_access_links.sql
CREATE OR REPLACE FUNCTION public.assert_practice_access_link_target(
  p_practice_id uuid,
  p_target_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_has_catalog boolean;
  v_level_exists boolean;
BEGIN
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002', DETAIL = 'practice_not_found';
  END IF;

  IF p_target_level IS NULL OR p_target_level < 1 THEN
    RAISE EXCEPTION 'invalid_access_level'
      USING ERRCODE = '22023', DETAIL = 'level_must_be_gte_1';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
    AND p.deleted_at IS NULL
  FOR SHARE;

  IF NOT FOUND OR v_practice.business_only THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002', DETAIL = 'practice_not_found';
  END IF;

  IF p_target_level > 1
     AND v_practice.publication_class IS DISTINCT FROM 'course' THEN
    RAISE EXCEPTION 'access_level_not_available'
      USING ERRCODE = '22023', DETAIL = 'course_only';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.practice_access_levels AS pal
    WHERE pal.practice_id = p_practice_id
  )
  INTO v_has_catalog;

  IF NOT v_has_catalog THEN
    IF p_target_level <> 1 THEN
      RAISE EXCEPTION 'target_level_not_configured'
        USING ERRCODE = '22023', DETAIL = 'legacy_level_1_only';
    END IF;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.practice_access_levels AS pal
    WHERE pal.practice_id = p_practice_id
      AND pal.level = p_target_level
  )
  INTO v_level_exists;

  IF NOT v_level_exists THEN
    RAISE EXCEPTION 'target_level_not_configured'
      USING ERRCODE = '22023', DETAIL = 'level_not_in_catalog';
  END IF;
END;
$$;

-- Previous definition: 20260923120100_course_access_levels_foundation.sql
CREATE OR REPLACE FUNCTION public.grant_practice_access(
  p_user_id uuid,
  p_practice_id uuid,
  p_target_level integer,
  p_access_source text DEFAULT 'admin',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_access_source text;
  v_has_catalog boolean;
  v_level_exists boolean;
  v_inserted boolean;
  v_previous integer;
  v_result_level integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required'
      USING ERRCODE = '22023', DETAIL = 'user_id_required';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023', DETAIL = 'practice_id_required';
  END IF;

  IF p_target_level IS NULL OR p_target_level < 1 THEN
    RAISE EXCEPTION 'invalid_access_level'
      USING ERRCODE = '22023', DETAIL = 'level_must_be_gte_1';
  END IF;

  v_access_source := coalesce(nullif(btrim(coalesce(p_access_source, '')), ''), 'admin');

  IF v_access_source NOT IN (
    'starter',
    'free_claim',
    'purchase',
    'gift',
    'subscription',
    'program',
    'admin',
    'external_manual'
  ) THEN
    RAISE EXCEPTION 'invalid_access_source'
      USING ERRCODE = '22023', DETAIL = 'invalid_access_source';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR SHARE;

  IF NOT FOUND OR v_practice.business_only THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002', DETAIL = 'practice_not_found';
  END IF;

  -- Public-path invariant: L2+ only for explicit courses. Not a table CHECK
  -- so future publication classes can grow without a schema rewrite.
  IF p_target_level > 1
     AND v_practice.publication_class IS DISTINCT FROM 'course' THEN
    RAISE EXCEPTION 'access_level_not_available'
      USING ERRCODE = '22023', DETAIL = 'course_only';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.practice_access_levels AS pal
    WHERE pal.practice_id = p_practice_id
  )
  INTO v_has_catalog;

  IF v_has_catalog THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.practice_access_levels AS pal
      WHERE pal.practice_id = p_practice_id
        AND pal.level = p_target_level
    )
    INTO v_level_exists;

    -- Level 1 is the implicit baseline (native purchase / legacy owners)
    -- even when the catalog only lists a higher tier. Target > 1 must exist.
    IF p_target_level > 1 AND NOT v_level_exists THEN
      RAISE EXCEPTION 'access_level_not_configured'
        USING ERRCODE = '22023', DETAIL = 'level_not_in_catalog';
    END IF;
  ELSIF p_target_level <> 1 THEN
    RAISE EXCEPTION 'access_level_not_configured'
      USING ERRCODE = '22023', DETAIL = 'legacy_level_1_only';
  END IF;

  SELECT up.access_level
  INTO v_previous
  FROM public.user_practices AS up
  WHERE up.user_id = p_user_id
    AND up.practice_id = p_practice_id;

  INSERT INTO public.user_practices (
    user_id,
    practice_id,
    access_source,
    access_level,
    metadata
  )
  VALUES (
    p_user_id,
    p_practice_id,
    v_access_source,
    p_target_level,
    coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (user_id, practice_id) DO UPDATE
  SET
    access_level = GREATEST(
      public.user_practices.access_level,
      EXCLUDED.access_level
    ),
    metadata = CASE
      WHEN EXCLUDED.access_level > public.user_practices.access_level THEN
        public.user_practices.metadata || EXCLUDED.metadata
      ELSE
        public.user_practices.metadata
    END
  RETURNING (xmax = 0), access_level
  INTO v_inserted, v_result_level;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'practice_id', p_practice_id,
    'access_level', v_result_level,
    'previous_access_level', v_previous,
    'inserted', v_inserted,
    'raised', coalesce(v_previous, 0) < v_result_level
  );
END;
$$;

COMMIT;
