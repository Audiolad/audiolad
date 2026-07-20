import type { SupabaseClient } from "@supabase/supabase-js";

import { hashAccessToken, tokenHashToPostgresBytea } from "@/lib/personal-materials/tokens";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { mapPersonalMaterialRpcError, PersonalMaterialApiError } from "./errors";

export type PersonalMaterialClaimResult = {
  materialId: string;
  claimed: boolean;
  starterGrantsInserted: number;
};

function mapClaimRpcData(data: unknown): PersonalMaterialClaimResult {
  if (typeof data !== "object" || data === null) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const record = data as Record<string, unknown>;

  if (typeof record.material_id !== "string" || record.claimed !== true) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return {
    materialId: record.material_id,
    claimed: true,
    starterGrantsInserted:
      typeof record.starter_grants_inserted === "number"
        ? record.starter_grants_inserted
        : 0,
  };
}

export async function claimPersonalMaterialByRawToken(
  supabase: SupabaseClient,
  rawToken: string,
): Promise<PersonalMaterialClaimResult> {
  let tokenHash;

  try {
    tokenHash = hashAccessToken(rawToken);
  } catch {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const { data, error } = await supabase.rpc("claim_personal_material", {
    p_access_token_hash: tokenHashToPostgresBytea(tokenHash),
  });

  if (error) {
    const mapped = mapPersonalMaterialRpcError(error.message);

    throw new PersonalMaterialApiError(mapped.code, mapped.status);
  }

  return mapClaimRpcData(data);
}

export async function claimPersonalMaterialByMaterialId(
  supabase: SupabaseClient,
  materialId: string,
): Promise<PersonalMaterialClaimResult> {
  const service = createServiceRoleClient();

  const { data: material, error: lookupError } = await service
    .from("personal_materials")
    .select("access_token_hash")
    .eq("id", materialId)
    .maybeSingle();

  if (lookupError) {
    console.error("personal_material_claim_lookup_error", lookupError.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const tokenHashHex = material?.access_token_hash;

  if (!tokenHashHex || typeof tokenHashHex !== "string") {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const { data, error } = await supabase.rpc("claim_personal_material", {
    p_access_token_hash: tokenHashHex,
  });

  if (error) {
    const mapped = mapPersonalMaterialRpcError(error.message);

    throw new PersonalMaterialApiError(mapped.code, mapped.status);
  }

  return mapClaimRpcData(data);
}
