BEGIN;

CREATE OR REPLACE FUNCTION public.admin_operational_overview_snapshot(
  p_snapshot_now timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH time_range AS (
    SELECT
      p_snapshot_now AS snapshot_now,
      p_snapshot_now - interval '7 days' AS seven_days_ago,
      p_snapshot_now - interval '30 days' AS thirty_days_ago
  ),
  active_owner_members AS (
    SELECT am.user_id, am.author_id
    FROM public.author_members AS am
    INNER JOIN public.authors AS a ON a.id = am.author_id
    WHERE am.role = 'owner'
      AND a.access_status NOT IN ('suspended', 'terminated')
  ),
  successful_payments AS (
    SELECT p.order_id, p.amount_minor
    FROM public.payments AS p
    WHERE p.status = 'succeeded'
      AND p.is_test = false
  ),
  confirmed_refunds AS (
    SELECT r.amount_minor
    FROM public.payment_refunds AS r
    WHERE r.status = 'succeeded'
      AND r.is_test = false
      AND r.confirmed_at IS NOT NULL
  ),
  published_practice_products AS (
    SELECT p.id
    FROM public.practices AS p
    WHERE p.status = 'published'
      AND p.product_kind = 'practice'
      AND p.deleted_at IS NULL
  ),
  published_programs AS (
    SELECT p.id
    FROM published_practice_products AS p
    INNER JOIN public.audio_items AS ai ON ai.practice_id = p.id
    WHERE ai.status = 'published'
    GROUP BY p.id
    HAVING count(DISTINCT ai.id) >= 2
  )
  SELECT jsonb_build_object(
    'users_total', (SELECT count(*)::integer FROM public.profiles),
    'users_7d', (
      SELECT count(*)::integer
      FROM public.profiles AS p, time_range AS t
      WHERE p.created_at >= t.seven_days_ago
        AND p.created_at < t.snapshot_now
    ),
    'users_30d', (
      SELECT count(*)::integer
      FROM public.profiles AS p, time_range AS t
      WHERE p.created_at >= t.thirty_days_ago
        AND p.created_at < t.snapshot_now
    ),
    'authors_total', (
      SELECT count(DISTINCT user_id)::integer FROM active_owner_members
    ),
    'author_workspaces_total', (
      SELECT count(DISTINCT author_id)::integer FROM active_owner_members
    ),
    'applications_submitted_7d', (
      SELECT count(*)::integer
      FROM public.author_applications AS aa, time_range AS t
      WHERE aa.submitted_at >= t.seven_days_ago
        AND aa.submitted_at < t.snapshot_now
    ),
    'applications_awaiting_review', (
      SELECT count(*)::integer
      FROM public.author_applications
      WHERE status = 'submitted'
    ),
    'applications_total', (
      SELECT count(*)::integer FROM public.author_applications
    ),
    'practices_published', (
      SELECT count(*)::integer FROM published_practice_products
    ),
    'programs_published', (
      SELECT count(*)::integer FROM published_programs
    ),
    'playback_starts', (
      SELECT count(*)::integer
      FROM public.analytics_events
      WHERE event_name = 'audio_play_started'
        AND is_bot = false
        AND is_staff = false
        AND is_test = false
    ),
    'completions', (
      SELECT count(*)::integer
      FROM public.analytics_events
      WHERE event_name = 'audio_completed'
        AND is_bot = false
        AND is_staff = false
        AND is_test = false
    ),
    'paid_orders', (
      SELECT count(DISTINCT order_id)::integer FROM successful_payments
    ),
    'revenue_minor', (
      (SELECT coalesce(sum(amount_minor), 0)::bigint FROM successful_payments)
      - (SELECT coalesce(sum(amount_minor), 0)::bigint FROM confirmed_refunds)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_operational_overview_snapshot(timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_operational_overview_snapshot(timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_operational_overview_snapshot(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.admin_operational_overview_snapshot(timestamptz) IS
  'Read-only canonical all-time operational overview. One supplied snapshot bounds rolling user/application windows; SQL aggregation avoids PostgREST row limits.';

COMMIT;
