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

assert(!sql.includes("WHERE is_included"), "shared-facts consumers cannot use removed is_included column");

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

const practices = sql.slice(sql.indexOf("FUNCTION public.admin_analytics_p2_practices"));
assert(practices.includes("p_limit") && practices.includes("p_offset"), "practice pagination retained");
assert(practices.includes("'view_to_play'") && practices.includes("'play_to_complete'"), "practice sort whitelist retained");
assert(practices.includes("LIMIT v_limit OFFSET v_offset"), "practice paging is applied");

const authors = sql.slice(sql.indexOf("FUNCTION public.admin_analytics_p2_authors"));
assert(authors.includes("published_practices") && authors.includes("LIMIT v_limit OFFSET v_offset"), "author totals and paging retained");

const authorSummary = sql.slice(sql.indexOf("FUNCTION public.author_stats_summary"));
assert(!authorSummary.includes("'author_page_views',0"), "author page views are not hardcoded");
assert(!authorSummary.includes("'library_saves',0"), "library saves are not hardcoded");

const authorProducts = sql.slice(sql.indexOf("FUNCTION public.author_stats_products"));
assert(!authorProducts.includes("'gross_purchases',0"), "product finance is not hardcoded");
assert(authorProducts.includes("author_canonical_sales_base"), "product finance projection retained");

const authorSeries = sql.slice(sql.indexOf("FUNCTION public.author_stats_timeseries"));
assert(!authorSeries.includes("'author_page_views',0"), "author timeseries page facts retained");
assert(!authorSeries.includes("'library_saves',0"), "author timeseries save facts retained");

const sources = sql.slice(sql.indexOf("FUNCTION public.author_stats_sources"));
assert(sources.includes("referrer_domain"), "source referrer attribution retained");

const adminSeries = sql.slice(sql.indexOf("FUNCTION public.admin_analytics_p2_timeseries"));
assert(!adminSeries.includes("'registrations',0"), "admin timeseries registrations retained");
assert(adminSeries.includes("v_max_points") && adminSeries.includes("v_granularity"), "admin timeseries bucketing retained");

const acquisition = sql.slice(sql.indexOf("FUNCTION public.admin_analytics_p2_acquisition"));
assert(!acquisition.includes("'registrations',0"), "acquisition registrations retained");
assert(acquisition.includes("LIMIT v_limit OFFSET v_offset"), "acquisition paging retained");

assert(sql.includes("REVOKE ALL ON FUNCTION public.analytics_product_event_facts"), "shared facts not browser callable");
assert(sql.includes("TO service_role"), "service role receives explicit grants");
assert(dates.includes('timeZone: "Europe/Moscow"'), "author period uses Moscow");
assert(dates.includes("(days - 1)"), "7d/30d start includes today and calendar days");
assert(!dates.includes("now.getTime() - days *"), "author period is not rolling duration");

console.log("analytics-shared-product-semantics-unit: ok");
