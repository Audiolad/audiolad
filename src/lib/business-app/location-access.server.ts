import "server-only";
import { loadBusinessPilotSlots } from "./pilot-slots";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { peekAccessPeriodsWith } from "@/lib/access-grants/peek-closure";
import { createPeekReader } from "@/lib/access-grants/peek-reader.server";
import { resolveCustomerAccess, type CustomerAccess, type GrantRow } from "@/lib/access-grants/policy";

/** Pilot shares the existing trial clock; one shared paid period covers only the immutable checkout venue list.
 * Never creates a trial or a payment. Legacy organizations keep the existing path.
 */
export async function pilotLocationAccessPeriods(locationId: string, principal: { userId: string; emailHash: string | null }): Promise<{ grant: GrantRow | null; paidUntil: string | null } | null> {
  const db = createServiceRoleClient();
  const { data: location, error } = await db.from("business_locations").select("organization_id").eq("id", locationId).single();
  if (error || !location) throw new Error("location_access_unavailable");
  if (!await loadBusinessPilotSlots(db, location.organization_id)) return null;
  const { grant } = await peekAccessPeriodsWith(createPeekReader(db), principal);
  const { data: bindings, error: bindingError } = await db.from("business_subscription_order_scopes")
    .select("order_id").eq("organization_id", location.organization_id).contains("location_ids", [locationId]);
  if (bindingError) throw new Error("location_payment_unavailable");
  let paidUntil: string | null = null;
  if (bindings?.length) {
    const { data: periods, error: periodError } = await db.from("business_subscription_periods")
      .select("period_end").in("order_id", bindings.map((b) => b.order_id)).eq("opens_access", true)
      .order("period_end", { ascending: false }).limit(1);
    if (periodError) throw new Error("location_payment_unavailable");
    paidUntil = periods?.[0]?.period_end ?? null;
  }
  return { grant, paidUntil };
}

export async function pilotLocationAccess(locationId: string, principal: { userId: string; emailHash: string | null }, now = new Date()): Promise<CustomerAccess | null> {
  const periods = await pilotLocationAccessPeriods(locationId, principal);
  return periods ? resolveCustomerAccess({ now, emailConfirmed: true, ...periods }) : null;
}
