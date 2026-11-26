BEGIN;

-- Public catalog popularity: count listening sessions with strictly > 60s of
-- server-accepted MEDIA-TIME per practice_id + listening_key.
-- Does not alter author_stats_listening or playback_usage heartbeat logic.

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
      AND f.practice_id = ANY (p_practice_ids)
      AND f.occurred_at >= s.listening_time_valid_from
    GROUP BY f.practice_id, COALESCE(f.session_id::text, f.listening_key)
  )
  SELECT
    st.practice_id,
    count(*) FILTER (WHERE st.session_ms > 60000)::bigint AS qualified_listen_count
  FROM session_totals AS st
  GROUP BY st.practice_id;
$$;

COMMENT ON FUNCTION public.catalog_practice_qualified_listen_counts(uuid[]) IS
  'audiolad:catalog-listing; per-practice qualified sessions: sum(listened_ms) > 60000 per (practice_id, coalesce(session_id, listening_key)) since listening_time_valid_from. Album tracks share session_id; radio/autoplay credits each practice separately. Public catalog only; service_role.';

REVOKE ALL ON FUNCTION public.catalog_practice_qualified_listen_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_practice_qualified_listen_counts(uuid[]) TO service_role;

COMMIT;