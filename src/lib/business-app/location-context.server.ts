import "server-only";
import { cookies } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import { BUSINESS_LOCATION_COOKIE, selectBusinessLocation } from "./location-selection";
import { loadBusinessPilotSlots } from "./pilot-slots";

/** Membership-scoped selection only: no owner health/live, zone or offer RPCs. */
export async function loadBusinessLocationContext(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ locationId: string | null; pilotSlots: boolean }> {
  const { data: memberships, error: membershipError } = await db.from("business_organization_members")
    .select("organization_id").eq("user_id", userId).order("created_at", { ascending: true }).limit(1);
  if (membershipError) throw new Error("business_location_membership_read_failed");
  const organizationId = memberships?.[0]?.organization_id;
  if (!organizationId) return { locationId: null, pilotSlots: false };
  const pilotSlots = await loadBusinessPilotSlots(db, organizationId);
  const { data: locations, error: locationError } = await db.from("business_locations")
    .select("id, status").eq("organization_id", organizationId)
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  if (locationError) throw new Error("business_location_read_failed");
  const selected = selectBusinessLocation(locations ?? [], pilotSlots ? (await cookies()).get(BUSINESS_LOCATION_COOKIE)?.value : undefined);
  return { locationId: selected?.id ?? null, pilotSlots };
}
