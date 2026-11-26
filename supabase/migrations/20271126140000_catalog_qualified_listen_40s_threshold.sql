BEGIN;

-- Public catalog popularity only:
--   - qualified listen threshold 60s strict -> 40s inclusive
--   - consumer playback only (usage_kind = consumer); business venue facts excluded
-- Re-aggregates from playback_usage_facts on each RPC call (no materialized cache, no DELETE).
-- Does not change author stats, rating eligibility, or financial accruals (business facts retained).

CREATE OR REPLACE FUNCTION public.catalog_practice_qualified_listen_counts(
  p_practice_ids uuid[]
)
RETURNS TABLE (
  practice_id uuid,
  qualified_listen_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH settings AS (
    SELECT listening_time_valid_from
    FROM public.playback_usage_settings
    LIMIT 1
  ),
  session_totals AS (
    SELECT
      f.practice_id,
      COALESCE(f.session_id::text, f.listening_key) AS playback_session_bucket,
      sum(f.listened_ms)::bigint AS session_ms
    FROM public.playback_usage_facts AS f
    CROSS JOIN settings AS s
    WHERE f.listened_ms > 0
      AND f.usage_kind = 'consumer'
      AND f.practice_id = ANY (p_practice_ids)
      AND f.occurred_at >= s.listening_time_valid_from
    GROUP BY f.practice_id, COALESCE(f.session_id::text, f.listening_key)
  )
  SELECT
    st.practice_id,
    count(*) FILTER (WHERE st.session_ms >= 40000)::bigint AS qualified_listen_count
  FROM session_totals AS st
  GROUP BY st.practice_id;
$$;

COMMENT ON FUNCTION public.catalog_practice_qualified_listen_counts(uuid[]) IS
  'audiolad:catalog-listing; per-practice qualified sessions: sum(listened_ms) >= 40000 per (practice_id, coalesce(session_id, listening_key)), usage_kind=consumer only, since listening_time_valid_from. Excludes closed catalog АудиоЛад Бизнес venue playback. Album tracks share session_id; radio/autoplay credits each consumer practice separately. Public catalog only; service_role.';

REVOKE ALL ON FUNCTION public.catalog_practice_qualified_listen_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_practice_qualified_listen_counts(uuid[]) TO service_role;

COMMIT;