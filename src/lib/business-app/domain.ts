import { loadPilotBillingSummary } from "./pilot-billing.server";
import { loadBusinessVenueSlots } from "./pilot-slots";
import { cookies } from "next/headers";
import { BUSINESS_LOCATION_COOKIE, selectBusinessLocation } from "./location-selection";
import { createClient } from "@/lib/supabase/server";

import { extractBusinessFirstName } from "@/lib/business-app/domain-identity";
import { loadBusinessOwnerHomeSignals } from "@/lib/business-app/load-owner-home-signals";
import { businessHallDeviceLocked } from "@/lib/business-app/cabinet-mode.server";
import type { BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";
import { ownerCanPayFromThisBrowser } from "@/lib/business/subscription-checkout";
import { hasAcceptedCurrentBusinessOffer } from "@/lib/business/offer";

export { extractBusinessFirstName, extractBusinessLastName } from "@/lib/business-app/domain-identity";
export type { BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";

export type BusinessDomainLocation = {
  id: string;
  organizationId: string;
  name: string;
  /** Street address for the licence / QR. Null until the owner saves it. */
  addressLine1: string | null;
  businessCategory: string;
  countryCode: string;
  timezone: string;
  status: string;
  defaultZoneId: string | null;
};

export type BusinessDomainOwner = {
  userId: string;
  firstName: string;
};

export type BusinessOwnerHomeContext =
  | { status: "anonymous" }
  | {
      status: "authenticated";
      owner: BusinessDomainOwner;
      location: BusinessDomainLocation | null;
      locations?: Array<{ id: string; name: string; status: string }>;
      /** More than one hall exists in the organization. */
      pilotSlots?: boolean;
      /** Same system limit for every organization (3 now); 1 hides the add button. */
      venueSlotLimit?: number;
      pilotBilling?: { paidUntil: string | null; renewalBlocked: boolean };
      organizationName: string | null;
      organizationId: string | null;
      /** True only for an organization owner. A manager and a venue device cannot pay. */
      canPay: boolean;
      /** Account-level B2B offer. One acceptance covers every point. */
      offerAccepted: boolean;
      /** Owner account without email (guest start): payment asks for an email for the receipt. */
      needsReceiptEmail?: boolean;
      /** Real player health / last-play projection for Owner Home chrome (P1-05). */
      signals: BusinessOwnerHomeSignals | null;
    };

/**
 * Reads the caller's first Organization membership + selected Location + default Zone
 * and (when org exists) A2 player health + latest business PoP for Home 🟢/🟡/🔴.
 * Expand-only read path. No mock fallback. No rights / ELIGIBLE invention.
 */
export async function loadBusinessOwnerHomeContext(): Promise<BusinessOwnerHomeContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "anonymous" };
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const firstName = extractBusinessFirstName({
    metadataFirstName:
      typeof meta.first_name === "string" ? meta.first_name : null,
    fullName: typeof meta.full_name === "string" ? meta.full_name : null,
    email: user.email ?? null,
  });

  const { data: membershipRows, error: membershipError } = await supabase
    .from("business_organization_members")
    .select("organization_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw new Error(
      `business_domain_membership_read_failed:${membershipError.message}`,
    );
  }

  const memberships = membershipRows ?? [];
  const membership = memberships[0] ?? null;
  const canPay = ownerCanPayFromThisBrowser(
    memberships.some((row) => row.role === "owner"),
    await businessHallDeviceLocked(),
  );
  let offerAccepted = false;
  if (canPay) {
    // The current edition of the договор-оферта, not any older acceptance.
    // A read error is an error, never «not accepted»: otherwise an owner who already
    // accepted would be asked for the same edition again.
    const { data: acceptance, error: acceptanceError } = await supabase.rpc("business_offer_edition_acceptances_for_caller");
    if (acceptanceError) {
      throw new Error(`business_domain_offer_read_failed:${acceptanceError.message}`);
    }
    offerAccepted = hasAcceptedCurrentBusinessOffer(acceptance);
  }
  const needsReceiptEmail = canPay && !(user.email?.trim() ?? "");

  if (!membership?.organization_id) {
    return {
      status: "authenticated",
      owner: { userId: user.id, firstName },
      location: null,
      organizationName: null,
      organizationId: null,
      canPay,
      offerAccepted,
      needsReceiptEmail,
      signals: null,
    };
  }

  const organizationId = membership.organization_id as string;

  const { data: org, error: orgError } = await supabase
    .from("business_organizations")
    .select("id, name, status")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgError) {
    throw new Error(`business_domain_org_read_failed:${orgError.message}`);
  }

  const venueSlots = await loadBusinessVenueSlots(supabase, organizationId);
  const pilotSlots = venueSlots.multiVenue;
  const venueSlotLimit = venueSlots.limit;

  const { data: locations, error: locationError } = await supabase
    .from("business_locations")
    .select(
      "id, organization_id, name, address_line1, business_category, country_code, timezone, status",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (locationError) {
    throw new Error(
      `business_domain_location_read_failed:${locationError.message}`,
    );
  }

  const pilotBilling = pilotSlots ? await loadPilotBillingSummary(organizationId, (locations ?? []).filter((l) => l.status === "active").map((l) => l.id)) : undefined;
  const location = selectBusinessLocation(locations ?? [], pilotSlots ? (await cookies()).get(BUSINESS_LOCATION_COOKIE)?.value : undefined);

  if (!location) {
    const signals = await loadBusinessOwnerHomeSignals({
      organizationId,
      locationId: null,
      userId: user.id,
    });
    return {
      status: "authenticated",
      owner: { userId: user.id, firstName },
      location: null,
      locations: locations ?? [],
      pilotSlots,
      venueSlotLimit,
      pilotBilling,
      organizationName: org?.name ?? null,
      organizationId,
      canPay,
      offerAccepted,
      needsReceiptEmail,
      signals,
    };
  }

  const { data: zone, error: zoneError } = await supabase
    .from("business_zones")
    .select("id, is_default")
    .eq("location_id", location.id)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (zoneError) {
    throw new Error(`business_domain_zone_read_failed:${zoneError.message}`);
  }

  const signals = await loadBusinessOwnerHomeSignals({
    organizationId,
    locationId: location.id,
    userId: user.id,
  });

  return {
    status: "authenticated",
    owner: { userId: user.id, firstName },
    locations: locations ?? [],
    pilotSlots,
    venueSlotLimit,
    pilotBilling,
    organizationName: org?.name ?? null,
    organizationId,
    canPay,
    offerAccepted,
    needsReceiptEmail,
    location: {
      id: location.id,
      organizationId: location.organization_id,
      name: location.name,
      addressLine1: typeof location.address_line1 === "string" && location.address_line1.trim()
        ? location.address_line1.trim()
        : null,
      businessCategory: location.business_category,
      countryCode: location.country_code,
      timezone: location.timezone,
      status: location.status,
      defaultZoneId: zone?.id ?? null,
    },
    signals,
  };
}
