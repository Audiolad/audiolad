/**
 * Approved AudioLad Business plan reference (tasks 1e008ee8 and ba344b7f).
 * UI reads these values. Do not copy the price digits into components.
 * Payment is not charged from this module.
 */

export const BUSINESS_PLAN_MONTHLY_PRICE_RUB = 799;

export const BUSINESS_PLAN_PERIOD_LABEL = "в месяц";

export const BUSINESS_GIFT_DAYS = 30;

export const BUSINESS_GIFT_MS = BUSINESS_GIFT_DAYS * 24 * 60 * 60 * 1000;

/** "799 ₽" with a normal space. Callers that must not wrap the price replace it with nbsp. */
export function formatBusinessMonthlyPrice(
  rub: number = BUSINESS_PLAN_MONTHLY_PRICE_RUB,
): string {
  return `${rub} ₽`;
}
