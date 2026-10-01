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

export type ProvisionVenuePlayerResult =
  | {
      ok: true;
      playerId: string;
      playerCode: string;
      credential: string;
      zoneId: string;
      assignmentId: string;
    }
  | { ok: false; error: string };

/**
 * Owner-only: create Player + assign to Zone in one UI step.
 * Returns plaintext credential once (A2 contract).
 */
export async function provisionVenuePlayer(input: {
  organizationId: string;
  zoneId: string;
  displayName?: string;
}): Promise<ProvisionVenuePlayerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const displayName = (input.displayName ?? "Venue Player").trim() || "Venue Player";

  const { data: created, error: createError } = await supabase.rpc(
    "create_business_player",
    {
      p_organization_id: input.organizationId,
      p_display_name: displayName,
    },
  );

  if (createError) {
    return { ok: false, error: createError.message || "create_player_failed" };
  }

  const createdPayload = created as {
    ok?: boolean;
    player_id?: string;
    player_code?: string;
    credential?: string;
  } | null;

  if (
    !createdPayload?.ok ||
    !createdPayload.player_id ||
    !createdPayload.player_code ||
    !createdPayload.credential
  ) {
    return { ok: false, error: "create_player_invalid_response" };
  }

  const { data: assigned, error: assignError } = await supabase.rpc(
    "assign_business_player_to_zone",
    {
      p_player_id: createdPayload.player_id,
      p_zone_id: input.zoneId,
    },
  );

  if (assignError) {
    return { ok: false, error: assignError.message || "assign_player_failed" };
  }

  const assignedPayload = assigned as {
    ok?: boolean;
    assignment_id?: string;
    zone_id?: string;
  } | null;

  if (!assignedPayload?.ok || !assignedPayload.assignment_id) {
    return { ok: false, error: "assign_player_invalid_response" };
  }

  revalidatePath(BUSINESS_SITE_PATH);
  revalidatePath(`${BUSINESS_SITE_PATH}/player`);
  revalidatePath(`${BUSINESS_SITE_PATH}/locations`);

  return {
    ok: true,
    playerId: createdPayload.player_id,
    playerCode: createdPayload.player_code,
    credential: createdPayload.credential,
    zoneId: assignedPayload.zone_id ?? input.zoneId,
    assignmentId: assignedPayload.assignment_id,
  };
}
