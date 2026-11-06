import "server-only";

import { pilotLocationAccessPeriods } from "../location-access.server";

import type { GrantRow } from "@/lib/access-grants/policy";
import { hashAccessEmail } from "@/lib/access-grants/email-hash";
import { peekAccessPeriodsWith } from "@/lib/access-grants/peek-closure";
import { createPeekReader } from "@/lib/access-grants/peek-reader.server";
import { isVenueLicencePublicId } from "@/lib/business-app/host";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { presentVenueLicence, type PaidWindow, type VenueLicenceView, type VenuePlaceFields } from "./present";

/**
 * Public card for one location.
 * Name and address come from business_locations (name, address_line1/2, city,
 * region, postal_code). address_line1 is the owner-edited street address (P1-12).
 * The clock is the organization owner's gift / payment. The view drops the user id.
 */

type Db = ReturnType<typeof createServiceRoleClient>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}


export async function loadVenueLicenceView(publicId: string, now: Date = new Date()): Promise<VenueLicenceView | null> {
  if (!isVenueLicencePublicId(publicId)) return null;
  const db = createServiceRoleClient();
  const { data: location, error } = await db
    .from("business_locations")
    .select("id, organization_id, name, address_line1, address_line2, city, region, postal_code, licence_public_id")
    .eq("licence_public_id", publicId)
    .maybeSingle();
  if (error) throw new Error("venue_licence_unavailable");
  if (!location?.id || !location.organization_id) return null;

  const place: VenuePlaceFields = {
    locationName: asString(location.name) ?? "",
    addressLine1: asString(location.address_line1),
    addressLine2: asString(location.address_line2),
    city: asString(location.city),
    region: asString(location.region),
    postalCode: asString(location.postal_code),
  };

  const { data: owners, error: ownerError } = await db
    .from("business_organization_members")
    .select("user_id")
    .eq("organization_id", location.organization_id)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1);
  if (ownerError) throw new Error("venue_licence_unavailable");
  const ownerId = asString(owners?.[0]?.user_id);

  let grant: GrantRow | null = null;
  let paidUntil: string | null = null;
  let paidPeriod: PaidWindow | null = null;
  if (ownerId) {
    const { data: owner, error: authError } = await db.auth.admin.getUserById(ownerId);
    if (authError || !owner.user) throw new Error("venue_licence_unavailable");
    ({ grant, paidUntil } = await peekAccessPeriodsWith(createPeekReader(db), {
      userId: ownerId,
      emailHash: hashAccessEmail(owner.user.email),
    }));

    const scoped = await pilotLocationAccessPeriods(location.id, { userId: ownerId, emailHash: hashAccessEmail(owner.user.email) });
    if (scoped) ({ grant, paidUntil } = scoped);

    const { data: periods, error: periodError } = await db
      .from("business_subscription_periods")
      .select("period_start, period_end")
      .eq("user_id", ownerId)
      .eq("opens_access", true)
      .order("period_end", { ascending: false })
      .limit(5);
    if (periodError) throw new Error("venue_licence_unavailable");
    if (paidUntil) {
      const match = (periods ?? []).find((period) => {
        const end = asString(period.period_end);
        const start = asString(period.period_start);
        return Boolean(start && end && Math.abs(Date.parse(end) - Date.parse(paidUntil as string)) < 1000);
      });
      if (match) paidPeriod = { start: match.period_start, end: match.period_end };
    }
  }

  return presentVenueLicence({
    publicId,
    place,
    now,
    grant,
    paidUntil,
    paidPeriod,
  });
}
