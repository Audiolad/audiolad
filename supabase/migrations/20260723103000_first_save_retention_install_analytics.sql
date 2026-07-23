BEGIN;

-- Platform analytics allowlist — first-save retention install click
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
    'first_save_retention_prompt_dismissed'
  );
$$;

DO $$
BEGIN
  IF public.is_platform_analytics_event('first_save_retention_prompt_install_clicked') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: first_save_retention_prompt_install_clicked not allowlisted';
  END IF;
END $$;

COMMIT;
