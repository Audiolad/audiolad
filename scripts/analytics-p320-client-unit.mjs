#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sanitizeCheckoutOriginPath } from "../src/lib/analytics/checkout-origin.ts";
import {
  extractOrderAnalyticsClaims,
  extractPracticeSlug,
} from "../src/lib/orders/create-order-api.ts";
import {
  hasTrafficAttribution,
  mergeTrafficAttribution,
  parseTrafficAttributionFromSearchParams,
} from "../src/lib/analytics/attribution.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function testSanitize() {
  assertEqual(
    sanitizeCheckoutOriginPath(
      "/practice/sergey/product?utm_source=x&token=secret",
    ),
    "/practice/sergey/product",
    "strip query token",
  );
  assertEqual(
    sanitizeCheckoutOriginPath("/checkout/result?order_id=1&token=abc#frag"),
    "/checkout/result",
    "strip fragment and query",
  );
  assertEqual(
    sanitizeCheckoutOriginPath("https://audiolad.ru/catalog?email=a@b.c"),
    "/catalog",
    "strip host and email query",
  );
  assertEqual(sanitizeCheckoutOriginPath("../etc/passwd"), null, "traversal");
  assertEqual(sanitizeCheckoutOriginPath(""), null, "empty");
  assertEqual(sanitizeCheckoutOriginPath("/ok"), "/ok", "plain path");
  const long = `/${"a".repeat(600)}`;
  assertEqual(sanitizeCheckoutOriginPath(long)?.length, 512, "truncate");
}

function testClaimsIgnoreClientUtm() {
  const claims = extractOrderAnalyticsClaims(
    {
      practice_slug: "demo-product",
      analytics_session_id: "11111111-1111-4111-8111-111111111111",
      analytics_anonymous_id: "anon-1",
      checkout_origin_path: "/practice/x?token=1",
      session_utm_source: "spoofed",
      attribution_confidence: "exact",
      attribution_user_id: "22222222-2222-4222-8222-222222222222",
    },
    sanitizeCheckoutOriginPath,
  );
  assertEqual(
    claims.analyticsSessionId,
    "11111111-1111-4111-8111-111111111111",
    "session id",
  );
  assertEqual(claims.analyticsAnonymousId, "anon-1", "anon");
  assertEqual(claims.checkoutOriginPath, "/practice/x", "origin sanitized");
  assertEqual(claims.buyClickClientEventId, null, "no buy click by default");
  assert(!("session_utm_source" in claims), "no client utm field");
  assertEqual(extractPracticeSlug({ practice_slug: "demo-product" }), "demo-product", "slug");
}

function testSessionTouchNoLocalStorageMerge() {
  const url = parseTrafficAttributionFromSearchParams(new URLSearchParams(""));
  assertEqual(hasTrafficAttribution(url), false, "empty url has no utm");
  const stored = {
    utmSource: "old-campaign",
    utmMedium: "cpc",
    utmCampaign: "keep",
    utmContent: null,
  };
  const merged = mergeTrafficAttribution(url, stored);
  assertEqual(merged.utmSource, "old-campaign", "merge still works for cache");
  // Provider must send URL-only fields to session — verified by source contract.
}

function testSourceContracts() {
  const provider = readFileSync(
    join(ROOT, "src/components/analytics/PlatformAnalyticsProvider.tsx"),
    "utf8",
  );
  const buy = readFileSync(
    join(ROOT, "src/components/BuyPracticeButton.tsx"),
    "utf8",
  );
  const route = readFileSync(join(ROOT, "src/app/api/orders/route.ts"), "utf8");
  const migration = readFileSync(
    join(
      ROOT,
      "supabase/migrations/20260725194000_orders_p320_attribution_snapshot.sql",
    ),
    "utf8",
  );
  const client = readFileSync(join(ROOT, "src/lib/analytics/client.ts"), "utf8");

  assert(!provider.includes("resolveTrafficAttribution("), "no resolve merge in provider");
  assert(provider.includes("urlAttribution"), "url-only attribution");
  assert(provider.includes("attributionToApiFields(urlAttribution)"), "session gets url utm");
  assert(buy.includes("getCurrentAnalyticsIdentity"), "buy uses identity helper");
  assert(buy.includes("checkout_origin_path"), "buy sends origin");
  assert(route.includes("extractOrderAnalyticsClaims"), "route extracts claims");
  assert(route.includes("p_analytics_session_id"), "route passes session claim");
  assert(!route.includes("session_utm_source"), "route does not pass client utm");
  assert(migration.includes("attribution_confidence"), "migration confidence");
  assert(migration.includes("ON DELETE SET NULL"), "fk set null");
  assert(client.includes("getCurrentAnalyticsIdentity"), "helper exported");
  assert(
    client.includes("Does not create a session"),
    "helper does not create session",
  );
}

async function main() {
  testSanitize();
  testClaimsIgnoreClientUtm();
  testSessionTouchNoLocalStorageMerge();
  testSourceContracts();
  console.log("analytics-p320-client-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
