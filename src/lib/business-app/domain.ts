import { createClient } from "@/lib/supabase/server";

import { extractBusinessFirstName } from "@/lib/business-app/domain-identity";

export { extractBusinessFirstName } from "@/lib/business-app/domain-identity";

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
    };

/**
 * Reads the caller's first Organization membership + primary Location + default Zone.
 * Expand-only read path over A1 tables already in production. No mock fallback.
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

  const { data: membership, error: membershipError } = await supabase
    .from("business_organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(
      `business_domain_membership_read_failed:${membershipError.message}`,
    );
  }

  if (!membership?.organization_id) {
    return {
      status: "authenticated",
      owner: { userId: user.id, firstName },
      location: null,
      organizationName: null,
    };
  }

  const { data: org, error: orgError } = await supabase
    .from("business_organizations")
    .select("id, name, status")
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (orgError) {
    throw new Error(`business_domain_org_read_failed:${orgError.message}`);
  }

  const { data: location, error: locationError } = await supabase
    .from("business_locations")
    .select(
      "id, organization_id, name, business_category, country_code, timezone, status",
    )
    .eq("organization_id", membership.organization_id)
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
    return {
      status: "authenticated",
      owner: { userId: user.id, firstName },
      location: null,
      organizationName: org?.name ?? null,
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

  return {
    status: "authenticated",
    owner: { userId: user.id, firstName },
    organizationName: org?.name ?? null,
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
  };
}
