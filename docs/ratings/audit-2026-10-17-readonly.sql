-- AudioLad ratings audit pack (task 612f9c76). READ-ONLY. AGGREGATES ONLY.
-- Run only with Sergey's explicit OK, by an operator with authorised prod access:
--   psql ... -v ON_ERROR_STOP=1 -v h_loop4="'<hmac of 127.0.0.1>'" -v h_loop6="'<hmac of ::ffff:127.0.0.1>'" -f this.sql
-- (h_loop* are computed in the app env with hmacRatingSignal("ip", ...); pass '' to skip S1b.)
-- Output never contains emails, names, user ids or HMAC values. Groups are labelled G1.., products P01..
-- Nothing here writes: the whole run is a READ ONLY transaction.

SET default_transaction_read_only = on;
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- R0. Re-verify screen numbers for all-time / 30d / 7d with the exact admin formulas.
WITH periods(label, p_from) AS (
  VALUES ('all', NULL::timestamptz), ('30d', now() - interval '30 days'), ('7d', now() - interval '7 days')
)
SELECT
  p.label,
  (SELECT count(*) FROM practice_ratings r WHERE r.excluded_at IS NULL AND (p.p_from IS NULL OR r.created_at >= p.p_from)) AS rating_pairs,
  (SELECT coalesce(sum(stars),0) FROM practice_ratings r WHERE r.excluded_at IS NULL AND (p.p_from IS NULL OR r.created_at >= p.p_from)) AS total_stars,
  (SELECT count(DISTINCT user_id) FROM practice_ratings r WHERE r.excluded_at IS NULL AND (p.p_from IS NULL OR r.created_at >= p.p_from)) AS unique_raters,
  (SELECT count(DISTINCT practice_id) FROM practice_ratings r WHERE r.excluded_at IS NULL AND (p.p_from IS NULL OR r.created_at >= p.p_from)) AS rated_products,
  (SELECT count(*) FROM practice_listen_stats s WHERE s.rating_eligible_at IS NOT NULL AND (p.p_from IS NULL OR s.rating_eligible_at >= p.p_from)) AS eligible_pairs,
  (SELECT count(DISTINCT user_id) FROM practice_listen_stats s WHERE s.rating_eligible_at IS NOT NULL AND (p.p_from IS NULL OR s.rating_eligible_at >= p.p_from)) AS eligible_accounts,
  (SELECT count(*) FROM practice_listen_stats s WHERE s.rating_eligible_at IS NOT NULL AND (p.p_from IS NULL OR s.rating_eligible_at >= p.p_from)
     AND EXISTS (SELECT 1 FROM practice_ratings r WHERE r.user_id = s.user_id AND r.practice_id = s.practice_id AND r.excluded_at IS NULL)) AS rated_eligible
FROM periods p;

-- R1. Integrity: every active rating must have an eligible pair; events vs rows.
SELECT
  (SELECT count(*) FROM practice_ratings r WHERE NOT EXISTS (
     SELECT 1 FROM practice_listen_stats s WHERE s.user_id = r.user_id AND s.practice_id = r.practice_id AND s.rating_eligible_at IS NOT NULL)) AS ratings_without_eligibility,
  (SELECT count(*) FROM practice_ratings WHERE excluded_at IS NOT NULL) AS excluded_rows,
  (SELECT count(*) FROM practice_rating_events WHERE old_stars IS NULL) AS first_events,
  (SELECT count(*) FROM practice_rating_events WHERE old_stars IS NOT NULL) AS change_events,
  (SELECT count(*) FROM practice_ratings WHERE updated_at > created_at) AS edited_pairs,
  (SELECT count(*) FROM practice_ratings WHERE vote_ip_hmac IS NULL) AS ip_signal_null,
  (SELECT count(*) FROM practice_ratings WHERE device_id_hmac IS NULL) AS device_signal_null;

-- R2. Stars distribution (current).
SELECT stars, count(*) AS pairs, round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM practice_ratings WHERE excluded_at IS NULL GROUP BY stars ORDER BY stars;

-- R3. Who rates: products per rater, test accounts, author-owners, account age at first rating.
WITH per AS (
  SELECT r.user_id, count(*) AS n, min(r.created_at) AS first_at
  FROM practice_ratings r WHERE r.excluded_at IS NULL GROUP BY r.user_id
)
SELECT
  width_bucket(n, ARRAY[1,2,5,10,20,50]) AS bucket_idx,
  CASE width_bucket(n, ARRAY[1,2,5,10,20,50]) WHEN 1 THEN '1' WHEN 2 THEN '2-4' WHEN 3 THEN '5-9' WHEN 4 THEN '10-19' WHEN 5 THEN '20-49' ELSE '50+' END AS products_per_rater,
  count(*) AS raters, sum(n) AS pairs
FROM per GROUP BY 1, 2 ORDER BY 1;

SELECT
  count(*) FILTER (WHERE t.user_id IS NOT NULL) AS pairs_from_test_accounts,
  count(*) FILTER (WHERE am.user_id IS NOT NULL) AS pairs_author_rates_own_product,
  count(*) FILTER (WHERE r.created_at - coalesce(u.created_at, pr.created_at) <= interval '1 hour') AS pairs_account_younger_1h,
  count(*) FILTER (WHERE r.created_at - coalesce(u.created_at, pr.created_at) <= interval '1 day') AS pairs_account_younger_1d,
  count(*) AS all_pairs
FROM practice_ratings r
JOIN practices p ON p.id = r.practice_id
LEFT JOIN analytics_test_accounts t ON t.user_id = r.user_id
LEFT JOIN author_members am ON am.author_id = p.author_id AND am.user_id = r.user_id
LEFT JOIN auth.users u ON u.id = r.user_id
LEFT JOIN profiles pr ON pr.id = r.user_id
WHERE r.excluded_at IS NULL;

-- S1. Shared IP-signal groups (>=3 accounts): size, pairs, products, dates, share. No HMAC output.
WITH g AS (
  SELECT vote_ip_hmac AS h, count(DISTINCT user_id) AS accounts, count(*) AS pairs,
         count(DISTINCT practice_id) AS products, min(created_at) AS first_at, max(created_at) AS last_at,
         avg(stars) AS avg_stars
  FROM practice_ratings WHERE excluded_at IS NULL AND vote_ip_hmac IS NOT NULL AND btrim(vote_ip_hmac) <> ''
  GROUP BY vote_ip_hmac HAVING count(DISTINCT user_id) >= 3
)
SELECT 'G' || row_number() OVER (ORDER BY accounts DESC) AS grp, accounts, pairs, products,
       first_at::date, last_at::date, round(avg_stars, 3) AS avg_stars,
       round(100.0 * pairs / (SELECT count(*) FROM practice_ratings WHERE excluded_at IS NULL), 1) AS pct_of_all_pairs
FROM g ORDER BY accounts DESC;

-- S1b. Loopback hypothesis: does the dominant IP group equal HMAC(127.0.0.1)? Prints booleans only.
WITH top AS (
  SELECT vote_ip_hmac AS h FROM practice_ratings WHERE excluded_at IS NULL AND vote_ip_hmac IS NOT NULL
  GROUP BY vote_ip_hmac ORDER BY count(DISTINCT user_id) DESC LIMIT 1
)
SELECT (SELECT h FROM top) = nullif(:h_loop4, '') AS top_group_is_ipv4_loopback,
       (SELECT h FROM top) = nullif(:h_loop6, '') AS top_group_is_mapped_loopback;

-- S2. Shared device-signal groups (>=3 accounts).
WITH g AS (
  SELECT device_id_hmac AS h, count(DISTINCT user_id) AS accounts, count(*) AS pairs,
         count(DISTINCT practice_id) AS products, min(created_at) AS first_at, max(created_at) AS last_at,
         avg(stars) AS avg_stars,
         count(DISTINCT user_id) FILTER (WHERE user_id IN (SELECT user_id FROM analytics_test_accounts)) AS test_accounts
  FROM practice_ratings WHERE excluded_at IS NULL AND device_id_hmac IS NOT NULL AND btrim(device_id_hmac) <> ''
  GROUP BY device_id_hmac HAVING count(DISTINCT user_id) >= 3
)
SELECT 'D' || row_number() OVER (ORDER BY accounts DESC) AS grp, accounts, test_accounts, pairs, products,
       first_at::date, last_at::date, round(avg_stars, 3) AS avg_stars,
       round(100.0 * pairs / (SELECT count(*) FROM practice_ratings WHERE excluded_at IS NULL), 1) AS pct_of_all_pairs
FROM g ORDER BY accounts DESC;

-- S3. Fast registration→eligibility→rating (<10 min): pairs vs accounts, listen time, stars, concentration.
WITH f AS (
  SELECT r.user_id, r.practice_id, r.stars, s.real_listened_ms, p.author_id, r.created_at
  FROM practice_ratings r
  JOIN practice_listen_stats s ON s.user_id = r.user_id AND s.practice_id = r.practice_id AND s.rating_eligible_at IS NOT NULL
  JOIN profiles pr ON pr.id = r.user_id
  JOIN practices p ON p.id = r.practice_id
  WHERE r.excluded_at IS NULL AND pr.created_at IS NOT NULL
    AND r.created_at >= pr.created_at AND s.rating_eligible_at >= pr.created_at
    AND r.created_at >= s.rating_eligible_at AND r.created_at - pr.created_at <= interval '10 minutes'
)
SELECT count(*) AS pairs, count(DISTINCT user_id) AS accounts, count(DISTINCT practice_id) AS products,
       count(DISTINCT author_id) AS authors,
       count(*) FILTER (WHERE real_listened_ms < 36000) AS pairs_listen_30_36s,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY real_listened_ms) AS median_listened_ms,
       round(avg(stars), 3) AS avg_stars,
       min(created_at)::date AS first_day, max(created_at)::date AS last_day
FROM f;

-- S4. Per-product impact simulation (NOTHING is excluded): count/avg as-is vs without each signal set.
WITH ipg AS (
  SELECT vote_ip_hmac AS h FROM practice_ratings WHERE excluded_at IS NULL AND vote_ip_hmac IS NOT NULL
  GROUP BY vote_ip_hmac HAVING count(DISTINCT user_id) >= 3
), devg AS (
  SELECT device_id_hmac AS h FROM practice_ratings WHERE excluded_at IS NULL AND device_id_hmac IS NOT NULL
  GROUP BY device_id_hmac HAVING count(DISTINCT user_id) >= 3
), r AS (
  SELECT r.*, p.author_id,
         r.vote_ip_hmac IN (SELECT h FROM ipg) AS in_ip,
         r.device_id_hmac IN (SELECT h FROM devg) AS in_dev,
         EXISTS (SELECT 1 FROM analytics_test_accounts t WHERE t.user_id = r.user_id) AS is_test,
         EXISTS (SELECT 1 FROM author_members am WHERE am.author_id = p.author_id AND am.user_id = r.user_id) AS is_owner
  FROM practice_ratings r JOIN practices p ON p.id = r.practice_id
  WHERE r.excluded_at IS NULL
)
SELECT 'P' || lpad(row_number() OVER (ORDER BY count(*) DESC, practice_id)::text, 2, '0') AS product,
       count(*) AS n, round(avg(stars), 2) AS avg,
       count(*) FILTER (WHERE NOT coalesce(in_ip, false)) AS n_wo_ip, round(avg(stars) FILTER (WHERE NOT coalesce(in_ip, false)), 2) AS avg_wo_ip,
       count(*) FILTER (WHERE NOT coalesce(in_dev, false)) AS n_wo_dev,
       count(*) FILTER (WHERE NOT is_test) AS n_wo_test,
       count(*) FILTER (WHERE NOT is_owner) AS n_wo_owner
FROM r GROUP BY practice_id ORDER BY n DESC LIMIT 60;

-- S5. Catalogue-sort preview on real data (spec §4): products with ratings, Bayesian score (C=10, m=global mean).
WITH agg AS (
  SELECT practice_id, count(*) AS n, sum(stars) AS s FROM practice_ratings WHERE excluded_at IS NULL GROUP BY practice_id
), g AS (SELECT sum(s)::numeric / nullif(sum(n), 0) AS m FROM agg)
SELECT 'P' || lpad(row_number() OVER (ORDER BY n DESC, practice_id)::text, 2, '0') AS product,
       n, round(s::numeric / n, 2) AS avg,
       round((10 * g.m + s) / (10 + n), 3) AS bayes_c10,
       rank() OVER (ORDER BY s::numeric / n DESC) AS rank_by_avg,
       rank() OVER (ORDER BY (10 * g.m + s) / (10 + n) DESC) AS rank_by_bayes
FROM agg, g ORDER BY n DESC LIMIT 60;

SELECT
  (SELECT count(*) FROM practices WHERE status = 'published') AS published_products,
  (SELECT count(DISTINCT practice_id) FROM practice_ratings WHERE excluded_at IS NULL) AS products_with_ratings;

ROLLBACK;
