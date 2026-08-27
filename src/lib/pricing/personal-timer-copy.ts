import { formatTimerMmSs } from "@/lib/quick-offers/pricing";
import { formatRubles } from "@/lib/products/price-format";
import { PRICE_PROMOTION_TYPES, type PricePromotionType } from "@/lib/pricing/types";

export const PERSONAL_TIMER_COPY_MAX_LENGTH = 280;

export const PERSONAL_TIMER_TIME_LEFT_TOKEN = "{time_left}";
export const PERSONAL_TIMER_FULL_PRICE_TOKEN = "{full_price}";

export const DEFAULT_PERSONAL_TIMER_ABOVE_TEXT =
  "Предложение действует ещё: {time_left}";

export const DEFAULT_PERSONAL_TIMER_BELOW_TEXT =
  "Это предложение показывается вам один раз. После окончания таймера продукт останется доступен по полной цене {full_price}.";

const DAY_SECONDS = 86_400;
const HOUR_SECONDS = 3_600;

export function resolvePersonalTimerCopyField(
  value: string | null | undefined,
  fallback: string,
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

export function resolvePersonalTimerCopy(input: {
  aboveTimerText?: string | null;
  belowButtonText?: string | null;
}): { aboveTimerText: string; belowButtonText: string } {
  return {
    aboveTimerText: resolvePersonalTimerCopyField(
      input.aboveTimerText,
      DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
    ),
    belowButtonText: resolvePersonalTimerCopyField(
      input.belowButtonText,
      DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
    ),
  };
}

/**
 * Formats remaining time from the existing personal-timer window.
 * Minutes-scale → `19:40 мин.`; hours-scale → `2 ч. 15 мин.`;
 * days-scale → `2 дн. 18 ч.`.
 */
export function formatPersonalTimerRemaining(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));

  if (totalSeconds >= DAY_SECONDS) {
    const days = Math.floor(totalSeconds / DAY_SECONDS);
    const hours = Math.floor((totalSeconds % DAY_SECONDS) / HOUR_SECONDS);
    return hours > 0 ? `${days} дн. ${hours} ч.` : `${days} дн.`;
  }

  if (totalSeconds >= HOUR_SECONDS) {
    const hours = Math.floor(totalSeconds / HOUR_SECONDS);
    const minutes = Math.floor((totalSeconds % HOUR_SECONDS) / 60);
    return minutes > 0 ? `${hours} ч. ${minutes} мин.` : `${hours} ч.`;
  }

  return `${formatTimerMmSs(totalSeconds)} мин.`;
}

export function substitutePersonalTimerTokens(
  template: string,
  vars: { timeLeft: string; fullPrice: string },
): string {
  return template
    .replaceAll(PERSONAL_TIMER_TIME_LEFT_TOKEN, vars.timeLeft)
    .replaceAll(PERSONAL_TIMER_FULL_PRICE_TOKEN, vars.fullPrice);
}

export function buildPersonalTimerOfferCopy(input: {
  remainingMs: number;
  basePrice: number;
  aboveTimerText?: string | null;
  belowButtonText?: string | null;
}): { above: string; below: string } {
  const templates = resolvePersonalTimerCopy(input);

  const vars = {
    timeLeft: formatPersonalTimerRemaining(input.remainingMs),
    fullPrice: formatRubles(input.basePrice),
  };

  return {
    above: substitutePersonalTimerTokens(templates.aboveTimerText, vars),
    below: substitutePersonalTimerTokens(templates.belowButtonText, vars),
  };
}

export function isPersonalTimerPromotionType(
  promotionType: PricePromotionType | string | null | undefined,
): boolean {
  return promotionType === PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN;
}
