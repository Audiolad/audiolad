"use server";

import { revalidatePath } from "next/cache";

import {
  BUSINESS_AIRPLAY_CANDIDATE_PROBES,
  filterEligibleAirplayRows,
  parseBusinessEligibilityPayload,
  type BusinessEligibilityProbeRow,
} from "@/lib/business-app/eligibility";
import { BUSINESS_SITE_PATH } from "@/lib/business-app/host";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
    return { ok: false, error: "Вход не подтверждён. Попробуйте ещё раз." };
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
    return { ok: false, error: "Не удалось подключить заведение. Попробуйте ещё раз." };
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
    return { ok: false, error: "Не удалось подтвердить подключение заведения. Попробуйте ещё раз." };
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
    return { ok: false, error: "Вход не подтверждён. Попробуйте ещё раз." };
  }

  const displayName = (input.displayName ?? "Плеер точки").trim() || "Плеер точки";

  const { data: created, error: createError } = await supabase.rpc(
    "create_business_player",
    {
      p_organization_id: input.organizationId,
      p_display_name: displayName,
    },
  );

  if (createError) {
    return { ok: false, error: "Не удалось подключить плеер. Попробуйте ещё раз." };
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
    return { ok: false, error: "Не удалось подтвердить подключение плеера. Попробуйте ещё раз." };
  }

  const { data: assigned, error: assignError } = await supabase.rpc(
    "assign_business_player_to_zone",
    {
      p_player_id: createdPayload.player_id,
      p_zone_id: input.zoneId,
    },
  );

  if (assignError) {
    return { ok: false, error: "Не удалось подключить плеер к залу. Попробуйте ещё раз." };
  }

  const assignedPayload = assigned as {
    ok?: boolean;
    assignment_id?: string;
    zone_id?: string;
  } | null;

  if (!assignedPayload?.ok || !assignedPayload.assignment_id) {
    return { ok: false, error: "Не удалось подтвердить подключение плеера к залу. Попробуйте ещё раз." };
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

export type ResolveBusinessAirplayEligibilityResult =
  | {
      ok: true;
      locationId: string;
      zoneId: string | null;
      rows: BusinessEligibilityProbeRow[];
      eligibleCount: number;
    }
  | { ok: false; error: string };

/**
 * Owner read-only eligibility probe (P0-05).
 * Auth + membership gate via user client; A5 RPC via service_role
 * (RPC is not granted to authenticated — by A5 design).
 * Does not invent grants; UNKNOWN-safe.
 */
export async function resolveBusinessAirplayEligibilityProbe(input: {
  locationId: string;
  zoneId?: string | null;
  audioItemIds?: string[];
}): Promise<ResolveBusinessAirplayEligibilityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Вход не подтверждён. Попробуйте ещё раз." };
  }

  const locationId = input.locationId.trim();
  if (!locationId) {
    return { ok: false, error: "Точка не выбрана." };
  }

  const { data: location, error: locationError } = await supabase
    .from("business_locations")
    .select("id, organization_id")
    .eq("id", locationId)
    .maybeSingle();

  if (locationError) {
    return { ok: false, error: "Не удалось загрузить точку. Попробуйте ещё раз." };
  }
  if (!location?.organization_id) {
    return { ok: false, error: "Точка не найдена." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", location.organization_id)
    .maybeSingle();

  if (membershipError) {
    return {
      ok: false,
      error: "Не удалось проверить доступ к заведению. Попробуйте ещё раз.",
    };
  }
  if (!membership) {
    return { ok: false, error: "У вас нет доступа к этому заведению." };
  }

  const zoneId =
    typeof input.zoneId === "string" && input.zoneId.trim()
      ? input.zoneId.trim()
      : null;

  const candidates =
    Array.isArray(input.audioItemIds) && input.audioItemIds.length > 0
      ? input.audioItemIds.map((id) => ({
          audioItemId: id.trim(),
          label: id.trim(),
        }))
      : [...BUSINESS_AIRPLAY_CANDIDATE_PROBES];

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return { ok: false, error: "Проверка прав на музыку временно недоступна. Попробуйте позже." };
  }

  const rows: BusinessEligibilityProbeRow[] = [];
  for (const candidate of candidates) {
    if (!candidate.audioItemId) continue;
    const { data, error: rpcError } = await service.rpc(
      "resolve_business_track_eligibility",
      {
        p_audio_item_id: candidate.audioItemId,
        p_location_id: locationId,
        p_zone_id: zoneId,
        p_use_type: "business_background_playback",
      },
    );

    if (rpcError) {
      rows.push({
        audioItemId: candidate.audioItemId,
        label: candidate.label,
        decision: "UNKNOWN",
        trackCode: null,
        reasonCodes: ["RPC_ERROR"],
        engineVersion: null,
        locationId,
        zoneId,
        error: "Не удалось проверить права на музыку. Попробуйте позже.",
      });
      continue;
    }

    const parsed = parseBusinessEligibilityPayload(data, candidate.audioItemId);
    if (!parsed) {
      rows.push({
        audioItemId: candidate.audioItemId,
        label: candidate.label,
        decision: "UNKNOWN",
        trackCode: null,
        reasonCodes: ["INVALID_RPC_PAYLOAD"],
        engineVersion: null,
        locationId,
        zoneId,
        error: "Не удалось получить сведения о правах на музыку. Попробуйте позже.",
      });
      continue;
    }

    rows.push({
      ...parsed,
      label: candidate.label,
      locationId: parsed.locationId || locationId,
      zoneId: parsed.zoneId ?? zoneId,
      error: null,
    });
  }

  return {
    ok: true,
    locationId,
    zoneId,
    rows,
    eligibleCount: filterEligibleAirplayRows(rows).length,
  };
}
