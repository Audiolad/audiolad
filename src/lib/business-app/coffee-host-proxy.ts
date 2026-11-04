import type { NextResponse, NextRequest } from "next/server";
import { hostnameFromHeaders, serialize } from "@/lib/supabase/cookie-domain";
import { BUSINESS_HOSTNAME, isBusinessHostname } from "./host";
import {
  COFFEE_TEST_RESET_ARM_COOKIE, COFFEE_TEST_RESET_PUBLIC_PATH, COFFEE_TEST_SERVER_COOKIES,
} from "@/lib/admin/coffee-test-reset/model";
import { COFFEE_HANDOFF_COOKIE, SHARED_GUEST_COFFEE_COOKIE, selectGuestToken, sharedGuestOptions } from "./guest-coffee/shared-identity";

/**
 * Appends raw Set-Cookie lines. Never use `response.cookies.set()` here: it re-serializes
 * Next's cookie map and drops the raw lines `updateSession()` appended (legacy host-only
 * auth expiries, the `al-auth-scope` marker, refresh writes) – that caused a 307 loop.
 */
export function migrateCoffeeGuestCookie(request: NextRequest, response: NextResponse): NextResponse {
  const hostname = hostnameFromHeaders(request.headers);
  if (request.nextUrl.pathname === COFFEE_TEST_RESET_PUBLIC_PATH && isBusinessHostname(hostname)) {
    response.headers.set("Cache-Control", "private, no-store");
    return request.cookies.get(COFFEE_TEST_RESET_ARM_COOKIE)?.value === "1"
      ? expireCoffeeTestCookies(hostname, response) : response;
  }
  const options = sharedGuestOptions(hostname);
  if (!options || hostname !== BUSINESS_HOSTNAME) return response;
  const token = selectGuestToken(request.cookies.get(SHARED_GUEST_COFFEE_COOKIE)?.value,
    request.cookies.get("al_biz_guest")?.value);
  if (token && request.cookies.get(SHARED_GUEST_COFFEE_COOKIE)?.value !== token) {
    response.headers.append("set-cookie", serialize(SHARED_GUEST_COFFEE_COOKIE, token, options));
  }
  if (request.nextUrl.pathname === "/coffee-handoff") {
    response.headers.append("set-cookie", serialize(COFFEE_HANDOFF_COOKIE, "1", options));
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

/**
 * /test-reset (owner coffee test-account reset, armed by its marker cookie): expire the guest meter, point and view
 * cookies of this host – both the host-only twin and the .audiolad.ru copy – and never
 * re-migrate a legacy guest token on this response.
 */
function expireCoffeeTestCookies(hostname: string, response: NextResponse): NextResponse {
  const shared = sharedGuestOptions(hostname);
  for (const name of [...COFFEE_TEST_SERVER_COOKIES, COFFEE_TEST_RESET_ARM_COOKIE]) {
    response.headers.append("set-cookie", serialize(name, "", { path: "/", maxAge: 0, expires: new Date(0), httpOnly: true, sameSite: "lax" }));
    if (shared?.domain) {
      response.headers.append("set-cookie", serialize(name, "", { ...shared, maxAge: 0, expires: new Date(0) }));
    }
  }
  return response;
}
