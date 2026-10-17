import "server-only";

import { cookies, headers } from "next/headers";

import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  createGuestCoffeeToken,
  guestCoffeeCookieOptions,
  guestCoffeeNetworkHash,
  GUEST_COFFEE_COOKIE_NAME,
  hashGuestCoffeeToken,
  isGuestCoffeeToken,
} from "./identity";

/**
 * a8240527 — server side of the guest listening meter (table business_guest_listening,
 * migration 20270108120000). Every function fails closed: on any DB error (e.g. the
 * migration is not applied yet) it returns null and the cabinet says honestly that guest
 * listening is temporarily unavailable — it never plays without counting.
 */

function hashSecret(): string | null {
  // Dedicated secret when configured; otherwise the server-only service key (never sent anywhere).
  return process.env.BUSINESS_GUEST_HASH_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

/** nginx sets X-Real-IP = $remote_addr; getTrustedClientIp never trusts the leftmost XFF hop. */
function networkFrom(request: Request | null, h: Headers): string | null {
  const ip = request ? getTrustedClientIp(request) : getTrustedClientIp(new Request("http://local", { headers: h }));
  return guestCoffeeNetworkHash({ ip, secret: hashSecret() });
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
      p_ip_hash: networkFrom(null, h),
    });
    if (error || typeof data !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

async function deviceToken(): Promise<string> {
  const store = await cookies();
  let token = store.get(GUEST_COFFEE_COOKIE_NAME)?.value;
  if (!isGuestCoffeeToken(token)) {
    token = createGuestCoffeeToken();
    const o = guestCoffeeCookieOptions(process.env.NODE_ENV === "production");
    store.set(o.name, token, { httpOnly: o.httpOnly, sameSite: o.sameSite, secure: o.secure, path: o.path, maxAge: o.maxAge });
  }
  return token;
}

async function callMeter(
  fn: "business_guest_listening_issue" | "business_guest_listening_report",
  request: Request,
  extra: Record<string, number>,
): Promise<number | null> {

  try {
    const token = await deviceToken();
    const db = createServiceRoleClient();
    const { data, error } = await db.rpc(fn, {
      p_device_hash: hashGuestCoffeeToken(token),
      p_ip_hash: networkFrom(request, request.headers),
      ...extra,
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

/**
 * Route handlers only, before signing a stream URL: settles the previous playback lease
 * on the server (charged without any client report) and opens a new one for this track
 * unless the limit is used up. Returns the effective used seconds, or null = unavailable.
 */
export function issueGuestCoffeeLease(request: Request, trackSeconds: number): Promise<number | null> {
  return callMeter("business_guest_listening_issue", request, { p_track_seconds: Math.round(trackSeconds) });
}

/** Route handlers only: report actual playback of the open lease (cumulative, clamped on the server). */
export function reportGuestCoffeePlayback(request: Request, seconds: number): Promise<number | null> {
  return callMeter("business_guest_listening_report", request, { p_seconds: seconds });
}
