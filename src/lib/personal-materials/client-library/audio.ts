import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";
import {
  isPathInsidePersonalMaterialRoot,
  PERSONAL_MATERIALS_BUCKET,
} from "@/lib/personal-materials/storage";
import { PERSONAL_MATERIAL_LIMITS } from "@/lib/personal-materials/types";
import { PersonalMaterialApiError } from "@/lib/personal-materials/server/errors";

/**
 * Owner signed audio URL — ownership already verified via claimed RPC.
 * Does not require guest_access_enabled.
 */
export async function createOwnerAudioSignedUrl(input: {
  materialId: string;
  userId: string;
}): Promise<{ url: string; expiresAt: string }> {
  const service = createServiceRoleClient();

  const { data: material, error } = await service
    .from("personal_materials")
    .select("id, audio_path, claimed_by_user_id, status, deleted_at")
    .eq("id", input.materialId)
    .maybeSingle();

  if (error) {
    console.error("personal_material_owner_audio_lookup_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  if (
    !material ||
    material.claimed_by_user_id !== input.userId ||
    material.status === "deleted" ||
    material.deleted_at
  ) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const audioPath =
    typeof material.audio_path === "string" ? material.audio_path.trim() : "";

  if (!audioPath || !isPathInsidePersonalMaterialRoot(audioPath)) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const expiresIn = PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { data, error: signError } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .createSignedUrl(audioPath, expiresIn);

  if (signError || !data?.signedUrl) {
    console.error("personal_material_owner_signed_url_error", signError?.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);

  if (!url) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return { url, expiresAt };
}
