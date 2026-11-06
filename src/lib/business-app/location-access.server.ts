import "server-only";
import { loadBusinessPilotSlots } from "./pilot-slots";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { peekAccessPeriodsWith } from "@/lib/access-grants/peek-closure";
import { createPeekReader } from "@/lib/access-grants/peek-reader.server";
import { resolveCustomerAccess, type CustomerAccess, type GrantRow } from "@/lib/access-grants/policy";

/** Halls share the owner's one trial clock; a paid period covers only the halls in its immutable
 * checkout list (an order paid before checkout lists existed covers the first hall only).
 * Never creates a trial or a payment. A single-hall organization keeps the existing path.
 */
export async function pilotLocationAccessPeriods(locationId: string, principal: { userId: string; emailHash: string | null }): Promise<{ grant: GrantRow | null; paidUntil: string | null } | null> {
  const db = createServiceRoleClient();
  const { data: location, error } = await db.from("business_locations").select("organization_id").eq("id", locationId).single();
  if (error || !location) throw new Error("location_access_unavailable");
  if (!await loadBusinessPilotSlots(db, location.organization_id)) return null;
  const { grant } = await peekAccessPeriodsWith(createPeekReader(db), principal);
  const { data: paidUntil, error: paidError } = await db.rpc("business_venue_paid_until", {
    p_organization_id: location.organization_id, p_location_id: locationId,
  });
  if (paidError) throw new Error("location_payment_unavailable");
  return { grant, paidUntil: typeof paidUntil === "string" ? paidUntil : null };
}

export async function pilotLocationAccess(locationId: string, principal: { userId: string; emailHash: string | null }, now = new Date()): Promise<CustomerAccess | null> {
  const periods = await pilotLocationAccessPeriods(locationId, principal);
  return periods ? resolveCustomerAccess({ now, emailConfirmed: true, ...periods }) : null;
}
