#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const assert = (value, message) => {
  if (!value) throw new Error(`assertion failed: ${message}`);
};

const sql = read("supabase/migrations/20261006120000_analytics_shared_product_semantics.sql");
const dates = read("src/lib/author-stats/dates.ts");

// The SQL foundation is intentionally the only place where A–I eligibility is
// decided: anonymous/authenticated humans are retained; test IDs/campaigns,
// staff, bots, and own-author members are excluded; identity links remain in
// admin_analytics_visitor_key rather than being reimplemented here.
for (const fragment of [
  "analytics_product_event_facts",
  "admin_analytics_visitor_key(",
  "is_test_anonymous_id",
  "is_test_analytics_session",
  "e.traffic_class",
  "s.traffic_class",
  "am.author_id = pr.author_id AND am.user_id = e.user_id",
  "audio_play_started",
  "audio_completed",
  "audio_progress_25",
  "AT TIME ZONE 'Europe/Moscow'",
]) assert(sql.includes(fragment), `shared semantic ${fragment}`);

for (const rpc of [
  "admin_analytics_p2_window_metrics",
  "admin_analytics_p2_summary",
  "admin_analytics_p2_practices",
  "admin_analytics_p2_authors",
  "admin_analytics_p2_timeseries",
  "admin_analytics_p2_acquisition",
  "author_stats_summary",
  "author_stats_products",
  "author_stats_timeseries",
  "author_stats_sources",
]) {
  const body = sql.slice(sql.indexOf(`FUNCTION public.${rpc}`));
  assert(body.includes("analytics_product_event_facts"), `${rpc} uses shared facts`);
}

assert(sql.includes("REVOKE ALL ON FUNCTION public.analytics_product_event_facts"), "shared facts not browser callable");
assert(sql.includes("TO service_role"), "service role receives explicit grants");
assert(dates.includes('timeZone: "Europe/Moscow"'), "author period uses Moscow");
assert(dates.includes("(days - 1)"), "7d/30d start includes today and calendar days");
assert(!dates.includes("now.getTime() - days *"), "author period is not rolling duration");

console.log("analytics-shared-product-semantics-unit: ok");
