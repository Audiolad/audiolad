import { slugifyTitle } from "@/lib/author-products/utils";

export const PROMO_PAGE_SLUG_PATTERN = /^[a-z0-9-]{2,64}$/;
export const PROMO_PAGE_SLUG_MAX_LENGTH = 64;
export const PROMO_PAGE_INTERNAL_NAME_MAX_LENGTH = 120;
export const PROMO_PAGE_PUBLIC_TITLE_MAX_LENGTH = 160;
export const PROMO_PAGE_PUBLIC_DESCRIPTION_MAX_LENGTH = 2000;
export const PROMO_PAGE_FOOTER_TEXT_MAX_LENGTH = 2000;
export const PROMO_PAGE_CTA_LABEL_MAX_LENGTH = 80;
export const PROMO_PAGE_CTA_HREF_MAX_LENGTH = 512;
export const PROMO_PAGE_MAX_PRODUCTS = 3;

const DISALLOWED_CTA_PREFIXES = ["/auth/sign-in", "/auth/sign-up"] as const;

export function normalizePromoPageSlug(value: string): string {
  return slugifyTitle(value).slice(0, PROMO_PAGE_SLUG_MAX_LENGTH);
}

export function buildPromoPageSlugFromInternalName(internalName: string): string {
  return normalizePromoPageSlug(internalName);
}

export function validatePromoPageSlug(value: string): string | null {
  const normalized = normalizePromoPageSlug(value);

  if (!normalized) {
    return "promo_page_slug_required";
  }

  if (normalized.length < 2) {
    return "promo_page_slug_too_short";
  }

  if (!PROMO_PAGE_SLUG_PATTERN.test(normalized)) {
    return "promo_page_slug_invalid";
  }

  return null;
}

export function validatePromoPageInternalName(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "promo_page_internal_name_required";
  }

  if (trimmed.length > PROMO_PAGE_INTERNAL_NAME_MAX_LENGTH) {
    return "promo_page_internal_name_too_long";
  }

  return null;
}

export function validatePromoPagePublicTitle(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "promo_page_public_title_required";
  }

  if (trimmed.length > PROMO_PAGE_PUBLIC_TITLE_MAX_LENGTH) {
    return "promo_page_public_title_too_long";
  }

  return null;
}

export function validatePromoPagePublicDescription(
  value: string | null | undefined,
): string | null {
  if (value == null || value.trim() === "") {
    return null;
  }

  if (value.length > PROMO_PAGE_PUBLIC_DESCRIPTION_MAX_LENGTH) {
    return "promo_page_public_description_too_long";
  }

  return null;
}

export function validatePromoPageFooterText(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") {
    return null;
  }

  if (value.length > PROMO_PAGE_FOOTER_TEXT_MAX_LENGTH) {
    return "promo_page_footer_text_too_long";
  }

  return null;
}

export function validatePromoPageCtaLabel(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") {
    return null;
  }

  if (value.trim().length > PROMO_PAGE_CTA_LABEL_MAX_LENGTH) {
    return "promo_page_cta_label_too_long";
  }

  return null;
}

function getPathnameFromInternalHref(href: string): string {
  const withoutHash = href.split("#")[0] ?? href;
  return withoutHash.split("?")[0] ?? withoutHash;
}

export function isUnsafePromoPageCtaHref(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return true;
  }

  if (trimmed.includes("\\")) {
    return true;
  }

  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return true;
  }

  const lower = trimmed.toLowerCase();

  if (lower.includes("://")) {
    return true;
  }

  if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
    return true;
  }

  if (trimmed.length > PROMO_PAGE_CTA_HREF_MAX_LENGTH) {
    return true;
  }

  let decoded = trimmed;

  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return true;
  }

  if (decoded.startsWith("//")) {
    return true;
  }

  const pathname = getPathnameFromInternalHref(decoded);

  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return true;
  }

  return DISALLOWED_CTA_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function validatePromoPageCtaHref(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") {
    return null;
  }

  if (isUnsafePromoPageCtaHref(value)) {
    return "promo_page_cta_href_invalid";
  }

  return null;
}

export function normalizePromoPageProductIds(
  productIds: readonly string[],
): string[] | null {
  const normalized: string[] = [];

  for (const productId of productIds) {
    const trimmed = productId.trim();

    if (!trimmed) {
      return null;
    }

    if (normalized.includes(trimmed)) {
      return null;
    }

    normalized.push(trimmed);
  }

  if (normalized.length > PROMO_PAGE_MAX_PRODUCTS) {
    return null;
  }

  return normalized;
}

export function validatePromoPagePublishProductCount(count: number): string | null {
  if (count < 1) {
    return "promo_page_product_count_too_low";
  }

  if (count > PROMO_PAGE_MAX_PRODUCTS) {
    return "promo_page_product_count_too_high";
  }

  return null;
}

export type PromoPageProductEligibilityInput = {
  status: string | null;
  is_free: boolean | null;
  is_catalog_listed?: boolean | null;
  guest_access_enabled?: boolean | null;
};

export function isPracticePromoPageEligible(
  practice: PromoPageProductEligibilityInput,
): boolean {
  if (practice.status !== "published") {
    return false;
  }

  if (practice.guest_access_enabled === true) {
    return true;
  }

  return practice.is_free === true && practice.is_catalog_listed === true;
}

export function validatePromoPageProductsForPublish(
  practices: PromoPageProductEligibilityInput[],
): string | null {
  const countError = validatePromoPagePublishProductCount(practices.length);

  if (countError) {
    return countError;
  }

  if (practices.some((practice) => !isPracticePromoPageEligible(practice))) {
    return "promo_page_product_not_eligible";
  }

  return null;
}

export type PromotionCampaignTargetInput = {
  practice_id: string | null;
  promo_page_id: string | null;
};

export function validatePromotionCampaignTarget(
  target: PromotionCampaignTargetInput,
): string | null {
  const hasPractice = Boolean(target.practice_id?.trim());
  const hasPromoPage = Boolean(target.promo_page_id?.trim());

  if (hasPractice && hasPromoPage) {
    return "promotion_campaign_target_conflict";
  }

  if (!hasPractice && !hasPromoPage) {
    return "promotion_campaign_target_required";
  }

  return null;
}
