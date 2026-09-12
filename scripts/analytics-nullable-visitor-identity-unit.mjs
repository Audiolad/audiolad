#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(
  join(root, "supabase/migrations/20261006120200_analytics_nullable_visitor_identity.sql"),
  "utf8",
);
const foundation = readFileSync(
  join(root, "supabase/migrations/20261006120000_analytics_shared_product_semantics.sql"),
  "utf8",
);
const assert = (value, message) => {
  if (!value) throw new Error(`assertion failed: ${message}`);
};
const functionBody = (source, name) => {
  const start = source.indexOf(`FUNCTION public.${name}`);
  assert(start >= 0, `${name} exists`);
  const end = source.indexOf("\n$$;", start);
  assert(end >= 0, `${name} has a SQL body`);
  return source.slice(start, end + 4);
};

const facts = functionBody(sql, "analytics_product_event_facts");
assert(
  !/coalesce\s*\(\s*public\.admin_analytics_visitor_key[\s\S]*?e\.id::text\s*\)/.test(facts),
  "shared facts never substitutes an event id for a person identity",
);
assert(
  /public\.admin_analytics_visitor_key\(\s*e\.user_id,\s*coalesce\(s\.anonymous_id, e\.anonymous_session_id\), e\.occurred_at\s*\)/.test(facts),
  "shared facts retains nullable canonical visitor_key",
);
for (const fragment of [
  "is_test_anonymous_id",
  "is_test_analytics_session",
  "e.traffic_class",
  "s.traffic_class",
  "am.author_id = pr.author_id AND am.user_id = e.user_id",
  "audio_progress_25",
]) assert(facts.includes(fragment), `shared facts preserves ${fragment}`);

for (const rpc of [
  "admin_analytics_p2_window_metrics",
  "admin_analytics_p2_timeseries",
  "admin_analytics_p2_practices",
  "admin_analytics_p2_authors",
  "admin_analytics_p2_acquisition",
  "author_stats_summary",
  "author_stats_timeseries",
  "author_stats_products",
]) {
  const body = functionBody(foundation, rpc);
  assert(body.includes("analytics_product_event_facts"), `${rpc} retains shared facts`);
  assert(
    /count\(DISTINCT visitor_key\)[\s\S]{0,120}visitor_key IS NOT NULL/.test(body),
    `${rpc} counts unique people only when identity is known`,
  );
}
for (const rpc of [
  "admin_analytics_p2_practices",
  "admin_analytics_p2_authors",
  "admin_analytics_p2_acquisition",
]) {
  assert(
    /\bWITH included_events AS \(/.test(functionBody(foundation, rpc)),
    `${rpc} retains its shared-facts CTE guard`,
  );
}

const sources = functionBody(sql, "author_stats_sources");
assert(!/FROM attributed\s+WHERE visitor_key IS NOT NULL/.test(sources), "source event counts retain unidentified events");
assert(
  sources.includes("count(DISTINCT visitor_key)::int AS visitors"),
  "source unique people naturally exclude null identities",
);
assert(
  sources.includes("count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS plays"),
  "source event counts are independent of visitor identity",
);

assert(!foundation.includes("WHERE is_included"), "removed is_included column is not reintroduced");
for (const signature of [
  "admin_analytics_p2_window_metrics(",
  "admin_analytics_p2_summary(",
  "admin_analytics_p2_timeseries(",
  "admin_analytics_p2_practices(",
  "admin_analytics_p2_authors(",
  "admin_analytics_p2_acquisition(",
  "author_stats_summary(",
  "author_stats_timeseries(",
  "author_stats_products(",
  "author_stats_sources(",
]) assert(foundation.includes(`FUNCTION public.${signature}`), `${signature} contract remains defined`);

console.log("analytics-nullable-visitor-identity-unit: ok");
