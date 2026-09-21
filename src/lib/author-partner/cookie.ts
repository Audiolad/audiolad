import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

import {
  AUTHOR_PARTNER_ATTRIBUTION_COOKIE,
  AUTHOR_PARTNER_ATTRIBUTION_COOKIE_PATH,
  AUTHOR_PARTNER_ATTRIBUTION_MAX_AGE_SECONDS,
} from "./constants";

export function buildPartnerAttributionCookieOptions(token: string): {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    name: AUTHOR_PARTNER_ATTRIBUTION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: AUTHOR_PARTNER_ATTRIBUTION_COOKIE_PATH,
    maxAge: AUTHOR_PARTNER_ATTRIBUTION_MAX_AGE_SECONDS,
  };
}

/** Expire the attribution cookie with the same path used at set time. */
export function buildPartnerAttributionCookieClearOptions(): {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: 0;
} {
  return {
    name: AUTHOR_PARTNER_ATTRIBUTION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: AUTHOR_PARTNER_ATTRIBUTION_COOKIE_PATH,
    maxAge: 0,
  };
}

export type PartnerAttributionCookieWrite = ReturnType<
  typeof buildPartnerAttributionCookieOptions
>;

export type PartnerAttributionCookieClear = ReturnType<
  typeof buildPartnerAttributionCookieClearOptions
>;

type CookieBag = {
  set: (
    cookie:
      | ResponseCookie
      | PartnerAttributionCookieWrite
      | PartnerAttributionCookieClear,
  ) => void;
};

/** Apply opaque attribution cookie onto a NextResponse-like cookie bag. */
export function applyPartnerAttributionCookie(
  cookieStore: CookieBag,
  token: string,
): void {
  cookieStore.set(buildPartnerAttributionCookieOptions(token));
}

/** Remove attribution cookie (path=/). Safe no-op if absent. */
export function clearPartnerAttributionCookie(cookieStore: CookieBag): void {
  cookieStore.set(buildPartnerAttributionCookieClearOptions());
}

/**
 * Cookie may be set only for anonymous first-touch `created`.
 * Authenticated immediate `bound` must never leave a 60-day ghost cookie —
 * author_referrals is already the source of truth.
 */
export function shouldSetPartnerAttributionCookie(input: {
  result: string;
  cookieShouldSet?: boolean;
  attributionId?: string | null;
}): boolean {
  if (
    input.result === "bound" ||
    input.result === "bound_and_activated" ||
    input.result === "already_bound" ||
    input.result === "already_bound_activated" ||
    input.result === "preserved_first_touch" ||
    input.result === "preserved_first_touch_activated" ||
    input.result === "referral_already_activated" ||
    input.result === "already_author"
  ) {
    return false;
  }
  if (input.cookieShouldSet === true) {
    return true;
  }
  if (input.result === "created") {
    return true;
  }
  return false;
}

const CLEAR_ON_SUCCESS = new Set([
  "bound",
  "bound_and_activated",
  "already_bound",
  "already_bound_activated",
  "preserved_first_touch",
  "preserved_first_touch_activated",
  "referral_already_activated",
  "already_author",
]);

const CLEAR_ON_ERROR = new Set([
  "attribution_expired",
  "attribution_not_found",
  "attribution_bound_elsewhere",
  "self_referral",
  "invalid_token",
  "not_found",
  "no_token",
]);

const KEEP_ON_ERROR = new Set(["claim_failed", "touch_failed"]);

/**
 * After claim / authenticated touch: drop cookie when user-level SoT exists
 * or the cookie is permanently unusable. Keep on transient claim_failed so
 * the next authenticated action can retry.
 */
export function shouldClearPartnerAttributionCookie(input: {
  ok: boolean;
  result?: string | null;
  error?: string | null;
}): boolean {
  if (input.ok) {
    return CLEAR_ON_SUCCESS.has(input.result ?? "");
  }
  const error = input.error ?? "";
  if (KEEP_ON_ERROR.has(error)) {
    return false;
  }
  return CLEAR_ON_ERROR.has(error);
}
