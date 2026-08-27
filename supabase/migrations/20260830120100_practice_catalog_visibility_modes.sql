BEGIN;

-- ---------------------------------------------------------------------------
-- Personal product visibility MVP
--
-- ACCESS = user_practices entitlement (unchanged)
-- SAVE   = library_saves bookmark (unchanged)
-- VISIBILITY = who may see the product in catalog / PDP discovery
--
-- catalog_visibility is the source of truth.
-- is_catalog_listed stays as a synced compatibility flag:
--   listed         → true
--   unlisted       → false
--   selected_users → false
-- Backfill: is_catalog_listed=true → listed; false → unlisted (never selected_users).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Column + backfill + sync
-- ---------------------------------------------------------------------------

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS catalog_visibility text;

UPDATE public.practices
SET catalog_visibility = CASE
  WHEN is_catalog_listed IS TRUE THEN 'listed'
  ELSE 'unlisted'
END
WHERE catalog_visibility IS NULL;

-- No column DEFAULT: BEFORE INSERT trigger derives visibility.
-- Otherwise DEFAULT 'listed' would hide a legacy INSERT that only
-- set is_catalog_listed=false and never sent catalog_visibility.
ALTER TABLE public.practices
  ALTER COLUMN catalog_visibility DROP DEFAULT;

ALTER TABLE public.practices
  ALTER COLUMN catalog_visibility SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_catalog_visibility_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_catalog_visibility_check
      CHECK (catalog_visibility IN ('listed', 'unlisted', 'selected_users'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_catalog_visibility_listed_sync_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_catalog_visibility_listed_sync_check
      CHECK (is_catalog_listed = (catalog_visibility = 'listed'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.practices.catalog_visibility IS
  'Who may discover the product: listed (public catalog), unlisted (direct link), selected_users (allowlist). Synced with is_catalog_listed. Never grants listen access.';

CREATE OR REPLACE FUNCTION public.sync_practice_catalog_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.catalog_visibility IS NULL THEN
      NEW.catalog_visibility := CASE
        WHEN NEW.is_catalog_listed IS FALSE THEN 'unlisted'
        ELSE 'listed'
      END;
    END IF;

    NEW.is_catalog_listed := (NEW.catalog_visibility = 'listed');
    RETURN NEW;
  END IF;

  IF NEW.catalog_visibility IS DISTINCT FROM OLD.catalog_visibility THEN
    NEW.is_catalog_listed := (NEW.catalog_visibility = 'listed');
  ELSIF NEW.is_catalog_listed IS DISTINCT FROM OLD.is_catalog_listed THEN
    IF NEW.is_catalog_listed IS TRUE THEN
      NEW.catalog_visibility := 'listed';
    ELSIF OLD.catalog_visibility = 'selected_users' THEN
      NEW.catalog_visibility := 'selected_users';
      NEW.is_catalog_listed := false;
    ELSE
      NEW.catalog_visibility := 'unlisted';
    END IF;
  ELSE
    NEW.is_catalog_listed := (NEW.catalog_visibility = 'listed');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_practice_catalog_visibility ON public.practices;
CREATE TRIGGER trg_sync_practice_catalog_visibility
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_practice_catalog_visibility();

CREATE INDEX IF NOT EXISTS practices_catalog_visibility_published_idx
  ON public.practices (catalog_visibility)
  WHERE status = 'published' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Allowlist — VISIBILITY only, never entitlement
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_visibility_users (
  practice_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,
  created_by uuid
    REFERENCES auth.users (id)
    ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT practice_visibility_users_unique
    UNIQUE (practice_id, user_id)
);

CREATE INDEX IF NOT EXISTS practice_visibility_users_user_id_idx
  ON public.practice_visibility_users (user_id);

CREATE INDEX IF NOT EXISTS practice_visibility_users_practice_id_idx
  ON public.practice_visibility_users (practice_id);

COMMENT ON TABLE public.practice_visibility_users IS
  'Allowlist for selected_users visibility. Means ONLY that this user may SEE the product. Not purchase, grant, free claim, library add, or subscription. Never write user_practices from this table.';

ALTER TABLE public.practice_visibility_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.practice_visibility_users FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_visibility_users FROM anon;
REVOKE ALL ON TABLE public.practice_visibility_users FROM authenticated;

GRANT SELECT ON TABLE public.practice_visibility_users TO authenticated;
GRANT ALL ON TABLE public.practice_visibility_users TO service_role;

DROP POLICY IF EXISTS "Users can view own practice visibility rows"
  ON public.practice_visibility_users;
CREATE POLICY "Users can view own practice visibility rows"
  ON public.practice_visibility_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Author members can view practice visibility rows"
  ON public.practice_visibility_users;
CREATE POLICY "Author members can view practice visibility rows"
  ON public.practice_visibility_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = practice_visibility_users.practice_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

CREATE TABLE IF NOT EXISTS public.practice_visibility_lookup_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_visibility_lookup_attempts_user_idx
  ON public.practice_visibility_lookup_attempts (user_id, attempted_at DESC);

ALTER TABLE public.practice_visibility_lookup_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.practice_visibility_lookup_attempts FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_visibility_lookup_attempts FROM anon;
REVOKE ALL ON TABLE public.practice_visibility_lookup_attempts FROM authenticated;
GRANT ALL ON TABLE public.practice_visibility_lookup_attempts TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Visibility helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_practice_author_member(
  p_practice_id uuid,
  p_user_id uuid
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
    JOIN public.author_members AS am
      ON am.author_id = p.author_id
    WHERE p.id = p_practice_id
      AND am.user_id = p_user_id
      AND am.role IN ('owner', 'editor')
  );
$$;

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
  IF p_practice.status IS DISTINCT FROM 'published'
     OR p_practice.deleted_at IS NOT NULL THEN
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
        (
          p.status = 'published'
          AND p.catalog_visibility IN ('listed', 'unlisted')
        )
        OR (
          p.status = 'published'
          AND p.catalog_visibility = 'selected_users'
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
  );
$$;

REVOKE ALL ON FUNCTION public.is_practice_author_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_practice_author_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_practice_author_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_practice_author_member(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.viewer_can_commercially_access_practice(public.practices, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.viewer_can_commercially_access_practice(public.practices, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.viewer_can_commercially_access_practice(public.practices, uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.can_current_viewer_read_practice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_current_viewer_read_practice(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_current_viewer_read_practice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_current_viewer_read_practice(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS — practices and public child metadata
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can read published practices" ON public.practices;
CREATE POLICY "Public can read published practices"
  ON public.practices
  FOR SELECT
  TO public
  USING (
    status = 'published'
    AND deleted_at IS NULL
    AND catalog_visibility IN ('listed', 'unlisted')
  );

DROP POLICY IF EXISTS "Selected users can read allowlisted practices"
  ON public.practices;
CREATE POLICY "Selected users can read allowlisted practices"
  ON public.practices
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND deleted_at IS NULL
    AND catalog_visibility = 'selected_users'
    AND (
      EXISTS (
        SELECT 1
        FROM public.practice_visibility_users AS v
        WHERE v.practice_id = practices.id
          AND v.user_id = auth.uid()
      )
      OR public.is_practice_author_member(practices.id, auth.uid())
      OR public.has_platform_permission(auth.uid(), 'admin_panel.access')
    )
  );

DROP POLICY IF EXISTS "Public can read published audio item metadata"
  ON public.audio_items;
CREATE POLICY "Public can read published audio item metadata"
  ON public.audio_items
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    AND public.can_current_viewer_read_practice(audio_items.practice_id)
  );

DROP POLICY IF EXISTS "Public can read published publication gallery slides"
  ON public.publication_gallery_slides;
CREATE POLICY "Public can read published publication gallery slides"
  ON public.publication_gallery_slides
  FOR SELECT
  TO public
  USING (
    public.can_current_viewer_read_practice(
      publication_gallery_slides.publication_id
    )
  );

DROP POLICY IF EXISTS "Public can read topics of published practices"
  ON public.practice_topics;
CREATE POLICY "Public can read topics of published practices"
  ON public.practice_topics
  FOR SELECT
  TO anon, authenticated
  USING (
    public.can_current_viewer_read_practice(practice_topics.practice_id)
  );

-- ---------------------------------------------------------------------------
-- 5. claim_free_practice — listed + unlisted; selected_users allowlist only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_free_practice(p_practice_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_inserted_count integer;
  v_access_source text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_slug IS NULL OR btrim(p_practice_slug) = '' THEN
    RAISE EXCEPTION 'practice_slug_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.slug = btrim(p_practice_slug);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_published'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.viewer_can_commercially_access_practice(v_practice, v_user_id) THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.is_free IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'practice_not_free'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.price IS NOT NULL AND v_practice.price > 0 THEN
    RAISE EXCEPTION 'practice_not_free'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_user_id, v_practice.id, 'free_claim')
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  SELECT up.access_source
  INTO v_access_source
  FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = v_practice.id
    AND (up.expires_at IS NULL OR up.expires_at > now());

  IF v_access_source IS NULL THEN
    RAISE EXCEPTION 'library_row_missing'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'practice_id', v_practice.id,
    'practice_slug', v_practice.slug,
    'inserted', v_inserted_count = 1,
    'access_source', v_access_source,
    'in_library', true
  );
END;
$$;

COMMENT ON FUNCTION public.claim_free_practice(text) IS
  'audiolad:library-claim:v2; grants free_claim for published listed/unlisted free products, or selected_users when allowlisted/author/admin; never writes visibility as entitlement';

-- ---------------------------------------------------------------------------
-- 6. claim_promo_practice — selected_users cannot ride guest_access
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_promo_practice(
  p_practice_slug text DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_inserted_count integer;
  v_access_source text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_id IS NOT NULL THEN
    SELECT p.*
    INTO v_practice
    FROM public.practices AS p
    WHERE p.id = p_practice_id;
  ELSIF p_practice_slug IS NOT NULL AND btrim(p_practice_slug) <> '' THEN
    SELECT p.*
    INTO v_practice
    FROM public.practices AS p
    WHERE p.slug = btrim(p_practice_slug);
  ELSE
    RAISE EXCEPTION 'practice_identifier_required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_published'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.viewer_can_commercially_access_practice(v_practice, v_user_id) THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_practice.guest_access_enabled IS TRUE
    OR (
      v_practice.is_free IS TRUE
      AND v_practice.catalog_visibility IN ('listed', 'unlisted', 'selected_users')
    )
  ) THEN
    RAISE EXCEPTION 'practice_not_promo_eligible'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_practices (user_id, practice_id, access_source, metadata)
  VALUES (
    v_user_id,
    v_practice.id,
    CASE
      WHEN v_practice.is_free IS TRUE THEN 'free_claim'
      ELSE 'gift'
    END,
    jsonb_build_object('promo_claim', true)
  )
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  SELECT up.access_source
  INTO v_access_source
  FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = v_practice.id
    AND (up.expires_at IS NULL OR up.expires_at > now());

  IF v_access_source IS NULL THEN
    RAISE EXCEPTION 'library_row_missing'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'practice_id', v_practice.id,
    'practice_slug', v_practice.slug,
    'inserted', v_inserted_count = 1,
    'access_source', v_access_source,
    'in_library', true
  );
END;
$$;

COMMENT ON FUNCTION public.claim_promo_practice(text, uuid) IS
  'audiolad:promo-claim:v3; guest_access/free claim; selected_users requires allowlist/author/admin and cannot be bypassed via guest_access';

-- ---------------------------------------------------------------------------
-- 7. Allowlist + exact identity lookup RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_practice_visibility_users(
  p_practice_id uuid
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_practice_author_member(p_practice_id, v_user_id) THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.user_id,
    COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь') AS display_name,
    v.created_at
  FROM public.practice_visibility_users AS v
  LEFT JOIN public.profiles AS pr
    ON pr.id = v.user_id
  WHERE v.practice_id = p_practice_id
  ORDER BY v.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_practice_visibility_user(
  p_practice_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_practice_author_member(p_practice_id, v_actor) THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles AS pr WHERE pr.id = p_user_id) THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.practice_visibility_users (
    practice_id,
    user_id,
    created_by
  )
  VALUES (p_practice_id, p_user_id, v_actor)
  ON CONFLICT (practice_id, user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'practice_id', p_practice_id,
    'user_id', p_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_practice_visibility_user(
  p_practice_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_practice_author_member(p_practice_id, v_actor) THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.practice_visibility_users AS v
  WHERE v.practice_id = p_practice_id
    AND v.user_id = p_user_id;

  RETURN jsonb_build_object(
    'practice_id', p_practice_id,
    'user_id', p_user_id,
    'removed', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_practice_visibility_user(
  p_practice_id uuid,
  p_query text
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_query text;
  v_uuid uuid;
  v_recent integer;
  v_user_id uuid;
  v_full_name text;
  v_email text;
  v_typed_email text;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_practice_author_member(p_practice_id, v_actor) THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = '42501';
  END IF;

  v_query := lower(btrim(COALESCE(p_query, '')));

  IF v_query = '' THEN
    RETURN;
  END IF;

  -- Serialize per-actor attempts so parallel requests cannot exceed 20 / 10 min.
  PERFORM pg_advisory_xact_lock(
    hashtext('practice_visibility_lookup'),
    hashtext(v_actor::text)
  );

  SELECT count(*)
  INTO v_recent
  FROM public.practice_visibility_lookup_attempts AS a
  WHERE a.user_id = v_actor
    AND a.attempted_at > now() - interval '10 minutes';

  IF v_recent >= 20 THEN
    RETURN;
  END IF;

  INSERT INTO public.practice_visibility_lookup_attempts (user_id)
  VALUES (v_actor);

  BEGIN
    v_uuid := v_query::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_uuid := NULL;
  END;

  IF v_uuid IS NOT NULL THEN
    SELECT pr.id, pr.full_name, NULL
    INTO v_user_id, v_full_name, v_email
    FROM public.profiles AS pr
    WHERE pr.id = v_uuid;
  ELSE
    v_typed_email := v_query;

    SELECT pr.id, pr.full_name, v_typed_email
    INTO v_user_id, v_full_name, v_email
    FROM public.profiles AS pr
    WHERE lower(btrim(pr.email)) = v_typed_email;

    IF v_user_id IS NULL THEN
      SELECT au.id, pr.full_name, v_typed_email
      INTO v_user_id, v_full_name, v_email
      FROM auth.users AS au
      LEFT JOIN public.profiles AS pr
        ON pr.id = au.id
      WHERE lower(btrim(au.email)) = v_typed_email;
    END IF;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  user_id := v_user_id;
  display_name := COALESCE(NULLIF(btrim(v_full_name), ''), 'Пользователь');
  email := v_email;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.list_practice_visibility_users(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_practice_visibility_users(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_practice_visibility_users(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.add_practice_visibility_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_practice_visibility_user(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_practice_visibility_user(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_practice_visibility_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_practice_visibility_user(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_practice_visibility_user(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.lookup_practice_visibility_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_practice_visibility_user(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_practice_visibility_user(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Public discovery surfaces — selected_users must not leak
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.is_practice_promo_page_eligible(text, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.is_practice_promo_page_eligible(
  p_status text,
  p_is_free boolean,
  p_is_catalog_listed boolean,
  p_guest_access_enabled boolean,
  p_catalog_visibility text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    p_status = 'published'
    AND COALESCE(
      p_catalog_visibility,
      CASE
        WHEN p_is_catalog_listed IS TRUE THEN 'listed'
        ELSE 'unlisted'
      END
    ) IS DISTINCT FROM 'selected_users'
    AND (
      (
        p_is_free IS TRUE
        AND p_is_catalog_listed IS TRUE
      )
      OR p_guest_access_enabled IS TRUE
    );
$$;

COMMENT ON FUNCTION public.is_practice_promo_page_eligible(text, boolean, boolean, boolean, text) IS
  'Public promo eligibility for listed/unlisted only. selected_users never becomes public via guest_access.';

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
    AND (
      public.is_practice_promo_page_eligible(
        p.status,
        p.is_free,
        p.is_catalog_listed,
        p.guest_access_enabled,
        p.catalog_visibility
      )
      OR (
        p.status = 'published'
        AND p.deleted_at IS NULL
        AND p.catalog_visibility = 'selected_users'
        AND public.can_current_viewer_read_practice(p.id)
        AND (
          p.guest_access_enabled IS TRUE
          OR p.is_free IS TRUE
        )
      )
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

REVOKE ALL ON FUNCTION public.get_public_promo_page(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_promo_page(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_promo_page(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_promo_page(text, text) TO service_role;

COMMENT ON FUNCTION public.get_public_promo_page(text, text) IS
  'audiolad:promo-page-public:v2; listed/unlisted stay public; selected_users only for allowlisted/author/admin/entitled viewers';

CREATE OR REPLACE FUNCTION public.get_public_quick_offer(
  p_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offer public.quick_offers%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_materials jsonb;
BEGIN
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_offer
  FROM public.quick_offers AS qo
  WHERE qo.slug = btrim(p_slug)
    AND qo.status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = v_offer.practice_id
    AND p.status = 'published'
    AND p.deleted_at IS NULL
    AND p.catalog_visibility = 'listed';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'offer_id', m.offer_id,
        'image_path', m.image_path,
        'format_label', m.format_label,
        'sort_order', m.sort_order,
        'created_at', m.created_at,
        'updated_at', m.updated_at
      )
      ORDER BY m.sort_order
    ),
    '[]'::jsonb
  )
  INTO v_materials
  FROM public.quick_offer_materials AS m
  WHERE m.offer_id = v_offer.id;

  RETURN jsonb_build_object(
    'id', v_offer.id,
    'author_id', v_offer.author_id,
    'practice_id', v_offer.practice_id,
    'title', v_offer.title,
    'slug', v_offer.slug,
    'hero_image_path', v_offer.hero_image_path,
    'short_description', v_offer.short_description,
    'promo_price', v_offer.promo_price,
    'cta_text', v_offer.cta_text,
    'timer_duration_seconds', v_offer.timer_duration_seconds,
    'status', v_offer.status,
    'template_key', v_offer.template_key,
    'mid_cta_after_count', v_offer.mid_cta_after_count,
    'published_at', v_offer.published_at,
    'created_at', v_offer.created_at,
    'updated_at', v_offer.updated_at,
    'practices', jsonb_build_object(
      'id', v_practice.id,
      'slug', v_practice.slug,
      'title', v_practice.title,
      'status', v_practice.status,
      'is_free', v_practice.is_free,
      'price', v_practice.price,
      'author_id', v_practice.author_id
    ),
    'quick_offer_materials', v_materials
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_quick_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_quick_offer(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_quick_offer(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_quick_offer(text) TO service_role;

COMMENT ON FUNCTION public.get_public_quick_offer(text) IS
  'audiolad:quick-offer-public:v2; published listed products only; selected_users/unlisted are not public discovery';

DROP POLICY IF EXISTS "Public can read author featured products"
  ON public.author_featured_products;
CREATE POLICY "Public can read author featured products"
  ON public.author_featured_products
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      WHERE p.id = author_featured_products.product_id
        AND p.deleted_at IS NULL
        AND p.status = 'published'
        AND p.catalog_visibility = 'listed'
    )
    OR (
      auth.uid() IS NOT NULL
      AND public.has_platform_permission(auth.uid(), 'admin_panel.access')
    )
  );

COMMIT;
