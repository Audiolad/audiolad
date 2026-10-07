BEGIN;

-- Production release of 20261222120000 created admin_analytics_listening_time_windows
-- and the dashboard called it once for all four rolling cards. That single
-- statement scans up to 60 days. A cancel blanks every card, including the
-- previous week that already had a sum. Rolling cards are exact 7-day and
-- 30-day intervals; they only need SUM(listened_ms). Those intervals skip
-- admin_analytics_p2_window_metrics. Calendar periods are not exact intervals,
-- so they still request denominators. If that scan is canceled, the sum already
-- stored is returned and the denominators stay JSON null, not zero.
-- Same argument list. No new grant. No table rewrite. No index.

CREATE OR REPLACE FUNCTION public.admin_analytics_listening_time(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valid_from timestamptz;
  v_effective_from timestamptz;
  v_unmeasured boolean := false;
  v_partial boolean := false;
  v_rolling_total boolean := false;
  v_listened bigint := 0;
  v_listeners integer := NULL;
  v_starts integer := NULL;
  v_metrics jsonb;
BEGIN
  SELECT s.listening_time_valid_from
  INTO v_valid_from
  FROM public.playback_usage_settings AS s
  WHERE s.singleton;

  v_unmeasured := p_to IS NOT NULL AND v_valid_from IS NOT NULL AND p_to <= v_valid_from;
  v_partial := NOT v_unmeasured
    AND v_valid_from IS NOT NULL
    AND (p_from IS NULL OR p_from < v_valid_from);
  v_rolling_total := p_from IS NOT NULL
    AND p_to IS NOT NULL
    AND (
      (p_to - p_from) = interval '7 days'
      OR (p_to - p_from) = interval '30 days'
    );

  IF v_valid_from IS NULL THEN
    v_effective_from := p_from;
  ELSIF p_from IS NULL OR p_from < v_valid_from THEN
    v_effective_from := v_valid_from;
  ELSE
    v_effective_from := p_from;
  END IF;

  IF NOT v_unmeasured THEN
    SELECT coalesce(sum(f.listened_ms), 0)::bigint
    INTO v_listened
    FROM public.playback_usage_admin_facts(
      v_effective_from,
      p_to,
      p_include_test,
      p_author_id,
      p_practice_id,
      p_utm_source,
      p_device_type
    ) AS f;

    IF NOT v_rolling_total THEN
      BEGIN
        v_metrics := public.admin_analytics_p2_window_metrics(
          v_effective_from,
          p_to,
          coalesce(p_include_test, false),
          p_author_id,
          p_practice_id,
          p_utm_source,
          p_device_type
        );
        v_listeners := coalesce((v_metrics ->> 'listeners')::integer, 0);
        v_starts := coalesce((v_metrics ->> 'play_starts')::integer, 0);
      EXCEPTION
        WHEN query_canceled THEN
          PERFORM set_config('statement_timeout', '0', true);
          v_listeners := NULL;
          v_starts := NULL;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'listened_ms', CASE WHEN v_unmeasured THEN NULL ELSE v_listened END,
    'measured_listeners', CASE
      WHEN v_unmeasured OR v_listeners IS NULL THEN NULL
      ELSE v_listeners
    END,
    'measured_play_starts', CASE
      WHEN v_unmeasured OR v_starts IS NULL THEN NULL
      ELSE v_starts
    END,
    'effective_from', CASE WHEN v_unmeasured THEN NULL ELSE v_effective_from END,
    'valid_from', v_valid_from,
    'partial', v_partial,
    'unmeasured', v_unmeasured
  );
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_listening_time(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; SUM(listened_ms) plus measured-window listeners and audio_play_started for averages. Exact 7-day and 30-day intervals skip denominators. A canceled denominator scan keeps the sum and returns JSON null listeners, not zero.';

NOTIFY pgrst, 'reload schema';

COMMIT;
