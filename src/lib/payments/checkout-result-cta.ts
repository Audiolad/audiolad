import { buildPracticePublicPath } from "@/lib/products/paths";

export function buildLibraryPurchasedHref(practiceSlug: string | null): string {
  if (practiceSlug) {
    return `/my-practices?purchased=${encodeURIComponent(practiceSlug)}`;
  }

  return "/my-practices";
}

export function buildPaidAuthenticatedPrimaryHref(input: {
  authorSlug: string | null;
  practiceSlug: string | null;
}): string {
  const authorSlug = input.authorSlug?.trim() ?? "";
  const practiceSlug = input.practiceSlug?.trim() ?? "";

  if (authorSlug && practiceSlug) {
    return buildPracticePublicPath(authorSlug, practiceSlug);
  }

  return buildLibraryPurchasedHref(input.practiceSlug);
}
