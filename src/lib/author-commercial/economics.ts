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

export type CommercialShareBps = {
  authorShareBps: number;
  platformShareBps: number;
};

/** Author-facing explanation of what the platform share covers (display only). */
export const PLATFORM_COMMISSION_SCOPE_TEXT =
  "Комиссия Платформы включает использование технической инфраструктуры АудиоЛада, размещение продуктов, предоставление доступа слушателям, приём платежей, работу кабинета, учёт продаж и организацию выплат.";

export function bpsToPercentNumber(bps: number): number {
  return bps / 100;
}

export function formatShareBpsAsPercent(bps: number): string {
  const value = bpsToPercentNumber(bps);
  return `${value.toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
  })}%`;
}

export function resolveDisplayCommercialShare(input?: {
  authorShareBps?: number | null;
  platformShareBps?: number | null;
  platformFeeBps?: number | null;
} | null): CommercialShareBps & { isIndividual: boolean } {
  const authorShareBps = input?.authorShareBps;
  const platformShareBps =
    input?.platformShareBps ?? input?.platformFeeBps ?? null;

  if (
    typeof authorShareBps === "number" &&
    typeof platformShareBps === "number" &&
    assertCommercialShareBpsPair(authorShareBps, platformShareBps)
  ) {
    const isDefault =
      authorShareBps === AUTHOR_COMMERCIAL_SHARE_BPS &&
      platformShareBps === PLATFORM_COMMERCIAL_SHARE_BPS;
    return {
      authorShareBps,
      platformShareBps,
      isIndividual: !isDefault,
    };
  }

  return {
    authorShareBps: DEFAULT_COMMERCIAL_SHARE.authorShareBps,
    platformShareBps: DEFAULT_COMMERCIAL_SHARE.platformShareBps,
    isIndividual: false,
  };
}

export function getCommercialShareDisplayLines(
  share: CommercialShareBps = DEFAULT_COMMERCIAL_SHARE,
): {
  authorLine: string;
  platformLine: string;
  authorPercentLabel: string;
  platformPercentLabel: string;
} {
  const authorPercentLabel = formatShareBpsAsPercent(share.authorShareBps);
  const platformPercentLabel = formatShareBpsAsPercent(share.platformShareBps);

  return {
    authorPercentLabel,
    platformPercentLabel,
    authorLine: `Вознаграждение автора – ${authorPercentLabel} от стоимости продажи.`,
    platformLine: `Вознаграждение Платформы – ${platformPercentLabel} от стоимости продажи.`,
  };
}
