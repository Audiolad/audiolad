/**
 * Author SEO discovery gates.
 * The standalone dashboard «Что ищут слушатели» stays Aurafon-only
 * (`isAuthorSeoDiscoveryEnabled`).
 * The music create path (query step, discovery, reservation) also opens for
 * any author when publicationClass is release
 * (`isMusicCreateSeoDiscoveryEnabled`).
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
 * The only publication class that opens SEO reservation for a non-Aurafon
 * author. Practice, course, audiobook, and post stay closed.
 * The opportunities page has no per-card product class, so its claim uses
 * this same music-release path.
 */
export const SEO_NON_AURAFON_RESERVATION_PUBLICATION_CLASS = "release" as const;

export const SEO_DISCOVERY_BETA_DISABLED_MESSAGE =
  "Закрепление поискового запроса доступно для музыкальных релизов.";

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
 * Aurafon closed beta, or any author creating a release (Music).
 * Does not open the standalone dashboard «Что ищут слушатели».
 * Practice, course, audiobook, and post stay closed for non-Aurafon authors.
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
