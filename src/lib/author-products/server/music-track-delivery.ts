import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readMusicTrackTeardownResult,
  storageObjectsToRemove,
  type MusicTrackTeardownStatus,
} from "@/lib/author-products/music-track-lifecycle";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function claimMusicTrackUploadGeneration(input: {
  practiceId: string;
  audioId: string;
  storagePath?: string | null;
}): Promise<number> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("claim_music_track_upload_generation", {
    p_audio_item_id: input.audioId,
    p_practice_id: input.practiceId,
    p_storage_path: input.storagePath?.trim() || null,
  });
  if (error) {
    console.error("music_upload_generation_claim_failed", error.message);
    throw new Error("music_upload_generation_claim_failed");
  }
  const generation = typeof data === "number" ? data : Number(data);
  if (!Number.isInteger(generation) || generation <= 0) {
    console.error("music_upload_generation_claim_invalid");
    throw new Error("music_upload_generation_claim_failed");
  }
  return generation;
}

export async function removeMusicStorageObjectsBestEffort(
  service: SupabaseClient,
  objects: ReadonlyArray<{ bucket?: string | null; path?: string | null }>,
  protectedKeys: ReadonlySet<string> = new Set(),
): Promise<void> {
  const removable = storageObjectsToRemove(objects, protectedKeys);
  const byBucket = new Map<string, string[]>();
  for (const object of removable) {
    const paths = byBucket.get(object.bucket) ?? [];
    paths.push(object.path);
    byBucket.set(object.bucket, paths);
  }
  for (const [bucket, paths] of byBucket) {
    try {
      const { error } = await service.storage.from(bucket).remove(paths);
      if (error) {
        console.error("music_track_storage_cleanup_error", bucket, error.message);
      }
    } catch (error) {
      console.error(
        "music_track_storage_cleanup_error",
        bucket,
        error instanceof Error ? error.message : "unknown",
      );
    }
  }
}

export async function teardownMusicTrackDelivery(input: {
  practiceId: string;
  audioId: string;
  deleteItem: boolean;
}): Promise<{ status: MusicTrackTeardownStatus }> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("teardown_music_track_delivery", {
    p_audio_item_id: input.audioId,
    p_practice_id: input.practiceId,
    p_delete_item: input.deleteItem,
  });
  if (error) {
    console.error("music_track_teardown_failed", error.message);
    throw error;
  }
  const parsed = readMusicTrackTeardownResult(data);
  if (!parsed) {
    console.error("music_track_teardown_invalid_result");
    throw new Error("music_track_teardown_failed");
  }
  if (parsed.status !== "not_found") {
    await removeMusicStorageObjectsBestEffort(service, parsed.objects);
  }
  return { status: parsed.status };
}
