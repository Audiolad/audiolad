import "server-only";

import { cookies } from "next/headers";

import type { BusinessChromeAccess } from "@/lib/access-grants/access-line";
import { BUSINESS_NO_ACCESS } from "@/lib/access-grants/access-line";
import { hashAccessEmail } from "@/lib/access-grants/email-hash";
import { peekBusinessAccessFor } from "@/lib/access-grants/peek.server";
import { isEmailConfirmed } from "@/lib/access-grants/policy";
import type { PointDeviceVenue } from "@/lib/business-app/point-device";
import { BUSINESS_POINT_COOKIE, isPointToken } from "@/lib/business-app/point-session";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * The venue this browser is paired with, from the `al-point` device session only.
 * The signed-in account (if any) plays no part. Revoked session, inactive venue or any
 * read failure gives null.
 */
export async function loadPointDeviceVenue(): Promise<PointDeviceVenue | null> {
  const jar = await cookies();
  const token = jar.get(BUSINESS_POINT_COOKIE)?.value;
  if (!isPointToken(token)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_business_point_sound_settings", { p_token: token });
    const row = data as { ok?: boolean; location_id?: unknown } | null;
    if (error || !row || row.ok !== true || typeof row.location_id !== "string") return null;
    const db = createServiceRoleClient();
    const { data: location, error: locationError } = await db
      .from("business_locations")
      .select("id, organization_id, name, status")
      .eq("id", row.location_id)
      .maybeSingle();
    const loc = location as { id?: unknown; organization_id?: unknown; name?: unknown; status?: unknown } | null;
    if (locationError || !loc || loc.status !== "active") return null;
    if (typeof loc.id !== "string" || typeof loc.organization_id !== "string") return null;
    return {
      locationId: loc.id,
      organizationId: loc.organization_id,
      locationName: typeof loc.name === "string" && loc.name.trim() ? loc.name.trim() : "Кофейня",
    };
  } catch {
    return null;
  }
}

/**
 * The venue owner's gift or paid period, read-only (never issues a gift, never writes).
 * The device plays under the venue's access, not under the account signed in on it.
 */
export async function loadPointDeviceAccess(venue: PointDeviceVenue, now: Date = new Date()): Promise<BusinessChromeAccess> {
  try {
    const db = createServiceRoleClient();
    const { data: owners, error } = await db
      .from("business_organization_members")
      .select("user_id, created_at")
      .eq("organization_id", venue.organizationId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1);
    const ownerId = !error && Array.isArray(owners) ? (owners[0] as { user_id?: unknown } | undefined)?.user_id : null;
    if (typeof ownerId !== "string") return BUSINESS_NO_ACCESS;
    const { data: owner } = await db.auth.admin.getUserById(ownerId);
    const user = owner?.user ?? null;
    if (!user || !isEmailConfirmed(user)) return BUSINESS_NO_ACCESS;
    return await peekBusinessAccessFor({ userId: ownerId, emailHash: hashAccessEmail(user.email) ?? null }, now);
  } catch {
    return BUSINESS_NO_ACCESS;
  }
}
