-- Deferred publication for practices.
-- scheduled_publish_at is timestamptz (UTC). Moscow time is UI-only.
-- published_at stays the actual first public go-live. A future schedule must
-- not stamp it. Visibility is computed; no worker flips status.

BEGIN;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz NULL;

COMMENT ON COLUMN public.practices.scheduled_publish_at IS
  'UTC instant of the first public go-live chosen by the author (Moscow time in the UI). NULL means publish as soon as moderation approves. Does not replace published_at.';

COMMENT ON COLUMN public.practices.published_at IS
  'Actual first public go-live. NULL until the product is publicly available. Not a schedule.';

CREATE OR REPLACE FUNCTION public.practice_is_publicly_available(
  p_status text,
  p_scheduled_publish_at timestamptz,
  p_published_at timestamptz,
  p_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_status = 'published'
    AND (
      (p_published_at IS NOT NULL AND p_published_at <= p_at)
      OR p_scheduled_publish_at IS NULL
      OR p_scheduled_publish_at <= p_at
    );
$$;

COMMENT ON FUNCTION public.practice_is_publicly_available(text, timestamptz, timestamptz, timestamptz) IS
  'Computed public availability: moderation-published AND schedule reached, or already gone live via published_at. A future schedule cannot hide a product that already went live.';

REVOKE ALL ON FUNCTION public.practice_is_publicly_available(text, timestamptz, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_is_publicly_available(text, timestamptz, timestamptz, timestamptz) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_practice_scheduled_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.scheduled_publish_at IS NOT NULL
     AND NEW.scheduled_publish_at > now()
     AND NEW.scheduled_publish_at IS DISTINCT FROM OLD.scheduled_publish_at
     AND (
       (OLD.published_at IS NOT NULL AND OLD.published_at <= now())
       OR (
         public.practice_is_publicly_available(
           OLD.status,
           OLD.scheduled_publish_at,
           OLD.published_at
         )
         AND (
           OLD.scheduled_publish_at IS NULL
           OR OLD.scheduled_publish_at <= now()
         )
       )
     )
  THEN
    RAISE EXCEPTION 'scheduled_publish_after_release'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'published'
     AND NEW.scheduled_publish_at IS NOT NULL
     AND NEW.scheduled_publish_at > now()
     AND NOT (
       TG_OP = 'UPDATE'
       AND OLD.published_at IS NOT NULL
       AND OLD.published_at <= now()
     )
  THEN
    NEW.published_at := CASE
      WHEN TG_OP = 'UPDATE' THEN OLD.published_at
      ELSE NULL
    END;
  ELSIF NEW.status = 'published'
     AND (NEW.scheduled_publish_at IS NULL OR NEW.scheduled_publish_at <= now())
     AND (NEW.published_at IS NULL OR NEW.published_at > now())
  THEN
    NEW.published_at := CASE
      WHEN TG_OP = 'UPDATE'
           AND OLD.status = 'published'
           AND OLD.scheduled_publish_at IS NOT NULL
           AND OLD.scheduled_publish_at <= now()
        THEN OLD.scheduled_publish_at
      ELSE now()
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_practice_scheduled_publication_trigger ON public.practices;
CREATE TRIGGER guard_practice_scheduled_publication_trigger
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_practice_scheduled_publication();

CREATE INDEX IF NOT EXISTS practices_scheduled_publish_at_idx
  ON public.practices (scheduled_publish_at)
  WHERE scheduled_publish_at IS NOT NULL;

-- Public read: same catalog modes, plus the schedule gate.
DROP POLICY IF EXISTS "Public can read published practices" ON public.practices;
CREATE POLICY "Public can read published practices"
  ON public.practices
  FOR SELECT
  TO public
  USING (
    public.practice_is_publicly_available(
      status,
      scheduled_publish_at,
      published_at
    )
    AND deleted_at IS NULL
    AND catalog_visibility IN ('listed', 'unlisted')
  );

DROP POLICY IF EXISTS "Selected users can read allowlisted practices" ON public.practices;
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
          AND v.user_id = auth.uid()
      )
      OR public.is_practice_author_member(practices.id, auth.uid())
      OR public.has_platform_permission(auth.uid(), 'admin_panel.access')
    )
  );

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
  );
$$;

REVOKE ALL ON FUNCTION public.can_current_viewer_read_practice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_current_viewer_read_practice(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_current_viewer_read_practice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_current_viewer_read_practice(uuid) TO service_role;

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

REVOKE ALL ON FUNCTION public.viewer_can_commercially_access_practice(public.practices, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.viewer_can_commercially_access_practice(public.practices, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.viewer_can_commercially_access_practice(public.practices, uuid) FROM authenticated;

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
      AND p.deleted_at IS NULL
      AND p.catalog_visibility = 'listed'
      AND p.is_catalog_listed IS TRUE
      AND public.practice_is_publicly_available(
        p.status,
        p.scheduled_publish_at,
        p.published_at
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_public_listed_practice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_listed_practice(uuid) TO anon, authenticated, service_role;

COMMIT;
