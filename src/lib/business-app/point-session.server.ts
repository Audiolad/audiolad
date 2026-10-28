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
