import { AUTHOR_PROJECT_CAPACITY_ORDER_KIND } from "@/lib/author-projects/capacity-catalog";
import { BUSINESS_ORIGIN } from "@/lib/business-app/host";
import { BUSINESS_SUBSCRIPTION_ORDER_KIND } from "@/lib/business/subscription-checkout";
import { STUDIO_MUSIC_ORDER_KIND } from "@/lib/studio-music/access";
import { buildPracticePublicPath } from "@/lib/products/paths";

export function buildLibraryPurchasedHref(practiceSlug: string | null): string {
  if (practiceSlug) {
    return `/my-practices?purchased=${encodeURIComponent(practiceSlug)}`;
  }

  return "/my-practices";
}

export function isStudioMusicLicenseCheckout(
  orderKind?: string | null,
): boolean {
  return orderKind === STUDIO_MUSIC_ORDER_KIND;
}

export function isAuthorProjectCapacityCheckout(
  orderKind?: string | null,
): boolean {
  return orderKind === AUTHOR_PROJECT_CAPACITY_ORDER_KIND;
}

export function isBusinessSubscriptionCheckout(orderKind?: string | null): boolean {
  return orderKind === BUSINESS_SUBSCRIPTION_ORDER_KIND;
}

export function buildBusinessSubscriptionPaidHref(): string {
  return `${BUSINESS_ORIGIN}/#dostup`;
}

export function buildAuthorProjectCapacityPaidHref(): string {
  return "/author-dashboard/projects/new";
}

export function buildStudioMusicPaidHref(): string {
  return "/studio";
}

export function buildPaidAuthenticatedPrimaryHref(input: {
  authorSlug: string | null;
  practiceSlug: string | null;
  orderKind?: string | null;
}): string {
  if (isStudioMusicLicenseCheckout(input.orderKind)) {
    return buildStudioMusicPaidHref();
  }

  if (isAuthorProjectCapacityCheckout(input.orderKind)) {
    return buildAuthorProjectCapacityPaidHref();
  }

  if (isBusinessSubscriptionCheckout(input.orderKind)) {
    return buildBusinessSubscriptionPaidHref();
  }

  const authorSlug = input.authorSlug?.trim() ?? "";
  const practiceSlug = input.practiceSlug?.trim() ?? "";

  if (authorSlug && practiceSlug) {
    return buildPracticePublicPath(authorSlug, practiceSlug);
  }

  return buildLibraryPurchasedHref(input.practiceSlug);
}
