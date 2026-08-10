BEGIN;

-- Keep the database event allowlist aligned with the client event registry.
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
    'help_article_cta_click'
  );
$$;

COMMENT ON FUNCTION public.is_platform_analytics_event IS
  'audiolad:platform-analytics:v1; allowlisted platform event names including product promo clicks';

DO $$
BEGIN
  IF public.is_platform_analytics_event('product_promo_clicked') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: product_promo_clicked not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('unknown_test_event') IS NOT FALSE THEN
    RAISE EXCEPTION 'Post-check failed: unknown event unexpectedly allowlisted';
  END IF;
END
$$;

COMMIT;
