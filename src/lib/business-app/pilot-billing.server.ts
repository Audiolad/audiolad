import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Read only after membership-scoped organization selection. No charge or trial writes. */
export async function loadPilotBillingSummary(organizationId: string, activeIds: string[]) {
  const db = createServiceRoleClient();
  const { data: scopes, error } = await db.from("business_subscription_order_scopes")
    .select("order_id, location_ids").eq("organization_id", organizationId);
  if (error) return { paidUntil: null, renewalBlocked: true };
  if (!scopes?.length) return { paidUntil: null, renewalBlocked: false };
  const { data: periods, error: periodError } = await db.from("business_subscription_periods")
    .select("order_id, period_end").in("order_id", scopes.map((s) => s.order_id)).eq("opens_access", true);
  if (periodError) return { paidUntil: null, renewalBlocked: true };
  const current = (periods ?? []).filter((p) => new Date(p.period_end).getTime() > Date.now());
  const paidUntil = (periods ?? []).map((p) => p.period_end as string).sort().at(-1) ?? null;
  const covered = new Set(scopes.filter((s) => current.some((p) => p.order_id === s.order_id))
    .flatMap((s) => s.location_ids as string[]));
  return { paidUntil, renewalBlocked: current.length > 0 && activeIds.some((id) => !covered.has(id)) };
}
