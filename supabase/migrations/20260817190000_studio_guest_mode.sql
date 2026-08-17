BEGIN;

CREATE TABLE public.studio_guest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  free_render_consumed_at timestamptz NULL,
  free_render_project_id uuid NULL,
  free_render_job_id uuid NULL,
  CONSTRAINT studio_guest_sessions_token_hash_len_check
    CHECK (char_length(token_hash) = 64)
);

CREATE INDEX studio_guest_sessions_expires_at_idx
  ON public.studio_guest_sessions (expires_at);

ALTER TABLE public.studio_guest_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_projects
  ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE public.studio_projects
  ADD COLUMN guest_session_id uuid NULL
    REFERENCES public.studio_guest_sessions (id) ON DELETE RESTRICT;

ALTER TABLE public.studio_projects
  ADD CONSTRAINT studio_projects_owner_xor_check CHECK (
    (author_id IS NOT NULL AND guest_session_id IS NULL)
    OR (author_id IS NULL AND guest_session_id IS NOT NULL)
  );

CREATE INDEX studio_projects_guest_active_updated_idx
  ON public.studio_projects (guest_session_id, updated_at DESC)
  WHERE status = 'active' AND guest_session_id IS NOT NULL;

ALTER TABLE public.studio_render_jobs
  ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE public.studio_render_jobs
  ADD COLUMN guest_session_id uuid NULL
    REFERENCES public.studio_guest_sessions (id) ON DELETE RESTRICT;

ALTER TABLE public.studio_render_jobs
  ADD CONSTRAINT studio_render_jobs_owner_xor_check CHECK (
    (author_id IS NOT NULL AND guest_session_id IS NULL)
    OR (author_id IS NULL AND guest_session_id IS NOT NULL)
  );

CREATE UNIQUE INDEX studio_render_jobs_guest_active_unique
  ON public.studio_render_jobs (guest_session_id)
  WHERE guest_session_id IS NOT NULL AND status IN ('queued', 'processing');

ALTER TABLE public.studio_project_assets
  DROP CONSTRAINT studio_project_assets_path_check;

ALTER TABLE public.studio_project_assets
  ADD CONSTRAINT studio_project_assets_path_check CHECK (
    storage_path ~ '^studio/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$'
    OR storage_path ~ '^studio/guest/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$'
  );

CREATE OR REPLACE FUNCTION public.studio_reserve_project_asset(
  p_project_id uuid,
  p_asset_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_source_type text,
  p_duration_seconds numeric DEFAULT NULL
)
RETURNS public.studio_project_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.studio_projects;
  v_asset public.studio_project_assets;
  v_active_size bigint;
  v_path_ok boolean := false;
BEGIN
  IF p_project_id IS NULL OR p_asset_id IS NULL
    OR p_storage_path IS NULL OR p_original_name IS NULL OR p_mime_type IS NULL
    OR p_size_bytes IS NULL OR p_source_type IS NULL THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_project
  FROM public.studio_projects
  WHERE id = p_project_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_size_bytes <= 0 OR p_size_bytes > 209715200
    OR p_source_type NOT IN ('upload', 'recording')
    OR (p_duration_seconds IS NOT NULL AND p_duration_seconds < 0) THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;

  IF v_project.author_id IS NOT NULL THEN
    v_path_ok := p_storage_path ~ (
      '^studio/' || v_project.author_id::text || '/' || p_project_id::text
      || '/' || p_asset_id::text || '/[A-Za-z0-9._-]+$'
    );
  ELSIF v_project.guest_session_id IS NOT NULL THEN
    v_path_ok := p_storage_path ~ (
      '^studio/guest/' || v_project.guest_session_id::text || '/' || p_project_id::text
      || '/' || p_asset_id::text || '/[A-Za-z0-9._-]+$'
    );
  END IF;

  IF NOT v_path_ok THEN
    RAISE EXCEPTION 'invalid_asset' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(size_bytes), 0)
  INTO v_active_size
  FROM public.studio_project_assets
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  IF v_active_size + p_size_bytes > 786432000 THEN
    RAISE EXCEPTION 'project_asset_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.studio_project_assets (
    id, project_id, storage_path, original_name, mime_type, size_bytes,
    duration_seconds, source_type
  ) VALUES (
    p_asset_id, p_project_id, p_storage_path, p_original_name, p_mime_type,
    p_size_bytes, p_duration_seconds, p_source_type
  )
  RETURNING * INTO v_asset;

  RETURN v_asset;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_reserve_project_asset(
  uuid, uuid, text, text, text, bigint, text, numeric
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_reserve_project_asset(
  uuid, uuid, text, text, text, bigint, text, numeric
) TO service_role;

CREATE OR REPLACE FUNCTION public.is_platform_analytics_event(p_event_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(COALESCE(p_event_name, '')) IN (
    'page_view',
    'practice_view',
    'listen_page_view',
    'audio_play_started',
    'audio_progress_25',
    'audio_progress_50',
    'audio_progress_75',
    'audio_progress_90',
    'audio_completed',
    'signup_started',
    'signup_completed',
    'author_application_started',
    'author_application_submitted',
    'first_manual_library_save',
    'first_save_retention_prompt_shown',
    'first_save_retention_prompt_library_clicked',
    'first_save_retention_prompt_install_clicked',
    'first_save_retention_prompt_dismissed',
    'topic_page_viewed',
    'topic_product_clicked',
    'article_view',
    'article_audio_play',
    'article_practice_open',
    'article_practice_save',
    'article_topic_click',
    'article_related_practice_click',
    'article_toc_click',
    'article_final_audio_click',
    'buy_clicked',
    'product_promo_clicked',
    'author_page_view',
    'help_article_view',
    'help_search',
    'help_search_no_results',
    'help_support_open',
    'help_support_submit',
    'help_article_cta_click',
    'guest_studio_open',
    'guest_project_created',
    'guest_render_started',
    'guest_render_completed',
    'guest_mp3_downloaded',
    'guest_registration_gate_shown',
    'guest_auth_cta_clicked'
  );
$$;

COMMENT ON FUNCTION public.is_platform_analytics_event IS
  'audiolad:platform-analytics:v1; allowlisted platform event names including guest studio trial';

DO $$
BEGIN
  IF public.is_platform_analytics_event('guest_studio_open') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: guest_studio_open not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('guest_project_created') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: guest_project_created not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('guest_render_started') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: guest_render_started not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('guest_render_completed') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: guest_render_completed not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('guest_mp3_downloaded') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: guest_mp3_downloaded not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('guest_registration_gate_shown') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: guest_registration_gate_shown not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('guest_auth_cta_clicked') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: guest_auth_cta_clicked not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('product_promo_clicked') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: product_promo_clicked not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('unknown_test_event') IS NOT FALSE THEN
    RAISE EXCEPTION 'Post-check failed: unknown event unexpectedly allowlisted';
  END IF;
END
$$;

COMMIT;
