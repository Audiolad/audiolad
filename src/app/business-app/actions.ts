"use server";

import { revalidatePath } from "next/cache";

import { BUSINESS_SITE_PATH } from "@/lib/business-app/host";
import { createClient } from "@/lib/supabase/server";

export type BootstrapBusinessDomainResult =
  | { ok: true; organizationId: string; locationId: string; zoneId: string }
  | { ok: false; error: string };

export async function bootstrapBusinessOrganizationWithLocation(input: {
  organizationName: string;
  locationName: string;
  businessCategory: string;
  countryCode?: string;
  timezone?: string;
}): Promise<BootstrapBusinessDomainResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const countryCode = (input.countryCode ?? "RU").trim().toUpperCase();
  const timezone = (input.timezone ?? "Europe/Moscow").trim();

  const { data, error } = await supabase.rpc(
    "create_business_organization_with_location",
    {
      p_organization_name: input.organizationName.trim(),
      p_location_name: input.locationName.trim(),
      p_business_category: input.businessCategory.trim(),
      p_country_code: countryCode,
      p_timezone: timezone,
    },
  );

  if (error) {
    return { ok: false, error: error.message || "bootstrap_failed" };
  }

  const payload = data as {
    ok?: boolean;
    organization_id?: string;
    location_id?: string;
    zone_id?: string;
  } | null;

  if (
    !payload?.ok ||
    !payload.organization_id ||
    !payload.location_id ||
    !payload.zone_id
  ) {
    return { ok: false, error: "bootstrap_invalid_response" };
  }

  revalidatePath(BUSINESS_SITE_PATH);
  revalidatePath(`${BUSINESS_SITE_PATH}/locations`);

  return {
    ok: true,
    organizationId: payload.organization_id,
    locationId: payload.location_id,
    zoneId: payload.zone_id,
  };
}
