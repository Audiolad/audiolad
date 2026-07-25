#!/usr/bin/env node
/**
 * P3.2.2 historical first-touch backfill DRY-RUN (default).
 * Never marks exact. Does not apply unless --apply is passed AND
 * AUDIOLAD_P322_BACKFILL_APPLY=1 is set (separate approval gate).
 *
 * Usage:
 *   node scripts/analytics-p322-first-touch-backfill-dry-run.mjs
 *   node scripts/analytics-p322-first-touch-backfill-dry-run.mjs --apply  # still blocked without env
 */
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const DATABASE = process.env.AUDIOLAD_SUPABASE_DB || "postgres";
const APPLY =
  process.argv.includes("--apply") &&
  process.env.AUDIOLAD_P322_BACKFILL_APPLY === "1";

function psql(sql, { tuples = false } = {}) {
  const args = [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "-v",
    "ON_ERROR_STOP=1",
  ];
  if (tuples) args.push("-At");
  args.push("-c", sql);
  return execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

function json(sql) {
  return JSON.parse(psql(sql, { tuples: true }).trim());
}

function maskId(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

const report = json(`
WITH eligible_sessions AS (
  SELECT s.*
  FROM public.analytics_sessions s
  WHERE coalesce(s.is_bot, false) = false
    AND coalesce(s.is_test, false) = false
    AND coalesce(s.is_staff, false) = false
    AND s.traffic_class = 'human'
),
anon_candidates AS (
  SELECT DISTINCT ON (s.anonymous_id)
    s.anonymous_id,
    s.id AS first_session_id,
    s.started_at AS first_seen_at,
    s.utm_source,
    s.referrer_domain,
    s.landing_path
  FROM eligible_sessions s
  ORDER BY s.anonymous_id, s.started_at ASC, s.created_at ASC, s.id ASC
),
anon_missing AS (
  SELECT c.*
  FROM anon_candidates c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.analytics_first_touches t
    WHERE t.subject_type = 'anonymous' AND t.anonymous_id = c.anonymous_id
  )
),
user_from_anon AS (
  SELECT DISTINCT ON (l.user_id)
    l.user_id,
    t.anonymous_id,
    t.first_session_id,
    t.first_seen_at,
    t.utm_source,
    t.confidence AS source_confidence
  FROM public.analytics_identity_links l
  JOIN public.analytics_first_touches t
    ON t.subject_type = 'anonymous' AND t.anonymous_id = l.anonymous_id
  WHERE l.unlinked_at IS NULL
  ORDER BY l.user_id, t.first_seen_at ASC, t.created_at ASC, t.id ASC
),
user_from_session AS (
  SELECT DISTINCT ON (s.user_id)
    s.user_id,
    s.anonymous_id,
    s.id AS first_session_id,
    s.started_at AS first_seen_at,
    s.utm_source
  FROM eligible_sessions s
  WHERE s.user_id IS NOT NULL
  ORDER BY s.user_id, s.started_at ASC, s.created_at ASC, s.id ASC
),
user_missing AS (
  SELECT u.id AS user_id
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.analytics_first_touches t
    WHERE t.subject_type = 'user' AND t.user_id = u.id
  )
),
multi_anon AS (
  SELECT l.user_id, count(DISTINCT l.anonymous_id) AS anon_count
  FROM public.analytics_identity_links l
  WHERE l.unlinked_at IS NULL
  GROUP BY l.user_id
  HAVING count(DISTINCT l.anonymous_id) > 1
)
SELECT jsonb_build_object(
  'mode', 'dry_run',
  'confidence_policy', 'inferred_only_never_exact',
  'existing', jsonb_build_object(
    'anonymous', (SELECT count(*)::int FROM analytics_first_touches WHERE subject_type='anonymous'),
    'user', (SELECT count(*)::int FROM analytics_first_touches WHERE subject_type='user'),
    'exact', (SELECT count(*)::int FROM analytics_first_touches WHERE confidence='exact'),
    'inferred', (SELECT count(*)::int FROM analytics_first_touches WHERE confidence='inferred')
  ),
  'anonymous_candidates_missing', (SELECT count(*)::int FROM anon_missing),
  'user_candidates_missing', (SELECT count(*)::int FROM user_missing),
  'users_with_multi_anon', (SELECT count(*)::int FROM multi_anon),
  'excluded_sessions', jsonb_build_object(
    'bot', (SELECT count(*)::int FROM analytics_sessions WHERE coalesce(is_bot,false)),
    'test', (SELECT count(*)::int FROM analytics_sessions WHERE coalesce(is_test,false)),
    'staff', (SELECT count(*)::int FROM analytics_sessions WHERE coalesce(is_staff,false))
  ),
  'proposed_anonymous_inserts', (SELECT count(*)::int FROM anon_missing),
  'proposed_user_inserts_from_anon', (
    SELECT count(*)::int FROM user_missing um
    JOIN user_from_anon ufa ON ufa.user_id = um.user_id
  ),
  'proposed_user_inserts_from_session', (
    SELECT count(*)::int FROM user_missing um
    JOIN user_from_session ufs ON ufs.user_id = um.user_id
    WHERE NOT EXISTS (SELECT 1 FROM user_from_anon ufa WHERE ufa.user_id = um.user_id)
  ),
  'unknown_users_no_history', (
    SELECT count(*)::int FROM user_missing um
    WHERE NOT EXISTS (SELECT 1 FROM user_from_anon ufa WHERE ufa.user_id = um.user_id)
      AND NOT EXISTS (SELECT 1 FROM user_from_session ufs WHERE ufs.user_id = um.user_id)
  ),
  'sample_anonymous', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'anonymous_id', left(anonymous_id, 4) || '…',
      'first_seen_at', first_seen_at,
      'utm_source', utm_source,
      'referrer_domain', referrer_domain,
      'landing_path', landing_path,
      'confidence', 'inferred',
      'origin', 'historical_backfill'
    ) ORDER BY first_seen_at ASC), '[]'::jsonb)
    FROM (SELECT * FROM anon_missing ORDER BY first_seen_at ASC LIMIT 5) s
  ),
  'note', 'Apply requires --apply AND AUDIOLAD_P322_BACKFILL_APPLY=1; never writes exact'
);
`);

report.mode = APPLY ? "APPLY_BLOCKED_UNTIL_REVIEW" : "dry_run";

if (APPLY) {
  console.error(
    "Apply gate opened in argv+env, but this script refuses production apply in P3.2.2 ship.\n" +
      "Re-run after explicit owner approval with a dedicated apply script revision.",
  );
  process.exit(2);
}

console.log(JSON.stringify(report, null, 2));
console.log(
  `\nMasked sample ids policy: ${maskId("abcdefghijklmnop")} style. Backfill NOT applied.`,
);
