/**
 * Closed beta for author SEO discovery («Что ищут слушатели»).
 * Server + UI must use this helper — never scatter Magic UUIDs.
 *
 * Identity lives in `@/lib/authors/aurafon`. This module is the SEO-discovery
 * feature gate only — other Aurafon betas must not depend on it.
 */

import { isAurafonAuthor } from "@/lib/authors/aurafon";

export {
  AURAFON_AUTHOR_ID,
  AURAFON_AUTHOR_SLUG,
} from "@/lib/authors/aurafon";

export function isAuthorSeoDiscoveryEnabled(
  authorId: string | null | undefined,
): boolean {
  return isAurafonAuthor(authorId);
}

export function assertAuthorSeoDiscoveryEnabled(authorId: string): void {
  if (!isAuthorSeoDiscoveryEnabled(authorId)) {
    const error = new Error("seo_discovery_beta_disabled");
    (error as Error & { code: string; status: number }).code =
      "seo_discovery_beta_disabled";
    (error as Error & { code: string; status: number }).status = 403;
    throw error;
  }
}
