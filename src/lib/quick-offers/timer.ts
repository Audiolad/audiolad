import { resolveOfferTimer } from "@/lib/quick-offers/pricing";

export const QUICK_OFFER_TIMER_COOKIE_PREFIX = "al_qo_";
export const QUICK_OFFER_TIMER_STORAGE_PREFIX = "al_qo_";

const issuedExpiresAt = new Map<string, string>();

function issuedKey(offerId: string, durationSeconds: number): string {
  return `${offerId}:${durationSeconds}`;
}

export function buildOfferTimerCookieName(offerId: string): string {
  return `${QUICK_OFFER_TIMER_COOKIE_PREFIX}${offerId}`;
}

export function buildOfferTimerStorageKey(
  offerId: string,
  durationSeconds: number,
): string {
  return `${QUICK_OFFER_TIMER_STORAGE_PREFIX}${offerId}_${durationSeconds}`;
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
  storageKey: string;
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
    storageKey: buildOfferTimerStorageKey(input.offerId, input.durationSeconds),
  };
}

export function readBrowserOfferExpiresAt(
  offerId: string,
  durationSeconds: number,
): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = buildOfferTimerStorageKey(offerId, durationSeconds);

  try {
    const fromStorage = window.localStorage.getItem(storageKey);
    if (fromStorage) {
      return fromStorage;
    }
  } catch {
    // localStorage can be unavailable; fall through to cookie.
  }

  const cookieName = buildOfferTimerCookieName(offerId);
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));

  if (!match) {
    return null;
  }

  return decodeURIComponent(match.slice(cookieName.length + 1));
}

export function rememberIssuedOfferExpiresAt(
  offerId: string,
  durationSeconds: number,
  expiresAt: string,
): void {
  issuedExpiresAt.set(issuedKey(offerId, durationSeconds), expiresAt);
}

export function readIssuedOfferExpiresAt(
  offerId: string,
  durationSeconds: number,
): string | null {
  return issuedExpiresAt.get(issuedKey(offerId, durationSeconds)) ?? null;
}

export function writeBrowserOfferExpiresAt(input: {
  offerId: string;
  durationSeconds: number;
  expiresAt: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = buildOfferTimerStorageKey(
    input.offerId,
    input.durationSeconds,
  );
  const cookieName = buildOfferTimerCookieName(input.offerId);
  const maxAge = 60 * 60 * 24 * 30;

  try {
    window.localStorage.setItem(storageKey, input.expiresAt);
  } catch {
    // Ignore quota / private mode.
  }

  document.cookie = `${cookieName}=${encodeURIComponent(input.expiresAt)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}
