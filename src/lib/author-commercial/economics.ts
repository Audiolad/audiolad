/**
 * Platform commercial revenue split — single source of truth for defaults.
 *
 * Persisted terms use `author_commercial_terms.author_share_bps` and
 * `author_commercial_terms.platform_fee_bps` (must sum to 10000).
 * Do not duplicate these ratios in UI copy or ad-hoc calculations.
 */
export const AUTHOR_COMMERCIAL_SHARE_BPS = 7000;
export const PLATFORM_COMMERCIAL_SHARE_BPS = 3000;
export const COMMERCIAL_SHARE_BPS_TOTAL = 10000;

/** DB column name for the platform share on author_commercial_terms. */
export const PLATFORM_COMMERCIAL_SHARE_DB_COLUMN = "platform_fee_bps" as const;

export function assertCommercialShareBpsPair(
  authorShareBps: number,
  platformShareBps: number,
): boolean {
  return (
    Number.isInteger(authorShareBps) &&
    Number.isInteger(platformShareBps) &&
    authorShareBps >= 0 &&
    platformShareBps >= 0 &&
    authorShareBps + platformShareBps === COMMERCIAL_SHARE_BPS_TOTAL
  );
}

export const DEFAULT_COMMERCIAL_SHARE = {
  authorShareBps: AUTHOR_COMMERCIAL_SHARE_BPS,
  platformShareBps: PLATFORM_COMMERCIAL_SHARE_BPS,
  /** Alias matching the DB column name. */
  platformFeeBps: PLATFORM_COMMERCIAL_SHARE_BPS,
} as const;
