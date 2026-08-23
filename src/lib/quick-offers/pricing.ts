export type OfferTimerState = {
  expiresAt: string;
  remainingSeconds: number;
  isExpired: boolean;
};

export type OfferDisplayPricing = {
  regularPrice: number;
  promoPrice: number;
  chargePrice: number;
  showPromo: boolean;
  isExpired: boolean;
};

const WINDOW_SLACK_SECONDS = 60;

export function resolveOfferTimer(input: {
  nowMs: number;
  durationSeconds: number;
  storedExpiresAt: string | null | undefined;
}): OfferTimerState {
  const durationMs = Math.max(1, input.durationSeconds) * 1000;
  const parsed = parseExpiresAtMs(input.storedExpiresAt);
  const expiresAtMs = parsed ?? input.nowMs + durationMs;
  const remainingMs = expiresAtMs - input.nowMs;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    remainingSeconds,
    isExpired: remainingSeconds <= 0,
  };
}

export function parseExpiresAtMs(
  value: string | null | undefined,
): number | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function isOfferWindowActive(input: {
  nowMs: number;
  durationSeconds: number;
  expiresAt: string | null | undefined;
}): boolean {
  const expiresAtMs = parseExpiresAtMs(input.expiresAt);

  if (expiresAtMs == null) {
    return true;
  }

  if (expiresAtMs <= input.nowMs) {
    return false;
  }

  const maxFutureMs =
    input.nowMs + (input.durationSeconds + WINDOW_SLACK_SECONDS) * 1000;

  if (expiresAtMs > maxFutureMs) {
    return false;
  }

  return true;
}

export function resolveOfferDisplayPricing(input: {
  regularPrice: number;
  promoPrice: number;
  nowMs: number;
  durationSeconds: number;
  expiresAt: string | null | undefined;
}): OfferDisplayPricing {
  const regularPrice = Math.floor(input.regularPrice);
  const promoPrice = Math.floor(input.promoPrice);
  const isExpired = !isOfferWindowActive({
    nowMs: input.nowMs,
    durationSeconds: input.durationSeconds,
    expiresAt: input.expiresAt,
  });

  const promoUsable =
    !isExpired &&
    promoPrice > 0 &&
    regularPrice > 0 &&
    promoPrice < regularPrice;

  return {
    regularPrice,
    promoPrice,
    chargePrice: promoUsable ? promoPrice : regularPrice,
    showPromo: promoUsable,
    isExpired,
  };
}

export function resolveOfferChargeRubles(input: {
  regularPrice: number;
  promoPrice: number;
  nowMs: number;
  durationSeconds: number;
  expiresAt: string | null | undefined;
}): number {
  return resolveOfferDisplayPricing(input).chargePrice;
}

export function formatTimerMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function interpolateCtaText(ctaText: string, priceLabel: string): string {
  return ctaText.replaceAll("{price}", priceLabel);
}
