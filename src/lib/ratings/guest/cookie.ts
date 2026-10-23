import "server-only";

import { NextResponse } from "next/server";

import {
  GUEST_RATING_COOKIE_NAME,
  guestRatingCookieOptions,
  signGuestRatingSession,
} from "@/lib/ratings/guest/session";

export function guestRatingCookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

export function withGuestRatingCookie(
  response: NextResponse,
  token: string,
  secure = guestRatingCookieSecure(),
): NextResponse {
  const options = guestRatingCookieOptions(secure);
  response.cookies.set({
    name: GUEST_RATING_COOKIE_NAME,
    value: token,
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    secure: options.secure,
    path: options.path,
    maxAge: options.maxAge,
  });
  return response;
}

export function clearGuestRatingCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: GUEST_RATING_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: guestRatingCookieSecure(),
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function signedGuestRatingCookie(
  guestId: string,
  issuedAtMs: number,
  secret: string,
): string {
  return signGuestRatingSession({ guestId, issuedAtMs }, secret);
}
