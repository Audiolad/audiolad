import { getSupabaseCookieOptions } from "@/lib/supabase/cookie-domain";
import { coffeeHostEnabled } from "../host";

// A distinct name prevents ambiguous legacy host-only/shared cookie twins.
export const SHARED_GUEST_COFFEE_COOKIE = "al_biz_guest_shared";
export const COFFEE_HANDOFF_COOKIE = "al_coffee_handoff";
export const validGuestToken = (value: string | undefined): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

export function sharedGuestOptions(hostname: string) {
  if (!coffeeHostEnabled()) return undefined;
  const options = getSupabaseCookieOptions(hostname);
  return options.domain ? { ...options, httpOnly: true, sameSite: "lax" as const,
    path: "/", maxAge: 365 * 24 * 60 * 60 } : undefined;
}

export function selectGuestToken(shared: string | undefined, legacy: string | undefined): string | undefined {
  return validGuestToken(shared) ? shared : validGuestToken(legacy) ? legacy : undefined;
}

/** Fixed first-party destination; never accept a user-supplied origin. */
export function coffeeReturnPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !/[\\\r\n]/.test(value) ? value : "/";
}
