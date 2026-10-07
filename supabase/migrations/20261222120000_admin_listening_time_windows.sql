BEGIN;

-- Rolling week/month totals on /admin «Продукт» were each an
-- admin_analytics_listening_time call. That function also runs
-- admin_analytics_p2_window_metrics for averages the total cards do not show.
-- Four of those scans ran in parallel with the selected-period call. A
-- statement cancel on a current window discarded the SUM and the UI drew "—".
-- This function is the same MEDIA-TIME sum, once, over the bounded 60-day
-- span that contains all four windows. It does not scan analytics_events.
-- CREATE FUNCTION does not rewrite playback_usage_facts. No new index.

CREATE OR REPLACE FUNCTION public.admin_analytics_listening_time_windows(
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valid_from timestamptz;
  v_to timestamptz;
  v_week_from timestamptz;
  v_week_prev_from timestamptz;
  v_month_from timestamptz;
  v_month_prev_from timestamptz;
  v_scan_from timestamptz;
  v_week bigint := 0;
  v_week_prev bigint := 0;
  v_month bigint := 0;
  v_month_prev bigint := 0;
BEGIN
  SELECT s.listening_time_valid_from
  INTO v_valid_from
  FROM public.playback_usage_settings AS s
  WHERE s.singleton;

  v_to := coalesce(p_to, now());
  v_week_from := v_to - interval '7 days';
  v_week_prev_from := v_to - interval '14 days';
  v_month_from := v_to - interval '30 days';
  v_month_prev_from := v_to - interval '60 days';

  -- Facts cannot exist before activation. Skip the scan when every window
  -- ends at or before valid_from.
  IF v_valid_from IS NULL OR v_to > v_valid_from THEN
    v_scan_from := v_month_prev_from;
    IF v_valid_from IS NOT NULL AND v_valid_from > v_scan_from THEN
      v_scan_from := v_valid_from;
    END IF;

    SELECT
      coalesce(sum(f.listened_ms) FILTER (
        WHERE f.occurred_at >= v_week_from AND f.occurred_at < v_to
      ), 0),
      coalesce(sum(f.listened_ms) FILTER (
        WHERE f.occurred_at >= v_week_prev_from AND f.occurred_at < v_week_from
      ), 0),
      coalesce(sum(f.listened_ms) FILTER (
        WHERE f.occurred_at >= v_month_from AND f.occurred_at < v_to
      ), 0),
      coalesce(sum(f.listened_ms) FILTER (
        WHERE f.occurred_at >= v_month_prev_from AND f.occurred_at < v_month_from
      ), 0)
    INTO v_week, v_week_prev, v_month, v_month_prev
    FROM public.playback_usage_admin_facts(
      v_scan_from,
      v_to,
      coalesce(p_include_test, false),
      p_author_id,
      p_practice_id,
      p_utm_source,
      p_device_type
    ) AS f;
  END IF;

  RETURN jsonb_build_object(
    'valid_from', v_valid_from,
    'end', v_to,
    'week', jsonb_build_object(
      'from', v_week_from,
      'to', v_to,
      'unmeasured', v_valid_from IS NOT NULL AND v_to <= v_valid_from,
      'partial', v_valid_from IS NOT NULL AND v_to > v_valid_from AND v_week_from < v_valid_from,
      'listened_ms', CASE
        WHEN v_valid_from IS NOT NULL AND v_to <= v_valid_from THEN NULL
        ELSE v_week
      END
    ),
    'week_prev', jsonb_build_object(
      'from', v_week_prev_from,
      'to', v_week_from,
      'unmeasured', v_valid_from IS NOT NULL AND v_week_from <= v_valid_from,
      'partial', v_valid_from IS NOT NULL AND v_week_from > v_valid_from AND v_week_prev_from < v_valid_from,
      'listened_ms', CASE
        WHEN v_valid_from IS NOT NULL AND v_week_from <= v_valid_from THEN NULL
        ELSE v_week_prev
      END
    ),
    'month', jsonb_build_object(
      'from', v_month_from,
      'to', v_to,
      'unmeasured', v_valid_from IS NOT NULL AND v_to <= v_valid_from,
      'partial', v_valid_from IS NOT NULL AND v_to > v_valid_from AND v_month_from < v_valid_from,
      'listened_ms', CASE
        WHEN v_valid_from IS NOT NULL AND v_to <= v_valid_from THEN NULL
        ELSE v_month
      END
    ),
    'month_prev', jsonb_build_object(
      'from', v_month_prev_from,
      'to', v_month_from,
      'unmeasured', v_valid_from IS NOT NULL AND v_month_from <= v_valid_from,
      'partial', v_valid_from IS NOT NULL AND v_month_from > v_valid_from AND v_month_prev_from < v_valid_from,
      'listened_ms', CASE
        WHEN v_valid_from IS NOT NULL AND v_month_from <= v_valid_from THEN NULL
        ELSE v_month_prev
      END
    )
  );
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_listening_time_windows(
  timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; one SUM(listened_ms) for rolling 7/14/30/60-day windows ending at p_to. Same filters as admin_analytics_listening_time. No admin_analytics_p2_window_metrics. Null listened_ms when that window ends at or before listening_time_valid_from.';

REVOKE ALL ON FUNCTION public.admin_analytics_listening_time_windows(
  timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_analytics_listening_time_windows(
  timestamptz, boolean, uuid, uuid, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
