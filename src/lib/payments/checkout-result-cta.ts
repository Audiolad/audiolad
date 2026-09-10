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

  const authorSlug = input.authorSlug?.trim() ?? "";
  const practiceSlug = input.practiceSlug?.trim() ?? "";

  if (authorSlug && practiceSlug) {
    return buildPracticePublicPath(authorSlug, practiceSlug);
  }

  return buildLibraryPurchasedHref(input.practiceSlug);
}
