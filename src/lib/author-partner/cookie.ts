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

export type PartnerAttributionCookieWrite = ReturnType<
  typeof buildPartnerAttributionCookieOptions
>;

/** Apply opaque attribution cookie onto a NextResponse-like cookie bag. */
export function applyPartnerAttributionCookie(
  cookieStore: { set: (cookie: ResponseCookie | PartnerAttributionCookieWrite) => void },
  token: string,
): void {
  cookieStore.set(buildPartnerAttributionCookieOptions(token));
}

/** Cookie may be set only when this opaque token has/creates a server attribution row. */
export function shouldSetPartnerAttributionCookie(input: {
  result: string;
  cookieShouldSet?: boolean;
  attributionId?: string | null;
}): boolean {
  if (input.cookieShouldSet === true) {
    return true;
  }
  if (input.result === "created") {
    return true;
  }
  if (input.result === "bound" && Boolean(input.attributionId)) {
    return true;
  }
  return false;
}
