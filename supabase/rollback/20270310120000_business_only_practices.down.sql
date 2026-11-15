-- Manual rollback: removes the Business boundary. Review flagged rows before applying.
BEGIN;

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

-- Restore from 20261210120000_practice_scheduled_publication.sql
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
          AND v.user_id = auth.uid()
      )
      OR public.is_practice_author_member(practices.id, auth.uid())
      OR public.has_platform_permission(auth.uid(), 'admin_panel.access')
    )
  );

-- Restore from 20260731180000_practice_moderation_mvp_schema.sql
DROP POLICY "Entitled users can read entitled practices" ON public.practices;
CREATE POLICY "Entitled users can read entitled practices"
  ON public.practices
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_practices AS up
      WHERE up.practice_id = practices.id
        AND up.user_id = auth.uid()
        AND (up.expires_at IS NULL OR up.expires_at > now())
    )
  );

-- Restore from 20260714180000_unified_audio_product_foundation.sql
DROP POLICY "Entitled users can read audio items" ON public.audio_items;
CREATE POLICY "Entitled users can read audio items"
      ON public.audio_items
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
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

-- Restore from 20260711071529_create_private_practice_audio_bucket.sql
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
        AND up.practice_id::text = split_part(name, '/', 2)
        AND (
          up.expires_at IS NULL
          OR up.expires_at > now()
        )
    )
  );

DROP TRIGGER reject_business_only_visibility_user_trigger ON public.practice_visibility_users;
DROP TRIGGER reject_business_only_user_practice_trigger ON public.user_practices;
DROP TRIGGER guard_practice_business_only_trigger ON public.practices;
DROP FUNCTION public.reject_business_only_listener_access();
DROP FUNCTION public.guard_practice_business_only();
DROP FUNCTION public.practice_is_business_only(uuid);
ALTER TABLE public.practices DROP CONSTRAINT practices_business_only_visibility_check;
ALTER TABLE public.practices DROP COLUMN business_only;
COMMIT;
