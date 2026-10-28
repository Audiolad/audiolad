import "server-only";

import { cookies } from "next/headers";

import { BUSINESS_POINT_COOKIE, isPointToken } from "@/lib/business-app/point-session";
import { createClient } from "@/lib/supabase/server";

/** True only when this browser holds a live venue-device cookie. */
export async function businessPointSessionAlive(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(BUSINESS_POINT_COOKIE)?.value;
  if (!isPointToken(token)) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("business_point_session_alive", { p_token: token });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
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
