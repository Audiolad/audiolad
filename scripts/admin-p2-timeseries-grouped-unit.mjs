import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const old = read("supabase/migrations/20261006120000_analytics_shared_product_semantics.sql")
  .split("CREATE OR REPLACE FUNCTION public.admin_analytics_p2_timeseries(")[1]
  .split("CREATE OR REPLACE FUNCTION public.admin_analytics_p2_practices(")[0];
const sql = read("supabase/migrations/20270113120000_admin_p2_timeseries_grouped.sql");
const current = sql.split("CREATE OR REPLACE FUNCTION public.admin_analytics_p2_timeseries(")[1]
  .split("REVOKE ALL ON FUNCTION")[0];
// Signature, bucket cap, registration/session predicates, distinct-person
// aggregates and JSON shape must stay byte-for-byte equivalent outside events.
const normalize = (body) => body
  .replace(/  -- Cheap row predicates first;[\s\S]*?  period_profiles AS \(/, "  period_profiles AS (")
  .replace(/  included_events AS \([\s\S]*?  period_profiles AS \(/, "  period_profiles AS (")
  .replaceAll("sum(event_count) FILTER", "count(*) FILTER")
  .trim();
assert.equal(normalize(current), normalize(old));
const groups = current.split("event_groups AS MATERIALIZED (")[1].split("included_events AS MATERIALIZED (")[0];
assert.doesNotMatch(groups, /public\.(admin_analytics_visitor_key|is_test_analytics_session|is_platform_staff|is_analytics_test_user)\(/);
assert.match(groups, /l\.linked_at <= e\.occurred_at/);
assert.match(groups, /l\.unlinked_at > e\.occurred_at/);
assert.match(groups, /count\(\*\) AS event_count/);
assert.doesNotMatch(sql, /DROP\s|TRUNCATE\s|DELETE FROM|UPDATE public\.|ALTER TABLE|CREATE TABLE|CREATE INDEX/i);
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
assert.match(sql, /\) FROM PUBLIC;/);
assert.match(sql, /\) TO service_role;/);
console.log("admin-p2-timeseries-grouped-unit: ok");
