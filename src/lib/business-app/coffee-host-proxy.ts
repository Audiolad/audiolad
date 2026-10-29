import { NextResponse, type NextRequest } from "next/server";
import { hostnameFromHeaders } from "@/lib/supabase/cookie-domain";
import { BUSINESS_HOSTNAME, BUSINESS_ORIGIN, COFFEE_HOSTNAME } from "./host";
import { COFFEE_HANDOFF_COOKIE, SHARED_GUEST_COFFEE_COOKIE, selectGuestToken, sharedGuestOptions } from "./guest-coffee/shared-identity";

/** Called only after the host/path allowlist accepts a cabinet route. */
export function coffeeHandoffRedirect(request: NextRequest): NextResponse | null {
  const hostname = hostnameFromHeaders(request.headers);
  if (hostname !== COFFEE_HOSTNAME || !sharedGuestOptions(hostname) ||
      request.method !== "GET" || request.cookies.has(COFFEE_HANDOFF_COOKIE)) return null;
  const target = new URL("/coffee-handoff", BUSINESS_ORIGIN);
  target.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function migrateCoffeeGuestCookie(request: NextRequest, response: NextResponse): NextResponse {
  const hostname = hostnameFromHeaders(request.headers);
  const options = sharedGuestOptions(hostname);
  if (!options || hostname !== BUSINESS_HOSTNAME) return response;
  const token = selectGuestToken(request.cookies.get(SHARED_GUEST_COFFEE_COOKIE)?.value,
    request.cookies.get("al_biz_guest")?.value);
  if (token && request.cookies.get(SHARED_GUEST_COFFEE_COOKIE)?.value !== token) {
    response.cookies.set(SHARED_GUEST_COFFEE_COOKIE, token, options);
  }
  if (request.nextUrl.pathname === "/coffee-handoff") {
    response.cookies.set(COFFEE_HANDOFF_COOKIE, "1", options);
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
