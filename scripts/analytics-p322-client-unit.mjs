#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  attributionToApiFields,
  hasTrafficAttribution,
  mergeTrafficAttribution,
  parseTrafficAttributionFromSearchParams,
} from "../src/lib/analytics/attribution.ts";
import { parseSessionBody } from "../src/lib/analytics/sanitize.ts";
import {
  acquisitionSourceLabel,
  classifyAcquisitionSourceClass,
} from "../src/lib/analytics/source-class.ts";

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

function testAttributionUtmTerm() {
  const parsed = parseTrafficAttributionFromSearchParams(
    new URLSearchParams(
      "utm_source=s&utm_medium=m&utm_campaign=c&utm_content=x&utm_term=shoes",
    ),
  );
  assertEqual(parsed.utmTerm, "shoes", "parse utm_term");
  assert(hasTrafficAttribution({ ...parsed, utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null }), "term alone counts");
  const fields = attributionToApiFields(parsed);
  assertEqual(fields.utm_term, "shoes", "api field");

  const merged = mergeTrafficAttribution(
    { utmSource: "a", utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null },
    { utmSource: null, utmMedium: "m", utmCampaign: null, utmContent: null, utmTerm: "t" },
  );
  assertEqual(merged.utmTerm, "t", "merge term fallback");
}

function testParseSessionBody() {
  const parsed = parseSessionBody({
    anonymous_id: "anon-1",
    landing_path: "/x?token=secret",
    utm_source: "s",
    utm_term: "term\u0001x",
    referrer_domain: "example.com",
  });
  assert(parsed, "parsed");
  assertEqual(parsed.utm_term, "termx", "control chars stripped");
  assertEqual(parsed.landing_path, "/x", "path no query");
}

function testSourceClass() {
  assertEqual(
    classifyAcquisitionSourceClass({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "x",
    }),
    "utm",
    "utm",
  );
  assertEqual(
    classifyAcquisitionSourceClass({ referrerDomain: "www.google.com" }),
    "organic_search",
    "organic",
  );
  assertEqual(
    classifyAcquisitionSourceClass({ referrerDomain: "vk.com" }),
    "social",
    "social",
  );
  assertEqual(
    classifyAcquisitionSourceClass({
      utmSource: "telegram",
      utmMedium: "messaging_bot",
      utmCampaign: "x",
    }),
    "messenger",
    "messenger",
  );
  assertEqual(
    classifyAcquisitionSourceClass({}),
    "direct_or_unknown",
    "direct",
  );
  assertEqual(
    classifyAcquisitionSourceClass({ referrerDomain: "audiolad.ru" }),
    "direct_or_unknown",
    "internal",
  );
  assertEqual(
    classifyAcquisitionSourceClass({ referrerDomain: "example.org" }),
    "referral",
    "referral",
  );
  assertEqual(
    acquisitionSourceLabel("direct_or_unknown"),
    "Без UTM / источник не определён",
    "label",
  );
}

function testNoClientFirstTouchWriter() {
  const route = readFileSync(
    join(ROOT, "src/app/api/analytics/session/route.ts"),
    "utf8",
  );
  assert(!route.includes("analytics_first_touches"), "session route no direct FT write");
  assert(route.includes("p_utm_term"), "session route passes utm_term");
  assert(
    !route.includes("ensure_anonymous_first_touch"),
    "client cannot call ensure RPC",
  );
}

function main() {
  testAttributionUtmTerm();
  testParseSessionBody();
  testSourceClass();
  testNoClientFirstTouchWriter();
  console.log("analytics-p322-client-unit: ok");
}

main();
