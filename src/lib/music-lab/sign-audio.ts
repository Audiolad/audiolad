import { MUSIC_LAB_BUCKET, MUSIC_LAB_SIGNED_URL_TTL_SECONDS } from "@/lib/music-lab/constants";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function signMusicLabObject(
  bucket: string,
  objectPath: string,
): Promise<string | null> {
  if (bucket !== MUSIC_LAB_BUCKET) {
    return null;
  }

  const slash = objectPath.lastIndexOf("/");
  const folder = slash >= 0 ? objectPath.slice(0, slash) : "";
  const name = slash >= 0 ? objectPath.slice(slash + 1) : objectPath;
  const service = createServiceRoleClient();
  const listed = await service.storage.from(bucket).list(folder, {
    search: name,
    limit: 20,
  });
  const found = listed.data?.some((entry) => entry.name === name);
  if (listed.error || !found) {
    return null;
  }

  const signed = await service.storage.from(bucket).createSignedUrl(
    objectPath,
    MUSIC_LAB_SIGNED_URL_TTL_SECONDS,
  );
  if (signed.error || !signed.data?.signedUrl) {
    return null;
  }

  return normalizeStorageSignedUrl(signed.data.signedUrl);
}
