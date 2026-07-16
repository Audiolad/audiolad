#!/usr/bin/env node
/**
 * Unit checks for admin analytics test-traffic classifier.
 * Logic mirrors src/lib/admin/analytics-test-traffic.ts.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const TEST_UTM_CAMPAIGN_ALLOWLIST = new Set([
  "analytics_dev_fixture",
  "analytics_dev_test",
  "platform_analytics_prod_smoke",
  "analytics_dev_test_signup",
  "analytics_dev_fixture_signup",
]);

const TEST_UTM_CAMPAIGN_SEGMENTS = new Set([
  "test",
  "qa",
  "smoke",
  "e2e",
  "fixture",
  "playwright",
]);

const TEST_ANONYMOUS_ID_PREFIXES = [
  "aaaaaaaa",
  "bbbbbbbb",
  "manual-",
  "test-",
];

function isTestUtmCampaign(campaign) {
  const normalized = campaign?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return false;
  }

  if (TEST_UTM_CAMPAIGN_ALLOWLIST.has(normalized)) {
    return true;
  }

  const segments = normalized.split("_").filter(Boolean);

  return segments.some((segment) => TEST_UTM_CAMPAIGN_SEGMENTS.has(segment));
}

function isTestAnonymousId(anonymousId) {
  const normalized = anonymousId?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return false;
  }

  return TEST_ANONYMOUS_ID_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isTestAnalyticsSession(session) {
  if (isTestUtmCampaign(session.utm_campaign)) {
    return true;
  }

  const campaign = session.utm_campaign?.trim() ?? "";

  if (!campaign && isTestAnonymousId(session.anonymous_id)) {
    return true;
  }

  return false;
}

function parseAdminIncludeTestParam(value) {
  return value === "1" || value === "true";
}

function testClassifierCases() {
  assert(isTestUtmCampaign("analytics_dev_fixture"), "analytics_dev_fixture → test");
  assert(isTestUtmCampaign("analytics_dev_test"), "analytics_dev_test → test");
  assert(
    isTestUtmCampaign("platform_analytics_prod_smoke"),
    "platform_analytics_prod_smoke → test",
  );
  assert(isTestUtmCampaign("browser_e2e"), "browser_e2e → test");
  assert(isTestUtmCampaign("launch_qa"), "launch_qa → test");
  assert(!isTestUtmCampaign("first_launch_20260717"), "first_launch_20260717 → real");
  assert(!isTestUtmCampaign("zhenskie_dengi_launch"), "zhenskie_dengi_launch → real");

  assert(
    isTestAnalyticsSession({
      utm_campaign: null,
      anonymous_id: "aaaaaaaa-1111-2222-3333-444444444444",
    }),
    "empty campaign + aaaaaaaa → test",
  );
  assert(
    !isTestAnalyticsSession({
      utm_campaign: null,
      anonymous_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    }),
    "empty campaign + normal UUID → not automatically test",
  );
  assert(
    !isTestAnalyticsSession({
      utm_campaign: null,
      anonymous_id: "platform-owner-browser-id",
    }),
    "platform_owner + no UTM → not automatically test",
  );

  assert(!parseAdminIncludeTestParam(undefined), "default includeTest is false");
  assert(!parseAdminIncludeTestParam("0"), "includeTest=0 is false");
  assert(parseAdminIncludeTestParam("1"), "includeTest=1 is true");
}

function testSourceParity() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/admin/analytics-test-traffic.ts",
    "utf8",
  );

  for (const campaign of TEST_UTM_CAMPAIGN_ALLOWLIST) {
    assert(source.includes(`"${campaign}"`), `allowlist campaign in source: ${campaign}`);
  }

  for (const segment of TEST_UTM_CAMPAIGN_SEGMENTS) {
    assert(source.includes(`"${segment}"`), `segment token in source: ${segment}`);
  }

  for (const prefix of TEST_ANONYMOUS_ID_PREFIXES) {
    assert(source.includes(`"${prefix}"`), `anon prefix in source: ${prefix}`);
  }
}

function testAdminWiring() {
  const page = readFileSync("/var/www/audiolad/src/app/admin/page.tsx", "utf8");
  const queries = readFileSync(
    "/var/www/audiolad/src/lib/admin/analytics-queries.ts",
    "utf8",
  );

  assert(page.includes("AdminAnalyticsTestTrafficControls"), "test traffic toggle wired");
  assert(page.includes("includeTest"), "includeTest query param wired");
  assert(queries.includes("isTestAnalyticsSession"), "queries use classifier");
  assert(queries.includes("excludedTestVisitors"), "excluded visitor counts returned");
  assert(queries.includes("Уникальные посетители"), "visitor label updated");
}

testClassifierCases();
testSourceParity();
testAdminWiring();

console.log("platform-analytics-test-traffic-unit: ok");
