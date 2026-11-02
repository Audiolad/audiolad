import type { NextResponse, NextRequest } from "next/server";
import { hostnameFromHeaders, serialize } from "@/lib/supabase/cookie-domain";
import { BUSINESS_HOSTNAME } from "./host";
import { COFFEE_HANDOFF_COOKIE, SHARED_GUEST_COFFEE_COOKIE, selectGuestToken, sharedGuestOptions } from "./guest-coffee/shared-identity";

/**
 * Appends raw Set-Cookie lines. Never use `response.cookies.set()` here: it re-serializes
 * Next's cookie map and drops the raw lines `updateSession()` appended (legacy host-only
 * auth expiries, the `al-auth-scope` marker, refresh writes) – that caused a 307 loop.
 */
export function migrateCoffeeGuestCookie(request: NextRequest, response: NextResponse): NextResponse {
  const hostname = hostnameFromHeaders(request.headers);
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
