import { buildPracticeCanonicalUrl } from "../products/paths";

export type PromotionLinkParams = {
  authorSlug: string;
  practiceSlug: string;
  campaignKey: string;
  utmSource: string;
  utmMedium: string;
  utmContent: string;
};

const UTM_SOURCE_PATTERN = /^[a-z0-9._-]{1,64}$/i;
const UTM_MEDIUM_PATTERN = /^[a-z0-9._-]{1,64}$/i;
const UTM_CONTENT_PATTERN = /^[a-z0-9._-]{1,64}$/i;

export function sanitizeUtmParam(
  value: string,
  pattern: RegExp,
): string | null {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed || !pattern.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function buildPromotionLink(params: PromotionLinkParams): string {
  const baseUrl = buildPracticeCanonicalUrl(
    params.authorSlug.trim(),
    params.practiceSlug.trim(),
  );

  let parsed: URL;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("invalid_practice_url");
  }

  if (!parsed.pathname.startsWith("/practice/")) {
    throw new Error("external_url_not_allowed");
  }

  const utmSource = sanitizeUtmParam(params.utmSource, UTM_SOURCE_PATTERN);
  const utmMedium = sanitizeUtmParam(params.utmMedium, UTM_MEDIUM_PATTERN);
  const utmContent = sanitizeUtmParam(params.utmContent, UTM_CONTENT_PATTERN);
  const campaignKey = params.campaignKey.trim().toLowerCase();

  if (!utmSource || !utmMedium || !utmContent || !campaignKey) {
    throw new Error("invalid_utm_params");
  }

  parsed.searchParams.set("utm_source", utmSource);
  parsed.searchParams.set("utm_medium", utmMedium);
  parsed.searchParams.set("utm_campaign", campaignKey);
  parsed.searchParams.set("utm_content", utmContent);

  return parsed.toString();
}
