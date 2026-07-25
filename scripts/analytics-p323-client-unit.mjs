#!/usr/bin/env node
import {
  buildAttributionSourcesCsv,
  buildAttributionAuthorsCsv,
} from "../src/lib/admin/analytics-attribution-queries.ts";
import {
  buildAdminAnalyticsSearchParams,
  parseAdminAnalyticsUrlState,
} from "../src/lib/admin/analytics-url-state.ts";
import {
  acquisitionSourceLabel,
  classifyAcquisitionSourceClass,
} from "../src/lib/analytics/source-class.ts";

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}
function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function testLabels() {
  assertEqual(acquisitionSourceLabel("utm"), "UTM-кампания", "utm");
  assertEqual(acquisitionSourceLabel("organic_search"), "Органический поиск", "organic");
  assertEqual(acquisitionSourceLabel("social"), "Социальные сети", "social");
  assertEqual(acquisitionSourceLabel("messenger"), "Мессенджеры", "messenger");
  assertEqual(
    acquisitionSourceLabel("referral"),
    "Переход с другого сайта",
    "referral",
  );
  assertEqual(
    acquisitionSourceLabel("direct_or_unknown"),
    "Без UTM / источник не определён",
    "direct",
  );
  assertEqual(acquisitionSourceLabel("internal"), "Внутренний переход", "internal");
  assertEqual(acquisitionSourceLabel("unknown"), "Нет данных", "unknown");
  assertEqual(
    classifyAcquisitionSourceClass({ referrerDomain: "audiolad.ru" }),
    "direct_or_unknown",
    "internal cleared",
  );
}

function testUrlState() {
  const parsed = parseAdminAnalyticsUrlState(
    new URLSearchParams(
      "view=sources&attributionMode=first_touch&confidence=exact&attributionPeriod=30d&includeTestPayments=1&sourceClass=messenger&campaign=spring",
    ),
  );
  assertEqual(parsed.view, "sources", "view");
  assertEqual(parsed.attributionMode, "first_touch", "mode");
  assertEqual(parsed.attributionConfidence, "exact", "confidence");
  assertEqual(parsed.attributionPeriod, "30d", "period");
  assertEqual(parsed.includeTestPayments, true, "test");
  assertEqual(parsed.attributionSourceClass, "messenger", "sourceClass");
  assertEqual(parsed.attributionCampaign, "spring", "campaign");

  const params = buildAdminAnalyticsSearchParams(parsed);
  assertEqual(params.get("view"), "sources", "build view");
  assertEqual(params.get("attributionMode"), "first_touch", "build mode");
  assertEqual(params.get("confidence"), "exact", "build confidence");
  assertEqual(params.get("includeTestPayments"), "1", "build test");

  const defaults = parseAdminAnalyticsUrlState(new URLSearchParams(""));
  assertEqual(defaults.attributionMode, "session_touch", "default mode");
  assertEqual(defaults.attributionConfidence, "all", "default confidence");
}

function testCsvNoPii() {
  const csv = buildAttributionSourcesCsv("session_touch", [
    {
      source_class: "utm",
      utm_source: "bothelp",
      utm_medium: "messaging_bot",
      payment_count: 1,
      unique_buyers: 1,
      gross_minor: 29900,
      exact_count: 1,
      inferred_count: 0,
      unknown_count: 0,
      coverage_share_pct: 100,
    },
  ]);
  assert(!csv.includes("user_id"), "no user_id");
  assert(!csv.includes("anonymous_id"), "no anonymous_id");
  assert(!csv.includes("session_id"), "no session_id");
  assert(!csv.includes("@"), "no email");
  assert(csv.includes("session_touch"), "mode present");
  assert(csv.includes("29900"), "minor present");

  const authors = buildAttributionAuthorsCsv([
    {
      author_name: "Author",
      payment_count: 1,
      unique_buyers: 1,
      gross_minor: 29900,
      attributed_gross_minor: 0,
      unattributed_gross_minor: 29900,
    },
  ]);
  assert(authors.includes("not payout"), "payout disclaimer");
}

function main() {
  testLabels();
  testUrlState();
  testCsvNoPii();
  console.log("analytics-p323-client-unit: ok");
}

main();
