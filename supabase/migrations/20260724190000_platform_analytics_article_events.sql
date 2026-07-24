-- SEO article analytics events for /articles/{slug}
-- NOT applied in this task – apply only after explicit deploy approval.
-- Extends is_platform_analytics_event allowlist (keeps prior topic hub events).

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
    'topic_product_clicked',
    'article_view',
    'article_audio_play',
    'article_practice_open',
    'article_practice_save',
    'article_topic_click',
    'article_related_practice_click',
    'article_toc_click',
    'article_final_audio_click'
  );
$$;

DO $$
BEGIN
  IF public.is_platform_analytics_event('article_view') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: article_view not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('article_audio_play') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: article_audio_play not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('article_final_audio_click') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: article_final_audio_click not allowlisted';
  END IF;
END
$$;

COMMENT ON FUNCTION public.is_platform_analytics_event IS
  'audiolad:platform-analytics:v1; allowlisted platform event names including SEO articles';

COMMIT;
