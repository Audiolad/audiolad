/**
 * Closed beta for author SEO discovery («Что ищут слушатели»).
 * Server + UI must use this helper — never scatter Magic UUIDs.
 */

/** Stable Auraфон / Аурофон author workspace UUID (migration 20260801120000). */
export const AURAFON_AUTHOR_ID = "59c7e5b8-eae4-4394-82fb-b815a10be6c2";

/** Documentation slug only — gate decisions use UUID. */
export const AURAFON_AUTHOR_SLUG = "aurafon";

const AUTHOR_SEO_DISCOVERY_BETA_AUTHOR_IDS = Object.freeze(
  new Set<string>([AURAFON_AUTHOR_ID]),
);

export function isAuthorSeoDiscoveryEnabled(
  authorId: string | null | undefined,
): boolean {
  if (typeof authorId !== "string" || !authorId.trim()) {
    return false;
  }
  return AUTHOR_SEO_DISCOVERY_BETA_AUTHOR_IDS.has(authorId.trim());
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
