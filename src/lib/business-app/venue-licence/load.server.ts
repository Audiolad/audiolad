import "server-only";

import { BUSINESS_NEW_CLIENT_GRANT_KIND, type GrantRow } from "@/lib/access-grants/policy";
import { isVenueLicencePublicId } from "@/lib/business-app/host";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { presentVenueLicence, type PaidWindow, type VenueLicenceView, type VenuePlaceFields } from "./present";

/**
 * Public card for one location.
 * Name and address come from business_locations (name, address_line1/2, city,
 * region, postal_code). If task ff4b8a16 has added venue_name and venue_address,
 * those win. The branch was not on origin when this was written.
 * The clock is the organization owner's gift / payment. The view drops the user id.
 */

type Db = ReturnType<typeof createServiceRoleClient>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function registrationPlace(db: Db, locationId: string): Promise<Pick<VenuePlaceFields, "venueName" | "venueAddress">> {
  const { data, error } = await db
    .from("business_locations")
    .select("venue_name, venue_address")
    .eq("id", locationId)
    .maybeSingle();
  if (error || !data) return {};
  return {
    venueName: asString(data.venue_name),
    venueAddress: asString(data.venue_address),
  };
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

  const extra = await registrationPlace(db, location.id);
  const place: VenuePlaceFields = {
    locationName: asString(location.name) ?? "",
    venueName: extra.venueName,
    venueAddress: extra.venueAddress,
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
    const { data: grants, error: grantError } = await db
      .from("access_grants")
      .select("email_hash, user_id, kind, starts_at, ends_at")
      .eq("user_id", ownerId)
      .eq("kind", BUSINESS_NEW_CLIENT_GRANT_KIND)
      .limit(1);
    if (grantError) throw new Error("venue_licence_unavailable");
    const row = grants?.[0];
    if (row && asString(row.starts_at) && asString(row.ends_at) && asString(row.user_id) && asString(row.email_hash)) {
      grant = {
        emailHash: row.email_hash,
        userId: row.user_id,
        kind: BUSINESS_NEW_CLIENT_GRANT_KIND,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      };
    }

    const { data: paidRows, error: paidError } = await db
      .from("access_paid_periods")
      .select("paid_until")
      .eq("user_id", ownerId)
      .eq("kind", BUSINESS_NEW_CLIENT_GRANT_KIND);
    if (paidError) throw new Error("venue_licence_unavailable");
    for (const paid of paidRows ?? []) {
      const stamp = asString(paid.paid_until);
      if (!stamp) continue;
      if (!paidUntil || Date.parse(stamp) > Date.parse(paidUntil)) paidUntil = stamp;
    }

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
