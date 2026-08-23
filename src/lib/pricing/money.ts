/**
 * Product list prices are integer rubles on `practices.price`.
 * Payable amounts and order snapshots use integer kopecks (minor units).
 * Never use floating-point arithmetic for money.
 */

export const RUB_CURRENCY = "RUB";

export const KOPECKS_PER_RUBLE = 100;

/** Inclusive paid list-price range in integer rubles. */
export const MIN_PAID_PRICE_RUB = 49;

export const MAX_PAID_PRICE_RUB = 100_000;

/** Recommended chips only — they must not constrain the input. */
export const RECOMMENDED_PAID_PRICES_RUB = [
  99, 199, 299, 444, 499, 888, 1888, 2888, 4999,
] as const;

export function rublesToMinor(rubles: number): number {
  if (!Number.isInteger(rubles)) {
    throw new Error("money_not_integer");
  }

  return rubles * KOPECKS_PER_RUBLE;
}

export function minorToRubles(minor: number): number {
  if (!Number.isInteger(minor) || minor % KOPECKS_PER_RUBLE !== 0) {
    throw new Error("money_not_whole_rubles");
  }

  return minor / KOPECKS_PER_RUBLE;
}

export function isIntegerRubles(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function parseIntegerRubles(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!/^-?\d+$/.test(trimmed)) {
      return null;
    }

    const parsed = Number(trimmed);

    if (!Number.isInteger(parsed)) {
      return null;
    }

    return parsed;
  }

  return null;
}

export function isPaidPriceInAllowedRange(rubles: number): boolean {
  return (
    Number.isInteger(rubles) &&
    rubles >= MIN_PAID_PRICE_RUB &&
    rubles <= MAX_PAID_PRICE_RUB
  );
}

export function validatePaidPriceRubles(
  rubles: number,
): { ok: true } | { ok: false; code: "invalid_price" } {
  if (!isPaidPriceInAllowedRange(rubles)) {
    return { ok: false, code: "invalid_price" };
  }

  return { ok: true };
}

export function validateSalePriceRubles(
  salePrice: number,
  basePrice: number,
): { ok: true } | { ok: false; code: "invalid_sale_price" } {
  if (!isPaidPriceInAllowedRange(salePrice)) {
    return { ok: false, code: "invalid_sale_price" };
  }

  if (!Number.isInteger(basePrice) || salePrice >= basePrice) {
    return { ok: false, code: "invalid_sale_price" };
  }

  return { ok: true };
}
