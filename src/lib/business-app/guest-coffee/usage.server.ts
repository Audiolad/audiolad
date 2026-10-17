import "server-only";

import { cookies, headers } from "next/headers";

import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  createGuestCoffeeToken,
  guestCoffeeCookieOptions,
  guestCoffeeFallbackHash,
  GUEST_COFFEE_COOKIE_NAME,
  hashGuestCoffeeToken,
  isGuestCoffeeToken,
} from "./identity";

/**
 * a8240527 — server side of the guest listening meter (table business_guest_listening,
 * migration 20270106120000). Every function fails closed: on any DB error (e.g. the
 * migration is not applied yet) it returns null and the cabinet says honestly that guest
 * listening is temporarily unavailable — it never plays without counting.
 */

function hashSecret(): string | null {
  // Dedicated secret when configured; otherwise the server-only service key (never sent anywhere).
  return process.env.BUSINESS_GUEST_HASH_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

function fallbackFrom(request: Request | null, h: Headers): string | null {
  const ip = request ? getTrustedClientIp(request) : getTrustedClientIp(new Request("http://local", { headers: h }));
  return guestCoffeeFallbackHash({ ip, userAgent: h.get("user-agent"), secret: hashSecret() });
}

/** First render: read-only, never creates a row or a cookie. */
export async function peekGuestCoffeeUsage(): Promise<number | null> {

  try {
    const store = await cookies();
    const h = await headers();
    const token = store.get(GUEST_COFFEE_COOKIE_NAME)?.value;
    const deviceHash = isGuestCoffeeToken(token) ? hashGuestCoffeeToken(token) : "0".repeat(64);
    const db = createServiceRoleClient();
    const { data, error } = await db.rpc("business_guest_listening_peek", {
      p_device_hash: deviceHash,
      p_fallback_hash: fallbackFrom(null, h),
    });
    if (error || typeof data !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Route handlers only: ensure the device cookie, credit actual playback seconds
 * (0 = just read) and return the total used seconds, or null when unavailable.
 */
export async function applyGuestCoffeeUsage(request: Request, creditSeconds: number): Promise<number | null> {

  try {
    const store = await cookies();
    let token = store.get(GUEST_COFFEE_COOKIE_NAME)?.value;
    if (!isGuestCoffeeToken(token)) {
      token = createGuestCoffeeToken();
      const o = guestCoffeeCookieOptions(process.env.NODE_ENV === "production");
      store.set(o.name, token, { httpOnly: o.httpOnly, sameSite: o.sameSite, secure: o.secure, path: o.path, maxAge: o.maxAge });
    }
    const db = createServiceRoleClient();
    const { data, error } = await db.rpc("business_guest_listening_apply", {
      p_device_hash: hashGuestCoffeeToken(token),
      p_fallback_hash: fallbackFrom(request, request.headers),
      p_credit_seconds: creditSeconds,
    });
    if (error || typeof data !== "number") {
      if (error) console.error("[business-guest-coffee] usage unavailable", error.code ?? "unknown");
      return null;
    }
    return data;
  } catch (error) {
    console.error("[business-guest-coffee] usage error", error instanceof Error ? error.name : "unknown");
    return null;
  }
}
