import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { BUSINESS_POINT_COOKIE, isPointToken } from "@/lib/business-app/point-session";
import { createClient } from "@/lib/supabase/server";

/**
 * The venue-device cookie of this browser: none, alive, revoked (or expired), or unknown when the
 * check itself failed. One RPC per request.
 */
export type BusinessPointDeviceStatus = "none" | "alive" | "revoked" | "unknown";

export const businessPointDeviceStatus = cache(async function businessPointDeviceStatus(): Promise<BusinessPointDeviceStatus> {
  const jar = await cookies();
  const token = jar.get(BUSINESS_POINT_COOKIE)?.value;
  if (!isPointToken(token)) return "none";
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("business_point_session_alive", { p_token: token });
    if (error || typeof data !== "boolean") return "unknown";
    return data ? "alive" : "revoked";
  } catch {
    return "unknown";
  }
});

/** True only when this browser holds a live venue-device cookie (player reports, device screens). */
export async function businessPointSessionAlive(): Promise<boolean> {
  return (await businessPointDeviceStatus()) === "alive";
}

/**
 * Guards fail closed: a device cookie that could not be checked counts as the hall device, so a
 * failed lookup never turns a hall browser with an old owner session into the owner cabinet.
 */
export async function businessHallDeviceCookie(): Promise<boolean> {
  const status = await businessPointDeviceStatus();
  return status === "alive" || status === "unknown";
}

/** Atmosphere permission for this device. Missing row stays allowed. */
export async function loadPointDevicePermission(): Promise<{ locationId: string; pointCanEdit: boolean } | null> {
  const jar = await cookies();
  const token = jar.get(BUSINESS_POINT_COOKIE)?.value;
  if (!isPointToken(token)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_business_point_sound_settings", { p_token: token });
    const row = data as { ok?: boolean; location_id?: unknown; point_can_edit_settings?: unknown } | null;
    if (error || !row || row.ok !== true || typeof row.location_id !== "string") return null;
    return { locationId: row.location_id, pointCanEdit: row.point_can_edit_settings !== false };
  } catch {
    return null;
  }
}
