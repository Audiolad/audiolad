import "server-only";

import { resolveMusicListenSource, type MusicStreamCandidate } from "@/lib/listen/music-delivery";
import { LISTEN_SIGNED_URL_TTL_SECONDS, normalizeStorageSignedUrl } from "@/lib/listen/signed-url";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function signWorkspaceAudio(
  audioItemId: string,
  allowed: ReadonlySet<string>,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!allowed.has(audioItemId)) return { ok: false, reason: "not_in_manifest" };
  let db: ReturnType<typeof createServiceRoleClient>;
  try {
    db = createServiceRoleClient();
  } catch {
    return { ok: false, reason: "sign_failed" };
  }

  const { data: row, error } = await db
    .from("audio_items")
    .select("id, audio_path, active_music_delivery_asset_id")
    .eq("id", audioItemId)
    .maybeSingle();
  if (error || !row) return { ok: false, reason: "not_in_manifest" };

  let activeStream: MusicStreamCandidate | null = null;
  const assetId = row.active_music_delivery_asset_id as string | null;
  if (assetId) {
    const { data: asset } = await db
      .from("music_audio_assets")
      .select("audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path")
      .eq("id", assetId)
      .maybeSingle();
    if (asset) {
      activeStream = {
        audioItemId: asset.audio_item_id as string,
        assetRole: asset.asset_role as string,
        lifecycleState: asset.lifecycle_state as string,
        storageBucket: asset.storage_bucket as string,
        storagePath: asset.storage_path as string,
      };
    }
  }

  const source = resolveMusicListenSource({
    productKind: "music",
    audioItemId,
    audioPath: row.audio_path as string | null,
    activeStream,
  });
  if (source.kind === "missing") return { ok: false, reason: "sign_failed" };

  const { data: signed, error: signError } = await db.storage
    .from(source.bucket)
    .createSignedUrl(source.path, LISTEN_SIGNED_URL_TTL_SECONDS);
  const url = signed?.signedUrl ? normalizeStorageSignedUrl(signed.signedUrl) : null;
  if (signError || !url) return { ok: false, reason: "sign_failed" };
  return { ok: true, url };
}
