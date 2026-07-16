import { slugifyTitle } from "../author-products/utils";

export const CAMPAIGN_KEY_PATTERN = /^[a-z0-9_]{2,64}$/;
export const CAMPAIGN_KEY_MAX_LENGTH = 64;
export const CAMPAIGN_NAME_MAX_LENGTH = 120;

export function buildCampaignKeyFromName(name: string): string {
  const slug = slugifyTitle(name).replace(/-/g, "_");

  if (!slug) {
    return "";
  }

  return slug.slice(0, CAMPAIGN_KEY_MAX_LENGTH);
}

export function normalizeCampaignKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, CAMPAIGN_KEY_MAX_LENGTH);
}

export function validateCampaignKey(value: string): string | null {
  const normalized = normalizeCampaignKey(value);

  if (!normalized) {
    return "campaign_key_required";
  }

  if (normalized.length < 2) {
    return "campaign_key_too_short";
  }

  if (!CAMPAIGN_KEY_PATTERN.test(normalized)) {
    return "campaign_key_invalid";
  }

  return null;
}

export function validateCampaignName(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "campaign_name_required";
  }

  if (trimmed.length > CAMPAIGN_NAME_MAX_LENGTH) {
    return "campaign_name_too_long";
  }

  return null;
}
