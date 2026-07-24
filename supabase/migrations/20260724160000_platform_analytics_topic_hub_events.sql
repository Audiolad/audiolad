-- Topic hub analytics events for /topics/{slug}
-- NOT applied in this task – apply only after explicit deploy approval.
-- Extends is_platform_analytics_event allowlist (keeps prior retention events).

BEGIN;

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
    'topic_product_clicked'
  );
$$;

DO $$
BEGIN
  IF public.is_platform_analytics_event('topic_page_viewed') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: topic_page_viewed not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('topic_product_clicked') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: topic_product_clicked not allowlisted';
  END IF;
END
$$;

COMMENT ON FUNCTION public.is_platform_analytics_event IS
  'audiolad:platform-analytics:v1; allowlisted platform event names including topic hubs';

COMMIT;
