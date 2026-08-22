-- GEO/AEO Stage 1 Block 3: add reliable AI acquisition class.
-- Does not treat google.com / bing.com / yandex.ru as AI.

ALTER TABLE public.analytics_first_touches
  DROP CONSTRAINT IF EXISTS analytics_first_touches_source_class_check;

ALTER TABLE public.analytics_first_touches
  ADD CONSTRAINT analytics_first_touches_source_class_check
  CHECK (
    source_class IS NULL
    OR source_class IN (
      'utm',
      'organic_search',
      'social',
      'messenger',
      'referral',
      'direct_or_unknown',
      'internal',
      'unknown',
      'ai'
    )
  );

CREATE OR REPLACE FUNCTION public.classify_acquisition_source_class(
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_referrer_domain text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_src text := lower(coalesce(public.sanitize_analytics_utm_value(p_utm_source), ''));
  v_med text := lower(coalesce(public.sanitize_analytics_utm_value(p_utm_medium), ''));
  v_camp text := lower(coalesce(public.sanitize_analytics_utm_value(p_utm_campaign), ''));
  v_ref text := lower(coalesce(public.sanitize_analytics_utm_value(p_referrer_domain), ''));
  v_host text;
BEGIN
  IF v_ref IN ('audiolad.ru', 'www.audiolad.ru', 'localhost', '127.0.0.1') THEN
    v_ref := '';
  END IF;

  v_host := regexp_replace(v_ref, '^www\.', '');

  IF v_src <> '' OR v_med <> '' OR v_camp <> '' THEN
    IF v_src IN (
      'chatgpt',
      'chatgpt.com',
      'chat-gpt',
      'perplexity',
      'perplexity.ai',
      'copilot',
      'microsoft-copilot',
      'gemini',
      'google-gemini',
      'bard',
      'alice',
      'alisa',
      'yandex-alice',
      'yandex-alisa'
    ) THEN
      RETURN 'ai';
    END IF;

    IF v_src IN ('telegram', 'tg', 'max', 'vk', 'whatsapp', 'viber')
       OR v_med IN ('messenger', 'messaging', 'messaging_bot', 'social_messenger')
       OR v_src LIKE 'bothelp%'
       OR v_med LIKE '%messenger%' THEN
      RETURN 'messenger';
    END IF;
    IF v_med IN ('social', 'social-network', 'social_media')
       OR v_src IN ('facebook', 'instagram', 'youtube', 'tiktok', 'ok', 'odnoklassniki') THEN
      RETURN 'social';
    END IF;
    RETURN 'utm';
  END IF;

  IF v_ref = '' THEN
    RETURN 'direct_or_unknown';
  END IF;

  IF v_host IN (
        'chatgpt.com',
        'chat.openai.com',
        'perplexity.ai',
        'copilot.microsoft.com',
        'gemini.google.com',
        'bard.google.com',
        'alice.yandex.ru',
        'alice.yandex.com'
      )
      OR v_host LIKE '%.chatgpt.com'
      OR v_host LIKE '%.chat.openai.com'
      OR v_host LIKE '%.perplexity.ai'
      OR v_host LIKE '%.copilot.microsoft.com'
      OR v_host LIKE '%.gemini.google.com'
      OR v_host LIKE '%.bard.google.com'
      OR v_host LIKE '%.alice.yandex.ru'
      OR v_host LIKE '%.alice.yandex.com' THEN
    RETURN 'ai';
  END IF;

  IF v_ref LIKE '%google.%'
     OR v_ref LIKE '%yandex.%'
     OR v_ref LIKE '%bing.%'
     OR v_ref LIKE '%duckduckgo.%'
     OR v_ref = 'go.mail.ru'
     OR v_ref LIKE '%search.yahoo.%' THEN
    RETURN 'organic_search';
  END IF;

  IF v_ref LIKE '%t.me%'
     OR v_ref LIKE '%telegram.%'
     OR v_ref LIKE '%max.ru%'
     OR v_ref LIKE '%oneme.ru%'
     OR v_ref LIKE '%whatsapp.%'
     OR v_ref LIKE '%wa.me%' THEN
    RETURN 'messenger';
  END IF;

  IF v_ref LIKE '%vk.com%'
     OR v_ref LIKE '%vk.ru%'
     OR v_ref LIKE '%facebook.%'
     OR v_ref LIKE '%instagram.%'
     OR v_ref LIKE '%youtube.%'
     OR v_ref LIKE '%tiktok.%'
     OR v_ref LIKE '%ok.ru%' THEN
    RETURN 'social';
  END IF;

  RETURN 'referral';
END;
$$;

COMMENT ON FUNCTION public.classify_acquisition_source_class(text, text, text, text) IS
  'audiolad:p322 + geo-aeo-block3; centralized acquisition source_class; AI hosts before organic';
