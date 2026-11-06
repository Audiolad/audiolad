import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Read only after membership-scoped organization selection. No charge or trial writes. */
export async function loadPilotBillingSummary(organizationId: string, activeIds: string[]) {
  const db = createServiceRoleClient();
  const reads = await Promise.all(activeIds.map((locationId) =>
    db.rpc("business_venue_paid_until", { p_organization_id: organizationId, p_location_id: locationId })));
  if (reads.some((read) => read.error)) return { paidUntil: null, renewalBlocked: true };
  const ends = reads.map((read) => typeof read.data === "string" ? read.data : null);
  const now = Date.now();
  const paid = ends.filter((end): end is string => end !== null);
  const paidUntil = paid.length ? paid.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;
  const current = ends.map((end) => end !== null && Date.parse(end) > now);
  // A hall without a current period cannot be added mid-period; it joins at the next renewal.
  return { paidUntil, renewalBlocked: current.some(Boolean) && current.some((covered) => !covered) };
}
