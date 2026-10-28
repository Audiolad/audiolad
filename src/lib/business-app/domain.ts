import { createClient } from "@/lib/supabase/server";

import { extractBusinessFirstName } from "@/lib/business-app/domain-identity";
import { loadBusinessOwnerHomeSignals } from "@/lib/business-app/load-owner-home-signals";
import { businessPointSessionAlive } from "@/lib/business-app/point-session.server";
import type { BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";
import { ownerCanPayFromThisBrowser } from "@/lib/business/subscription-checkout";
import type { BusinessRenewalAnswer } from "@/lib/business/renewal-choice";

export { extractBusinessFirstName } from "@/lib/business-app/domain-identity";
export type { BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";

export type BusinessDomainLocation = {
  id: string;
  organizationId: string;
  name: string;
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
      organizationName: string | null;
      organizationId: string | null;
      /** True only for an organization owner. A manager and a venue device cannot pay. */
      canPay: boolean;
      /** Account-level B2B offer. One acceptance covers every point. */
      offerAccepted: boolean;
      /** This browser is the paired hall device. */
      venueDevice?: boolean;
      /** «Нет» for the current contractual end. Null when unset or not loaded. */
      renewalAnswer?: BusinessRenewalAnswer | null;
      /** Real player health / last-play projection for Owner Home chrome (P1-05). */
      signals: BusinessOwnerHomeSignals | null;
    };

/**
 * Reads the caller's first Organization membership + primary Location + default Zone
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
  const venueDevice = await businessPointSessionAlive();
  const canPay = ownerCanPayFromThisBrowser(
    memberships.some((row) => row.role === "owner"),
    venueDevice,
  );
  let renewalAnswer: BusinessRenewalAnswer | null = null;
  const { data: renewalRow, error: renewalError } = await supabase.rpc(
    "business_access_renewal_choice_for_caller",
  );
  if (!renewalError) {
    const row = Array.isArray(renewalRow) ? renewalRow[0] : renewalRow;
    const answer = row && typeof row === "object" ? (row as { answer?: unknown }).answer : null;
    if (answer === "yes" || answer === "no") renewalAnswer = answer;
  }
  let offerAccepted = false;
  if (canPay) {
    const { data: acceptance } = await supabase.rpc("business_offer_acceptance_for_caller");
    offerAccepted = Array.isArray(acceptance) && acceptance.length > 0;
  }

  if (!membership?.organization_id) {
    return {
      status: "authenticated",
      owner: { userId: user.id, firstName },
      location: null,
      organizationName: null,
      organizationId: null,
      canPay,
      offerAccepted,
      venueDevice,
      renewalAnswer,
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

  const { data: location, error: locationError } = await supabase
    .from("business_locations")
    .select(
      "id, organization_id, name, business_category, country_code, timezone, status",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (locationError) {
    throw new Error(
      `business_domain_location_read_failed:${locationError.message}`,
    );
  }

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
      organizationName: org?.name ?? null,
      organizationId,
      canPay,
      offerAccepted,
      venueDevice,
      renewalAnswer,
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
    organizationName: org?.name ?? null,
    organizationId,
    canPay,
    offerAccepted,
    venueDevice,
    renewalAnswer,
    location: {
      id: location.id,
      organizationId: location.organization_id,
      name: location.name,
      businessCategory: location.business_category,
      countryCode: location.country_code,
      timezone: location.timezone,
      status: location.status,
      defaultZoneId: zone?.id ?? null,
    },
    signals,
  };
}
