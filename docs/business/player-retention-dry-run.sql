-- Read-only dry-run for business_player_listening_history retention (task f381f92b).
-- Never executed by deploy. Run by hand only on an authorized environment.
-- Same cutoff and predicate as cleanup_business_player_listening_history(p_retention_days => 400):
-- rows strictly older than 400 × 24 hours by last_confirmed_at. No locks, no writes.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT statement_timestamp() - 400 * 24 * interval '1 hour' AS cutoff, count(*) AS candidates, min(h.last_confirmed_at) AS oldest_last_confirmed_at, least(count(*), 500 * 20) AS max_deleted_by_one_run FROM public.business_player_listening_history h WHERE h.last_confirmed_at < statement_timestamp() - 400 * 24 * interval '1 hour';
EXPLAIN SELECT count(*) FROM public.business_player_listening_history h WHERE h.last_confirmed_at < statement_timestamp() - 400 * 24 * interval '1 hour';
ROLLBACK;
