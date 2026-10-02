/**
 * Author SEO discovery gates.
 *
 * The standalone dashboard «Что ищут слушатели» stays Aurafon-only
 * (`isAuthorSeoDiscoveryEnabled`).
 *
 * Product creation may use SEO discovery for:
 * - music releases (`publicationClass=release`);
 * - practices (`publicationClass=practice`).
 *
 * Courses, audiobooks, and posts stay closed until their authoring flows are
 * designed separately.
 *
 * Identity lives in `@/lib/authors/aurafon`. This module is the SEO-discovery
 * feature gate only — other Aurafon betas must not depend on it.
 */

import { isAurafonAuthor } from "@/lib/authors/aurafon";

export {
  AURAFON_AUTHOR_ID,
  AURAFON_AUTHOR_SLUG,
} from "@/lib/authors/aurafon";

/**
 * The opportunities page has no per-card product class, so its legacy
 * non-Aurafon claim/create action continues to default to a music release.
 */
export const SEO_NON_AURAFON_RESERVATION_PUBLICATION_CLASS = "release" as const;

export const SEO_PRODUCT_CREATE_PUBLICATION_CLASSES = [
  "release",
  "practice",
] as const;

export const SEO_DISCOVERY_BETA_DISABLED_MESSAGE =
  "Закрепление поискового запроса доступно для музыки и практик.";

export function isAuthorSeoDiscoveryEnabled(
  authorId: string | null | undefined,
): boolean {
  return isAurafonAuthor(authorId);
}

export function assertAuthorSeoDiscoveryEnabled(authorId: string): void {
  if (!isAuthorSeoDiscoveryEnabled(authorId)) {
    throw seoDiscoveryBetaDisabledError();
  }
}

/**
 * Pre-create SEO query step and the discovery / reservation APIs it calls.
 * Aurafon keeps the full closed beta; every other author can use this flow for
 * explicit music releases and practices.
 */
export function isProductCreateSeoDiscoveryEnabled(input: {
  authorId?: string | null;
  publicationClass?: string | null;
}): boolean {
  if (isAuthorSeoDiscoveryEnabled(input.authorId)) {
    return true;
  }

  const publicationClass = input.publicationClass?.trim() ?? "";
  return SEO_PRODUCT_CREATE_PUBLICATION_CLASSES.some(
    (item) => item === publicationClass,
  );
}

export function assertProductCreateSeoDiscoveryEnabled(input: {
  authorId: string;
  publicationClass?: string | null;
}): void {
  if (!isProductCreateSeoDiscoveryEnabled(input)) {
    throw seoDiscoveryBetaDisabledError();
  }
}

/**
 * Compatibility helper for music-only callers. Unlike the neutral product
 * create gate above, this remains release-only for non-Aurafon authors.
 */
export function isMusicCreateSeoDiscoveryEnabled(input: {
  authorId?: string | null;
  publicationClass?: string | null;
}): boolean {
  if (isAuthorSeoDiscoveryEnabled(input.authorId)) {
    return true;
  }

  return (
    input.publicationClass?.trim() ===
    SEO_NON_AURAFON_RESERVATION_PUBLICATION_CLASS
  );
}

export function assertMusicCreateSeoDiscoveryEnabled(input: {
  authorId: string;
  publicationClass?: string | null;
}): void {
  if (!isMusicCreateSeoDiscoveryEnabled(input)) {
    throw seoDiscoveryBetaDisabledError();
  }
}

function seoDiscoveryBetaDisabledError(): Error {
  const error = new Error("seo_discovery_beta_disabled");
  (error as Error & { code: string; status: number }).code =
    "seo_discovery_beta_disabled";
  (error as Error & { code: string; status: number }).status = 403;
  return error;
}
