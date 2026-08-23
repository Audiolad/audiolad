import { resolveOfferTimer } from "@/lib/quick-offers/pricing";
import { buildOfferWindowCookieName } from "@/lib/quick-offers/offer-window-token";

export const QUICK_OFFER_TIMER_COOKIE_PREFIX = "al_qo_";

export function buildOfferTimerCookieName(offerId: string): string {
  return buildOfferWindowCookieName(offerId);
}

export function persistOfferTimer(input: {
  offerId: string;
  durationSeconds: number;
  storedExpiresAt?: string | null;
  nowMs?: number;
}): {
  expiresAt: string;
  remainingSeconds: number;
  isExpired: boolean;
  cookieName: string;
} {
  const nowMs = input.nowMs ?? Date.now();
  const timer = resolveOfferTimer({
    nowMs,
    durationSeconds: input.durationSeconds,
    storedExpiresAt: input.storedExpiresAt,
  });

  return {
    ...timer,
    cookieName: buildOfferTimerCookieName(input.offerId),
  };
}
