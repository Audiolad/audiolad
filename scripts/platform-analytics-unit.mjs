#!/usr/bin/env node
/**
 * Platform analytics unit checks — safe to run without database access.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testMigrationContract() {
  const sql = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260717120000_platform_analytics.sql",
    "utf8",
  );

  assert(sql.includes("analytics_sessions"), "analytics_sessions table");
  assert(sql.includes("insert_platform_analytics_event"), "platform event rpc");
  assert(sql.includes("upsert_analytics_session"), "session upsert rpc");
  assert(sql.includes("link_analytics_session_user"), "session link rpc");
  assert(sql.includes("audio_play_started"), "audio_play_started allowlist");
  assert(sql.includes("REVOKE ALL") && sql.includes("analytics_sessions"), "sessions locked down");
}

function testEventConstants() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/analytics/constants.ts",
    "utf8",
  );

  assert(source.includes('"page_view"'), "page_view event");
  assert(source.includes('"audio_progress_90"'), "90% milestone");
  assert(source.includes('"signup_completed"'), "signup_completed event");
}

function testListeningMilestones() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/analytics/listening.ts",
    "utf8",
  );

  assert(source.includes("SEEK_JUMP_THRESHOLD_SECONDS"), "seek guard exists");
  assert(source.includes("listenedSeconds"), "listened seconds tracking");
}

function testApiRoutes() {
  const sessionRoute = readFileSync(
    "/var/www/audiolad/src/app/api/analytics/session/route.ts",
    "utf8",
  );
  const trackRoute = readFileSync(
    "/var/www/audiolad/src/app/api/analytics/track/route.ts",
    "utf8",
  );

  assert(sessionRoute.includes("upsert_analytics_session"), "session rpc wired");
  assert(trackRoute.includes("insert_platform_analytics_event"), "track rpc wired");
  assert(trackRoute.includes("rate_limited"), "track rate limit");
}

function testAdminDashboard() {
  const page = readFileSync("/var/www/audiolad/src/app/admin/page.tsx", "utf8");
  const queries = readFileSync(
    "/var/www/audiolad/src/lib/admin/analytics-queries.ts",
    "utf8",
  );

  assert(page.includes("getAdminAnalyticsDashboard"), "admin analytics wired");
  assert(page.includes("AdminAnalyticsPeriodPicker"), "period picker in admin page");
  assert(queries.includes("audio_play_started"), "play starts in admin queries");
}

function testIntegrations() {
  const providers = readFileSync(
    "/var/www/audiolad/src/components/AppProviders.tsx",
    "utf8",
  );
  const player = readFileSync(
    "/var/www/audiolad/src/components/audio/AudioPlayer.tsx",
    "utf8",
  );

  const migration = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260717130000_platform_analytics_signup_completion.sql",
    "utf8",
  );

  assert(migration.includes("record_platform_signup_completed"), "signup completion rpc");
  assert(migration.includes("signup_completed_user_uidx"), "unique signup index");
  assert(providers.includes("PlatformAnalyticsProvider"), "global analytics provider");
  assert(player.includes("ListenAnalyticsTracker"), "player analytics tracker");
}

function main() {
  testMigrationContract();
  testEventConstants();
  testListeningMilestones();
  testApiRoutes();
  testAdminDashboard();
  testIntegrations();
  console.log("platform-analytics-unit: ok");
}

main();
