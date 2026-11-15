-- Closed Business albums. Existing albums retain their current access semantics.
BEGIN;

ALTER TABLE public.practices
  ADD COLUMN business_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.practices
  ADD CONSTRAINT practices_business_only_visibility_check
  CHECK (business_only = false OR
    (catalog_visibility = 'selected_users' AND is_catalog_listed = false));

COMMENT ON COLUMN public.practices.business_only IS
  'Только Бизнес – необратимый закрытый режим нового альбома. Only author members and platform admins may read it; no listener grants or allowlist. Business playback is gated separately.';

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

-- Public practices require listed/unlisted, impossible for Business by CHECK.
-- Audio metadata/gallery/topics/classical links inherit the updated read helper.
-- Author-member policies stay unchanged. practice_tracks does not exist;
-- music_audio_assets has RLS enabled and no client SELECT policies.
COMMIT;
