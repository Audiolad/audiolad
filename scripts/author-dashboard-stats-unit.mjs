#!/usr/bin/env node
/**
 * Author dashboard stats – static contract tests (no DB).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function testSecurityMigration() {
  const sql = read(
    "supabase/migrations/20260728190000_admin_analytics_p2_privileges_harden.sql",
  );
  assert(sql.includes("REVOKE ALL ON FUNCTION"), "revokes privileges");
  assert(sql.includes("FROM anon"), "revokes anon");
  assert(sql.includes("FROM authenticated"), "revokes authenticated");
  assert(sql.includes("GRANT EXECUTE"), "grants service_role");
  assert(sql.includes("admin_analytics_p2_summary"), "covers summary");
  assert(sql.includes("admin_analytics_p2_timeseries"), "covers timeseries");
  assert(sql.includes("admin_analytics_p2_practices"), "covers practices");
  assert(sql.includes("admin_analytics_p2_acquisition"), "covers acquisition");
  assert(sql.includes("Post-check failed"), "post-check present");
}

function testAuthorPageViewMigration() {
  const sql = read(
    "supabase/migrations/20260728191000_author_page_view_event.sql",
  );
  assert(sql.includes("'author_page_view'"), "allowlists event");
  assert(sql.includes("ADD COLUMN IF NOT EXISTS author_id"), "author_id column");
  assert(sql.includes("p_author_id uuid DEFAULT NULL"), "insert accepts author");
  assert(sql.includes("author_required"), "requires author for page view");
  assert(sql.includes("author_not_found"), "validates author existence");
}

function testAggregatesMigration() {
  const sql = read(
    "supabase/migrations/20260728192000_author_stats_aggregates.sql",
  );
  assert(sql.includes("author_stats_summary"), "summary rpc");
  assert(sql.includes("author_stats_timeseries"), "timeseries rpc");
  assert(sql.includes("author_stats_products"), "products rpc");
  assert(sql.includes("author_stats_sources"), "sources rpc");
  assert(sql.includes("access_source = 'free_claim'"), "library saves fact");
  assert(sql.includes("status = 'paid'"), "paid purchases");
  assert(sql.includes("author_members"), "excludes self members");
  assert(sql.includes("traffic_class"), "excludes non-human");
  assert(sql.includes("GRANT EXECUTE") && sql.includes("service_role"), "service_role");
  assert(
    !sql.match(/GRANT EXECUTE[\s\S]*TO anon/),
    "no anon grant on author stats",
  );
  assert(sql.includes("author_stats_rate"), "null-safe rates");
  assert(!sql.includes("first_manual_library_save"), "does not use first-save event");
}

function testAccessGuard() {
  const guard = read("src/lib/author-stats/route-guard.ts");
  assert(guard.includes("requireAuthorMembership"), "membership gate");
  assert(guard.includes("invalid_request"), "400 for bad author");
  assert(guard.includes("author_id"), "author_id claim param");
  assert(!guard.includes("requireAuthorPromotionAccess"), "no promo admin bypass");
  assert(!guard.includes("isPlatformAdmin"), "no admin bypass");
  assert(guard.includes('"7d"') && guard.includes('"all"'), "period allowlist");
}

function testApiRoutes() {
  for (const name of ["summary", "timeseries", "products", "sources"]) {
    const route = read(`src/app/api/author/stats/${name}/route.ts`);
    assert(route.includes("requireAuthorStatsAccess"), `${name} gated`);
    assert(route.includes("no-store"), `${name} no-store`);
    assert(route.includes("handleAuthorRouteError"), `${name} errors`);
  }
}

function testTrackerAndConstants() {
  const constants = read("src/lib/analytics/constants.ts");
  const tracker = read("src/components/analytics/AuthorPageViewTracker.tsx");
  const page = read("src/app/(platform)/(listener)/authors/[slug]/page.tsx");
  const sanitize = read("src/lib/analytics/sanitize.ts");
  const track = read("src/app/api/analytics/track/route.ts");

  assert(constants.includes('"author_page_view"'), "constants allowlist");
  assert(tracker.includes('event_name: "author_page_view"'), "tracker event");
  assert(tracker.includes("shouldTrackPageView"), "dedupe");
  assert(tracker.includes("`author:${authorId}`"), "dedupe key");
  assert(page.includes("AuthorPageViewTracker"), "mounted on public page");
  assert(sanitize.includes("author_id"), "sanitize parses author_id");
  assert(sanitize.includes('eventName === "author_page_view"'), "requires author");
  assert(track.includes("p_author_id"), "track passes author_id");
}

function testUi() {
  const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
  const client = read("src/components/author-dashboard/AuthorStatsClient.tsx");
  const labels = read("src/lib/author-stats/labels.ts");

  const promoIdx = nav.indexOf("/author-dashboard/promotion");
  const statsIdx = nav.indexOf("/author-dashboard/stats");
  const financeIdx = nav.indexOf("/author-dashboard/finance");
  assert(promoIdx > 0 && statsIdx > promoIdx && financeIdx > statsIdx, "nav order");
  assert(client.includes("Статистика") || labels.includes("Статистика"), "title");
  assert(labels.includes("среднее тире") || labels.includes("–"), "en dash copy");
  assert(client.includes("AUTHOR_STATS_METHOD_NOTES"), "methodology");
  assert(client.includes("StatsSparkline") || client.includes("svg"), "svg chart");
  assert(!client.includes("recharts"), "no chart library");
  assert(!client.includes("user_id"), "no user_id in UI");
  assert(!client.includes("anonymous_id"), "no anonymous_id in UI");
  assert(!client.includes("email"), "no email in UI");
  assert(client.includes("Благодарности от слушателей") || labels.includes("Благодарности"), "appreciation group");
  assert(client.includes("appreciationCount") || client.includes("appreciationGrossMinor"), "separate appreciation fields");
  assert(!client.includes("донат") && !client.includes("Донат"), "no donate wording");
}

function testDates() {
  const dates = read("src/lib/author-stats/dates.ts");
  assert(dates.includes('value === "7d"'), "7d");
  assert(dates.includes('period === "all"'), "all");
  assert(!dates.includes("date_from"), "no arbitrary client dates helper");
}

function main() {
  testSecurityMigration();
  testAuthorPageViewMigration();
  testAggregatesMigration();
  testAccessGuard();
  testApiRoutes();
  testTrackerAndConstants();
  testUi();
  testDates();
  console.log("author-dashboard-stats-unit: ok");
}

main();
