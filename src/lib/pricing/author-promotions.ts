import {
  MAX_PAID_PRICE_RUB,
  MIN_PAID_PRICE_RUB,
  parseIntegerRubles,
  validateSalePriceRubles,
} from "@/lib/pricing/money";
import { isPricePromotionType } from "@/lib/pricing/resolve";
import { PRICE_PROMOTION_TYPES } from "@/lib/pricing/types";

export const PROMOTION_NAME_MAX_LENGTH = 80;
export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 2_592_000;

export type PromotionDurationUnit = "minutes" | "hours" | "days";

export function durationToSeconds(
  amount: number,
  unit: PromotionDurationUnit,
): number | null {
  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  if (unit === "minutes") {
    return amount * 60;
  }

  if (unit === "hours") {
    return amount * 60 * 60;
  }

  if (unit === "days") {
    return amount * 60 * 60 * 24;
  }

  return null;
}

export function parseDurationUnit(value: unknown): PromotionDurationUnit | null {
  if (value === "minutes" || value === "hours" || value === "days") {
    return value;
  }

  return null;
}

export function parsePromotionWriteBody(
  body: Record<string, unknown>,
  basePrice: number,
):
  | {
      ok: true;
      name: string;
      promotionType: "calendar" | "personal_countdown";
      salePrice: number;
      startsAt: string | null;
      endsAt: string | null;
      durationSeconds: number | null;
      isActive: boolean;
    }
  | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name || name.length > PROMOTION_NAME_MAX_LENGTH) {
    return { ok: false, error: "invalid_promotion_name" };
  }

  if (!isPricePromotionType(body.promotion_type)) {
    return { ok: false, error: "invalid_promotion_type" };
  }

  const salePrice = parseIntegerRubles(body.sale_price);

  if (salePrice === null) {
    return { ok: false, error: "invalid_sale_price" };
  }

  const saleCheck = validateSalePriceRubles(salePrice, basePrice);

  if (!saleCheck.ok) {
    return { ok: false, error: saleCheck.code };
  }

  const isActive = body.is_active === undefined ? true : body.is_active === true;

  if (body.promotion_type === PRICE_PROMOTION_TYPES.CALENDAR) {
    const startsAt =
      typeof body.starts_at === "string" ? body.starts_at.trim() : "";
    const endsAt = typeof body.ends_at === "string" ? body.ends_at.trim() : "";
    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);

    if (!startsAt || !endsAt || Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return { ok: false, error: "invalid_calendar_window" };
    }

    if (endMs <= startMs) {
      return { ok: false, error: "invalid_calendar_window" };
    }

    return {
      ok: true,
      name,
      promotionType: PRICE_PROMOTION_TYPES.CALENDAR,
      salePrice,
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(endMs).toISOString(),
      durationSeconds: null,
      isActive,
    };
  }

  const durationSecondsDirect = parseIntegerRubles(body.duration_seconds);
  const durationAmount = parseIntegerRubles(body.duration_amount);
  const durationUnit = parseDurationUnit(body.duration_unit);
  const durationSeconds =
    durationSecondsDirect ??
    (durationAmount !== null && durationUnit
      ? durationToSeconds(durationAmount, durationUnit)
      : null);

  if (
    durationSeconds === null ||
    durationSeconds < MIN_DURATION_SECONDS ||
    durationSeconds > MAX_DURATION_SECONDS
  ) {
    return { ok: false, error: "invalid_duration" };
  }

  return {
    ok: true,
    name,
    promotionType: PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN,
    salePrice,
    startsAt: null,
    endsAt: null,
    durationSeconds,
    isActive,
  };
}

export function paidPriceRangeHint(): string {
  return `От ${MIN_PAID_PRICE_RUB} до ${MAX_PAID_PRICE_RUB.toLocaleString("ru-RU")} ₽`;
}
