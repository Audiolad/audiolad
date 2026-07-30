#!/usr/bin/env node
/**
 * Unit checks for admin analytics test-traffic classifier.
 * Logic mirrors src/lib/admin/analytics-test-traffic.ts.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

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
  const source = readSource("src/lib/admin/analytics-test-traffic.ts");

  for (const campaign of TEST_UTM_CAMPAIGN_ALLOWLIST) {
    assert(source.includes(`"${campaign}"`), `allowlist campaign in source: ${campaign}`);
  }

  for (const segment of TEST_UTM_CAMPAIGN_SEGMENTS) {
    assert(source.includes(`"${segment}"`), `segment token in source: ${segment}`);
  }

  for (const prefix of TEST_ANONYMOUS_ID_PREFIXES) {
    assert(source.includes(`"${prefix}"`), `anon prefix in source: ${prefix}`);
  }

  assert(
    source.includes("export function isTestAnalyticsSession"),
    "classifier is exported from analytics-test-traffic module",
  );
  assert(
    source.includes("export function parseAdminIncludeTestParam"),
    "includeTest query parser is exported",
  );
}

function testAdminWiring() {
  const page = readSource("src/app/admin/page.tsx");
  const workbench = readSource(
    "src/components/admin/AdminAnalyticsWorkbench.tsx",
  );
  const controls = readSource(
    "src/components/admin/AdminAnalyticsTestTrafficControls.tsx",
  );
  const queries = readSource("src/lib/admin/analytics-queries.ts");
  const urlState = readSource("src/lib/admin/analytics-url-state.ts");

  assert(
    page.includes("AdminAnalyticsWorkbench") &&
      page.includes("includeTest: params.includeTest"),
    "admin page forwards includeTest into analytics summary load",
  );
  assert(
    workbench.includes(
      'from "@/components/admin/AdminAnalyticsTestTrafficControls"',
    ) && workbench.includes("<AdminAnalyticsTestTrafficControls"),
    "workbench mounts AdminAnalyticsTestTrafficControls",
  );
  assert(
    workbench.includes("includeTest={summary.includeTest}") &&
      workbench.includes("excludedTestVisitors={summary.excludedTestVisitors}"),
    "workbench passes live summary test-traffic state to controls",
  );
  assert(
    workbench.includes('urlState.includeTest ? "1" : "0"'),
    "includeTest participates in analytics request/query key",
  );
  assert(
    controls.includes('params.set("includeTest"') &&
      controls.includes("toggleHref"),
    "control toggles includeTest through the admin URL",
  );
  assert(
    controls.includes("Не учитывать служебный и тестовый трафик"),
    "control exposes the explicit test-traffic exclusion toggle",
  );
  assert(
    queries.includes("parseAdminIncludeTestParam") &&
      queries.includes("p_include_test: includeTest"),
    "queries apply includeTest to analytics RPC filters",
  );
  assert(
    queries.includes("excludedTestVisitors"),
    "queries return excluded visitor counts for the toggle UI",
  );
  assert(
    urlState.includes('params.set("includeTest"') &&
      urlState.includes("parseAdminIncludeTestParam"),
    "URL state serializes and parses includeTest explicitly",
  );
}

testClassifierCases();
testSourceParity();
testAdminWiring();

console.log("platform-analytics-test-traffic-unit: ok");
