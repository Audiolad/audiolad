BEGIN;

-- A guest access grant is deliberately a project-session reference, never a
-- user entitlement. Existing author principal rows remain unchanged.
ALTER TABLE public.studio_project_assets
  ADD COLUMN IF NOT EXISTS catalog_guest_session_id uuid NULL
    REFERENCES public.studio_guest_sessions (id) ON DELETE SET NULL;

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT IF EXISTS studio_project_assets_catalog_access_principal_check;
ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_catalog_access_principal_check CHECK (
    source_type = 'catalog'
    OR (catalog_access_user_id IS NULL AND catalog_guest_session_id IS NULL)
  );

COMMENT ON COLUMN public.studio_project_assets.catalog_guest_session_id IS
  'Guest session that owns a globally-free Studio catalog reference. Never a user entitlement; must match the owning guest project.';

CREATE OR REPLACE FUNCTION public.is_globally_free_studio_music(
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
      AND p.status = 'published'
      AND (p.product_kind = 'music' OR p.publication_class = 'release')
      AND p.music_usage_permission = 'platform_reuse_allowed'
      AND p.catalog_visibility = 'listed'
      AND (
        p.studio_music_pricing_mode = 'free'
        OR (
          p.studio_music_pricing_mode IS NULL
          AND (p.is_free = true OR p.price IS NULL OR p.price <= 0)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_globally_free_studio_music(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_globally_free_studio_music(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.attach_studio_catalog_project_asset(
  p_project_id uuid,
  p_user_id uuid,
  p_practice_id uuid,
  p_audio_item_id uuid,
  p_original_name text,
  p_mime_type text,
  p_duration_seconds numeric
)
RETURNS public.studio_project_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.studio_projects;
  v_asset public.studio_project_assets;
  v_item public.audio_items;
  v_guest_session_id uuid;
BEGIN
  IF p_project_id IS NULL OR p_practice_id IS NULL OR p_audio_item_id IS NULL
    OR p_original_name IS NULL OR btrim(p_original_name) = ''
    OR p_mime_type IS NULL OR btrim(p_mime_type) = ''
    OR p_duration_seconds IS NULL OR p_duration_seconds <= 0
    OR p_duration_seconds > 10800
  THEN RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_project FROM public.studio_projects
  WHERE id = p_project_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_item FROM public.audio_items WHERE id = p_audio_item_id;
  IF NOT FOUND OR v_item.practice_id IS DISTINCT FROM p_practice_id THEN
    RAISE EXCEPTION 'invalid_catalog_audio_item' USING ERRCODE = '22023';
  END IF;

  IF v_project.author_id IS NOT NULL THEN
    IF p_user_id IS NULL OR NOT public.can_use_music_in_studio(p_user_id, p_practice_id) THEN
      RAISE EXCEPTION 'catalog_music_forbidden' USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_project.guest_session_id IS NOT NULL THEN
    IF p_user_id IS NOT NULL OR NOT public.is_globally_free_studio_music(p_practice_id) THEN
      RAISE EXCEPTION 'catalog_music_forbidden' USING ERRCODE = 'P0001';
    END IF;
    v_guest_session_id := v_project.guest_session_id;
  ELSE
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_asset FROM public.studio_project_assets
  WHERE project_id = p_project_id AND source_type = 'catalog'
    AND catalog_practice_id = p_practice_id AND catalog_audio_item_id = p_audio_item_id
    AND deleted_at IS NULL FOR UPDATE;
  IF FOUND THEN RETURN v_asset; END IF;

  INSERT INTO public.studio_project_assets (
    id, project_id, source_id, storage_path, original_name, mime_type, size_bytes,
    duration_seconds, source_type, upload_state, upload_state_changed_at,
    catalog_practice_id, catalog_audio_item_id, catalog_access_user_id,
    catalog_guest_session_id
  ) VALUES (
    gen_random_uuid(), p_project_id, NULL, NULL, p_original_name, p_mime_type, 0,
    p_duration_seconds, 'catalog', 'ready', now(), p_practice_id, p_audio_item_id,
    p_user_id, v_guest_session_id
  ) RETURNING * INTO v_asset;
  RETURN v_asset;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_asset FROM public.studio_project_assets
  WHERE project_id = p_project_id AND source_type = 'catalog'
    AND catalog_practice_id = p_practice_id AND catalog_audio_item_id = p_audio_item_id
    AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE; END IF;
  RETURN v_asset;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_studio_catalog_project_asset(uuid, uuid, uuid, uuid, text, text, numeric) TO service_role;

COMMIT;
