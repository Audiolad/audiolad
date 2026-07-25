#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBuyClickedProperties,
  filterBuyClickedProperties,
  BUY_CLICK_FRESHNESS_SECONDS,
} from "../src/lib/analytics/buy-clicked.ts";
import { sanitizeCheckoutOriginPath } from "../src/lib/analytics/checkout-origin.ts";
import {
  isPlatformAnalyticsEventName,
  PLATFORM_ANALYTICS_EVENTS,
} from "../src/lib/analytics/constants.ts";
import {
  normalizePurchaseSurface,
  isPurchaseSurface,
} from "../src/lib/analytics/purchase-surface.ts";
import { parsePlatformTrackBody } from "../src/lib/analytics/sanitize.ts";
import { extractOrderAnalyticsClaims } from "../src/lib/orders/create-order-api.ts";

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

function testAllowlist() {
  assert(PLATFORM_ANALYTICS_EVENTS.includes("buy_clicked"), "buy_clicked in TS allowlist");
  assert(isPlatformAnalyticsEventName("buy_clicked"), "isPlatformAnalyticsEventName");
  assert(!isPlatformAnalyticsEventName("checkout_started"), "no checkout_started");
}

function testPurchaseSurface() {
  assert(isPurchaseSurface("practice_page"), "practice_page ok");
  assertEqual(normalizePurchaseSurface("catalog_card"), "catalog_card", "catalog");
  assertEqual(normalizePurchaseSurface("evil"), "unknown", "reject arbitrary");
  assertEqual(normalizePurchaseSurface(null), "unknown", "null");
}

function testBuyClickedProperties() {
  const props = buildBuyClickedProperties({
    authorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    productPriceMinorSnapshot: 29900.9,
    currency: "rub",
    path: "/practice/x?token=secret&email=a@b.c",
    purchaseSurface: "practice_page",
    clientEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  assertEqual(props.purchase_surface, "practice_page", "surface");
  assertEqual(props.currency, "RUB", "currency");
  assertEqual(props.path, "/practice/x", "path no query");
  assertEqual(props.product_price_minor_snapshot, 29900, "price floor");
  assertEqual(props.author_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "author");
  assert(!("email" in props), "no email");
  assert(!("payment_id" in props), "no payment id");

  const filtered = filterBuyClickedProperties({
    purchase_surface: "playlist",
    path: "/a?token=1",
    email: "x@y.z",
    nested: 1,
    evil: "x",
  });
  assertEqual(filtered.purchase_surface, "playlist", "keep surface");
  assertEqual(filtered.path, "/a", "sanitize path");
  assert(!("email" in filtered), "drop email");
  assert(!("evil" in filtered), "drop non-allowlisted");
}

function testTrackBodySanitizesBuyClicked() {
  const parsed = parsePlatformTrackBody({
    session_id: "11111111-1111-4111-8111-111111111111",
    anonymous_id: "anon-1",
    event_name: "buy_clicked",
    path: "/practice/demo?utm_source=x&token=abc",
    practice_id: "22222222-2222-4222-8222-222222222222",
    properties: {
      purchase_surface: "practice_page",
      path: "/x?token=1",
      email: "leak@example.com",
      product_price_minor_snapshot: 9900,
    },
    client_event_id: "33333333-3333-4333-8333-333333333333",
    client_version: "p1",
  });
  assert(parsed, "parsed");
  assertEqual(parsed.path, "/practice/demo", "track path stripped");
  assertEqual(parsed.properties.purchase_surface, "practice_page", "surface kept");
  assert(!("email" in parsed.properties), "email stripped from props");
  assertEqual(parsed.properties.path, "/x", "prop path stripped");
}

function testOrderClaimsBuyClick() {
  const claims = extractOrderAnalyticsClaims(
    {
      buy_click_client_event_id: "44444444-4444-4444-8444-444444444444",
      analytics_session_id: "11111111-1111-4111-8111-111111111111",
      analytics_anonymous_id: "anon",
      checkout_origin_path: "/p?token=1",
    },
    sanitizeCheckoutOriginPath,
  );
  assertEqual(
    claims.buyClickClientEventId,
    "44444444-4444-4444-8444-444444444444",
    "buy click id",
  );
  assertEqual(
    extractOrderAnalyticsClaims(
      { buy_click_client_event_id: "not-a-uuid" },
      sanitizeCheckoutOriginPath,
    ).buyClickClientEventId,
    null,
    "reject bad uuid",
  );
}

function testSourceContainsContract() {
  const buyBtn = readFileSync(
    join(ROOT, "src/components/BuyPracticeButton.tsx"),
    "utf8",
  );
  assert(buyBtn.includes('event_name: "buy_clicked"'), "emits buy_clicked");
  assert(buyBtn.includes("buy_click_client_event_id"), "passes client event id");
  assert(buyBtn.includes("onClick={handleBuy}"), "click handler");
  assert(!buyBtn.includes("onMouseEnter"), "no hover emit");
  assert(!buyBtn.includes("checkout_started"), "no checkout_started");
  assertEqual(BUY_CLICK_FRESHNESS_SECONDS, 15 * 60, "freshness 15m");

  const constants = readFileSync(
    join(ROOT, "src/lib/analytics/constants.ts"),
    "utf8",
  );
  assert(constants.includes('"buy_clicked"'), "constants");

  const migration = readFileSync(
    join(
      ROOT,
      "supabase/migrations/20260725200000_analytics_p321_buy_click_path.sql",
    ),
    "utf8",
  );
  assert(migration.includes("'buy_clicked'"), "sql allowlist");
  assert(migration.includes("buy_click_event_id"), "order column");
  assert(migration.includes("admin_analytics_p321_path_summary"), "summary rpc");
  assert(migration.includes("not_emitted"), "decision noted");
}

function main() {
  testAllowlist();
  testPurchaseSurface();
  testBuyClickedProperties();
  testTrackBodySanitizesBuyClicked();
  testOrderClaimsBuyClick();
  testSourceContainsContract();
  console.log("analytics-p321-client-unit: ok");
}

main();
