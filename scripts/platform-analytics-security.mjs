#!/usr/bin/env node
/**
 * Platform analytics security checks (dev DB + local API assumptions).
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sql(query) {
  return execSync(
    `docker exec supabase-db psql -U postgres -d postgres -tAc ${JSON.stringify(query)}`,
    { encoding: "utf8" },
  ).trim();
}

function testMigrationSecurity() {
  const migration = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260717120000_platform_analytics.sql",
    "utf8",
  );

  assert(migration.includes("REVOKE ALL ON public.analytics_sessions"), "sessions revoked");
  assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
  assert(!migration.includes("ip_address"), "no ip storage in migration");
}

function testClientBundle() {
  const files = [
    "/var/www/audiolad/src/lib/analytics/client.ts",
    "/var/www/audiolad/src/app/api/analytics/track/route.ts",
    "/var/www/audiolad/src/lib/admin/analytics-queries.ts",
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert(!source.includes("SUPABASE_SERVICE_ROLE_KEY"), `${file} has no service role key`);
  }
}

function testDbPrivileges() {
  const sessionPriv = sql(
    "SELECT has_table_privilege('authenticated', 'public.analytics_sessions', 'SELECT');",
  );
  const eventPriv = sql(
    "SELECT has_table_privilege('authenticated', 'public.analytics_events', 'SELECT');",
  );

  assert(sessionPriv === "f", "authenticated cannot SELECT analytics_sessions");
  assert(eventPriv === "f", "authenticated cannot SELECT analytics_events");
}

function testSanitizeModule() {
  const source = readFileSync("/var/www/audiolad/src/lib/analytics/sanitize.ts", "utf8");
  assert(source.includes("isPlatformAnalyticsEventName"), "event allowlist enforced");
  assert(source.includes("checkAnalyticsRateLimit"), "rate limit helper exists");
  assert(source.includes("MAX_PROPERTIES"), "properties capped");
}

function testSignupRpcSecurity() {
  const migration = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260717130000_platform_analytics_signup_completion.sql",
    "utf8",
  );

  assert(migration.includes("auth.uid()"), "signup rpc uses auth.uid");
  assert(migration.includes("signup_completed_user_uidx"), "unique signup per user");
  assert(migration.includes("GRANT EXECUTE ON FUNCTION public.record_platform_signup_completed(uuid, text) TO authenticated"), "signup rpc authenticated only");
  assert(!migration.includes("GRANT EXECUTE ON FUNCTION public.record_platform_signup_completed(uuid, text) TO anon"), "signup rpc not anon");
}

async function testApiValidation() {
  const base = process.env.ANALYTICS_HTTP_BASE_URL ?? process.env.BASE_URL ?? process.env.ANALYTICS_E2E_BASE_URL ?? "http://127.0.0.1:3001";

  const invalidEvent = await fetch(`${base}/api/analytics/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: "00000000-0000-4000-8000-000000000001",
      anonymous_id: "anon-test",
      event_name: "evil_event",
    }),
  });
  assert(invalidEvent.status === 400, `invalid event rejected (${invalidEvent.status})`);

  const invalidUuid = await fetch(`${base}/api/analytics/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: "not-a-uuid",
      anonymous_id: "anon-test",
      event_name: "page_view",
    }),
  });
  assert(invalidUuid.status === 400, `invalid uuid rejected (${invalidUuid.status})`);
}

async function main() {
  testMigrationSecurity();
  testClientBundle();
  testDbPrivileges();
  testSanitizeModule();
  testSignupRpcSecurity();
  await testApiValidation();
  console.log("platform-analytics-security: ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
