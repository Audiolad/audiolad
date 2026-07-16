export const TEST_UTM_CAMPAIGN_ALLOWLIST = new Set([
  "analytics_dev_fixture",
  "analytics_dev_test",
  "platform_analytics_prod_smoke",
  "analytics_dev_test_signup",
  "analytics_dev_fixture_signup",
]);

export const TEST_UTM_CAMPAIGN_SEGMENTS = new Set([
  "test",
  "qa",
  "smoke",
  "e2e",
  "fixture",
  "playwright",
]);

export const TEST_ANONYMOUS_ID_PREFIXES = [
  "aaaaaaaa",
  "bbbbbbbb",
  "manual-",
  "test-",
] as const;

export type AnalyticsSessionTrafficInput = {
  utm_campaign?: string | null;
  anonymous_id: string;
};

export function isTestUtmCampaign(campaign: string | null | undefined): boolean {
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

export function isTestAnonymousId(anonymousId: string | null | undefined): boolean {
  const normalized = anonymousId?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return false;
  }

  return TEST_ANONYMOUS_ID_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isTestAnalyticsSession(session: AnalyticsSessionTrafficInput): boolean {
  if (isTestUtmCampaign(session.utm_campaign)) {
    return true;
  }

  const campaign = session.utm_campaign?.trim() ?? "";

  if (!campaign && isTestAnonymousId(session.anonymous_id)) {
    return true;
  }

  return false;
}

export function parseAdminIncludeTestParam(
  value: string | null | undefined,
): boolean {
  return value === "1" || value === "true";
}
