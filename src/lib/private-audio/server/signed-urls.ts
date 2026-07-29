import { PRIVATE_AUDIO_LIMITS } from "@/lib/private-audio/limits";
import { PRIVATE_AUDIO_BUCKET } from "@/lib/private-audio/storage";
import { PrivateAudioApiError } from "@/lib/private-audio/server/errors";
import type { PrivateAudioSignedAudioDto } from "@/lib/private-audio/types";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function createSignedPrivateAudioUrl(
  audioPath: string,
): Promise<PrivateAudioSignedAudioDto> {
  const service = createServiceRoleClient();
  const expiresIn = PRIVATE_AUDIO_LIMITS.signedUrlTtlSeconds;

  const { data, error } = await service.storage
    .from(PRIVATE_AUDIO_BUCKET)
    .createSignedUrl(audioPath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("private_audio_sign_error", error?.message);
    throw new PrivateAudioApiError("internal_error", 500);
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);

  if (!url) {
    throw new PrivateAudioApiError("internal_error", 500);
  }

  return {
    url,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function createSignedCoverUrl(
  coverPath: string,
): Promise<string | null> {
  const service = createServiceRoleClient();
  const expiresIn = PRIVATE_AUDIO_LIMITS.signedUrlTtlSeconds;

  const { data, error } = await service.storage
    .from(PRIVATE_AUDIO_BUCKET)
    .createSignedUrl(coverPath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("private_audio_cover_sign_error", error?.message);
    return null;
  }

  return normalizeStorageSignedUrl(data.signedUrl);
}
