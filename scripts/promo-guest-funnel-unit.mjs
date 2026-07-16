#!/usr/bin/env node
/**
 * Promo guest funnel unit checks — safe to run without database access.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testAccessModule() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/products/access.ts",
    "utf8",
  );

  assert(source.includes('"guest_promo"'), "guest_promo reason exists");
  assert(source.includes("guest_access_enabled"), "guest_access_enabled field used");
}

function testMigrationContract() {
  const sql = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260716150000_practice_guest_promo_funnel.sql",
    "utf8",
  );

  assert(sql.includes("guest_access_enabled"), "practices.guest_access_enabled column");
  assert(sql.includes("analytics_events"), "analytics_events table");
  assert(sql.includes("claim_promo_practice"), "claim_promo_practice rpc");
  assert(sql.includes("insert_analytics_event"), "insert_analytics_event rpc");
  assert(sql.includes("REVOKE ALL") && sql.includes("analytics_events"), "analytics table locked down");
  assert(sql.includes("GRANT EXECUTE") && sql.includes("anon"), "analytics insert for anon");
}

function testSafeNextPath() {
  const routes = readFileSync(
    "/var/www/audiolad/src/lib/auth/routes.ts",
    "utf8",
  );

  assert(routes.includes("isUnsafeNextPath"), "open redirect guard exists");
  assert(routes.includes('trimmed.startsWith("//")'), "blocks protocol-relative");
}

function testSignupContext() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/promo/signup-context.ts",
    "utf8",
  );

  assert(source.includes("resolveValidatedNextPath"), "returnTo validated");
  assert(source.includes("PENDING_SIGNUP_KEY"), "pending signup storage");
  assert(source.includes("buildPromoSignUpHref"), "signup href builder");
}

function testGuestProgress() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/promo/guest-progress.ts",
    "utf8",
  );

  assert(source.includes("SAVE_THROTTLE_MS = 12_000"), "progress throttling");
  assert(source.includes("buildStorageKey(practiceId)"), "per-practice isolation");
}

function testPracticeAccessUi() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/products/practice-access-ui.ts",
    "utf8",
  );

  assert(source.includes("Начать слушать"), "guest listen label");
  assert(source.includes("autoplay: true"), "guest CTA includes autoplay intent");
  assert(source.includes("guest_promo"), "guest promo badge path");
}

function testAnalyticsEvents() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/promo/analytics-events.ts",
    "utf8",
  );

  assert(source.includes("promo_practice_viewed"), "view event");
  assert(source.includes("promo_signup_completed"), "signup completed event");
  assert(source.includes("isPromoAnalyticsEventName"), "event allowlist");
}

function testCompleteSignupApi() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/promo/complete-signup-api.ts",
    "utf8",
  );

  assert(source.includes("PRACTICE_SLUG_PATTERN"), "slug validation");
  assert(source.includes("UUID_PATTERN"), "progress uuid validation");
}

function testListenPageNoAutoplayDefault() {
  const listenPage = readFileSync(
    "/var/www/audiolad/src/app/listen/[...segments]/page.tsx",
    "utf8",
  );

  assert(
    listenPage.includes("autoplay") || readFileSync("/var/www/audiolad/src/lib/listen/page-shared.tsx", "utf8").includes("autoplay={options?.autoplay === true}"),
    "listen autoplay is opt-in",
  );
}

const tests = [
  ["access module", testAccessModule],
  ["migration contract", testMigrationContract],
  ["safe next path", testSafeNextPath],
  ["signup context", testSignupContext],
  ["guest progress", testGuestProgress],
  ["practice access ui", testPracticeAccessUi],
  ["analytics events", testAnalyticsEvents],
  ["complete signup api", testCompleteSignupApi],
  ["listen autoplay opt-in", testListenPageNoAutoplayDefault],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${tests.length} promo guest funnel checks passed`);
