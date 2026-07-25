#!/usr/bin/env node
/**
 * Platform analytics unit checks — safe to run without database access.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function testMigrationContract() {
  const sql = read("supabase/migrations/20260717120000_platform_analytics.sql");

  assert(sql.includes("analytics_sessions"), "analytics_sessions table");
  assert(sql.includes("insert_platform_analytics_event"), "platform event rpc");
  assert(sql.includes("upsert_analytics_session"), "session upsert rpc");
  assert(sql.includes("link_analytics_session_user"), "session link rpc");
  assert(sql.includes("audio_play_started"), "audio_play_started allowlist");
  assert(sql.includes("REVOKE ALL") && sql.includes("analytics_sessions"), "sessions locked down");
}

function testDashboardSnapshotMigration() {
  const sql = read(
    "supabase/migrations/20260725140000_admin_analytics_dashboard_snapshot.sql",
  );

  assert(sql.includes("admin_analytics_dashboard_snapshot"), "dashboard snapshot rpc");
  assert(sql.includes("p_from timestamptz"), "from bound");
  assert(sql.includes("p_to timestamptz"), "to bound");
  assert(sql.includes("p_include_test boolean"), "include test flag");
  assert(sql.includes("started_at >= p_from"), "semi-open session start");
  assert(sql.includes("started_at < p_to"), "semi-open session end");
  assert(sql.includes("occurred_at >= p_from"), "semi-open event start");
  assert(sql.includes("occurred_at < p_to"), "semi-open event end");
  assert(sql.includes("is_test_analytics_session"), "test classifier in SQL");
  assert(sql.includes("GRANT EXECUTE") && sql.includes("service_role"), "service_role only");
  assert(!sql.includes("GRANT EXECUTE") || !sql.includes("TO anon"), "not granted to anon");
}

function testEventConstants() {
  const source = read("src/lib/analytics/constants.ts");

  assert(source.includes('"page_view"'), "page_view event");
  assert(source.includes('"audio_progress_90"'), "90% milestone");
  assert(source.includes('"signup_completed"'), "signup_completed event");
}

function testListeningMilestones() {
  const source = read("src/lib/analytics/listening.ts");

  assert(source.includes("SEEK_JUMP_THRESHOLD_SECONDS"), "seek guard exists");
  assert(source.includes("listenedSeconds"), "listened seconds tracking");
}

function testApiRoutes() {
  const sessionRoute = read("src/app/api/analytics/session/route.ts");
  const trackRoute = read("src/app/api/analytics/track/route.ts");

  assert(sessionRoute.includes("upsert_analytics_session"), "session rpc wired");
  assert(trackRoute.includes("insert_platform_analytics_event"), "track rpc wired");
  assert(trackRoute.includes("rate_limited"), "track rate limit");
}

function testAdminDashboard() {
  const page = read("src/app/admin/page.tsx");
  const queries = read("src/lib/admin/analytics-queries.ts");
  const controls = read(
    "src/components/admin/AdminAnalyticsTestTrafficControls.tsx",
  );

  assert(page.includes("getAdminAnalyticsDashboard"), "admin analytics wired");
  assert(page.includes("AdminAnalyticsPeriodPicker"), "period picker in admin page");
  assert(
    queries.includes('rpc("admin_analytics_dashboard_snapshot"'),
    "dashboard uses SQL snapshot rpc",
  );
  assert(
    !queries.includes('.from("analytics_events")'),
    "dashboard does not fetch analytics_events rows",
  );
  assert(
    !queries.includes('.from("analytics_sessions")'),
    "dashboard does not fetch analytics_sessions rows",
  );
  assert(queries.includes("Внутренние сессии"), "visits terminology updated");
  assert(queries.includes("Внутренние посетители"), "visitors terminology updated");
  assert(queries.includes("profiles.created_at"), "registration hint uses profiles.created_at");
  assert(
    queries.includes("Регистрации / внутренние посетители"),
    "registration rate formula documented",
  );
  assert(
    controls.includes("Не учитывать размеченный тестовый трафик"),
    "honest test-traffic toggle label",
  );
}

function testPercentRounding() {
  const period = read("src/lib/admin/analytics-period.ts");
  assert(period.includes("Math.round"), "percent uses Math.round");

  // Mirror production helper.
  function formatAdminPercent(numerator, denominator) {
    if (denominator <= 0 || numerator <= 0) {
      return "0%";
    }
    return `${Math.round((numerator / denominator) * 100)}%`;
  }

  assert(formatAdminPercent(26, 61) === "43%", "26/61 => 43%");
  assert(formatAdminPercent(4, 255) === "2%", "4/255 => 2%");
  assert(formatAdminPercent(0, 10) === "0%", "zero numerator");
  assert(formatAdminPercent(5, 0) === "0%", "zero denominator");
  assert(formatAdminPercent(1, -1) === "0%", "negative denominator guarded");
}

function testIntegrations() {
  const providers = read("src/components/AppProviders.tsx");
  const player = read("src/components/audio/AudioPlayer.tsx");
  const migration = read(
    "supabase/migrations/20260717130000_platform_analytics_signup_completion.sql",
  );

  assert(migration.includes("record_platform_signup_completed"), "signup completion rpc");
  assert(migration.includes("signup_completed_user_uidx"), "unique signup index");
  assert(providers.includes("PlatformAnalyticsProvider"), "global analytics provider");
  assert(providers.includes("YandexMetrika"), "yandex metrika provider");
  assert(player.includes("ListenAnalyticsTracker"), "player analytics tracker");
}

function main() {
  testMigrationContract();
  testDashboardSnapshotMigration();
  testEventConstants();
  testListeningMilestones();
  testApiRoutes();
  testAdminDashboard();
  testPercentRounding();
  testIntegrations();
  console.log("platform-analytics-unit: ok");
}

main();
