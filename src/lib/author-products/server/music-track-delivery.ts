import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readMusicTrackTeardownResult,
  storageObjectsToRemove,
  type MusicStorageObjectRef,
  type MusicTrackTeardownStatus,
} from "@/lib/author-products/music-track-lifecycle";
import { removeMusicStorageObject } from "@/lib/music-storage/server";
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
  objects: ReadonlyArray<{
    provider?: string | null;
    bucket?: string | null;
    path?: string | null;
  }>,
  protectedKeys: ReadonlySet<string> = new Set(),
): Promise<MusicStorageObjectRef[]> {
  const removable = storageObjectsToRemove(objects, protectedKeys);
  const failed: MusicStorageObjectRef[] = [];
  for (const object of removable) {
    try {
      const removed = await removeMusicStorageObject({
        storage_provider: object.provider,
        storage_bucket: object.bucket,
        storage_path: object.path,
      }, service);
      if (!removed) {
        failed.push(object);
        console.error("music_track_storage_cleanup_error", object.bucket, object.path);
      }
    } catch (error) {
      failed.push(object);
      console.error(
        "music_track_storage_cleanup_error",
        object.bucket,
        error instanceof Error ? error.message : "unknown",
      );
    }
  }
  return failed;
}

export async function teardownMusicTrackDelivery(input: {
  practiceId: string;
  audioId: string;
  deleteItem: boolean;
}): Promise<{ status: MusicTrackTeardownStatus }> {
  const service = createServiceRoleClient();
  const { data: assetLocations, error: assetLocationsError } = await service
    .from("music_audio_assets")
    .select("id, storage_provider, storage_bucket, storage_path")
    .eq("audio_item_id", input.audioId);
  if (assetLocationsError) {
    console.error("music_track_storage_lookup_failed", assetLocationsError.message);
    throw new Error("music_track_teardown_failed");
  }
  const assetIds = (assetLocations ?? []).map((asset) => asset.id as string);
  let storageCopies: Array<{
    source_provider: string;
    target_provider: string;
    storage_bucket: string;
    storage_path: string;
  }> = [];
  if (assetIds.length > 0) {
    const { data, error } = await service
      .from("music_storage_copies")
      .select("source_provider, target_provider, storage_bucket, storage_path")
      .in("asset_id", assetIds);
    if (error) {
      console.error("music_track_storage_lookup_failed", error.message);
      throw new Error("music_track_teardown_failed");
    }
    storageCopies = data ?? [];
  }
  const providers = new Map(
    (assetLocations ?? []).map((asset) => [
      `${asset.storage_bucket}\n${asset.storage_path}`,
      typeof asset.storage_provider === "string"
        ? asset.storage_provider
        : "supabase_file",
    ]),
  );
  const providerObjects = storageObjectsToRemove([
    ...(assetLocations ?? []).map((asset) => ({
      provider: asset.storage_provider,
      bucket: asset.storage_bucket,
      path: asset.storage_path,
    })),
    ...storageCopies.flatMap((copy) => [
      {
        provider: copy.source_provider,
        bucket: copy.storage_bucket,
        path: copy.storage_path,
      },
      {
        provider: copy.target_provider,
        bucket: copy.storage_bucket,
        path: copy.storage_path,
      },
    ]),
  ]);
  const { data: blockedJobs, error: blockedError } = providerObjects.length > 0
    ? await service
      .from("music_storage_cleanup_jobs")
      .upsert(providerObjects.map((object) => ({
        audio_item_id: input.audioId,
        provider: object.provider ?? "supabase_file",
        storage_bucket: object.bucket,
        storage_path: object.path,
        status: "blocked",
        attempt_count: 0,
        last_error_code: null,
        resolved_at: null,
        updated_at: new Date().toISOString(),
      })), {
        onConflict: "provider,storage_bucket,storage_path",
      })
      .select("id")
    : { data: [], error: null };
  if (blockedError) {
    console.error("music_track_cleanup_stage_failed", blockedError.message);
    throw new Error("music_track_teardown_failed");
  }
  const blockedJobIds = (blockedJobs ?? []).map((job) => job.id as string);
  const { data, error } = await service.rpc("teardown_music_track_delivery", {
    p_audio_item_id: input.audioId,
    p_practice_id: input.practiceId,
    p_delete_item: input.deleteItem,
  });
  if (error) {
    if (blockedJobIds.length > 0) {
      await service.from("music_storage_cleanup_jobs")
        .update({
          last_error_code: "teardown_rpc_failed",
          updated_at: new Date().toISOString(),
        })
        .in("id", blockedJobIds);
    }
    console.error("music_track_teardown_failed", error.message);
    throw error;
  }
  const parsed = readMusicTrackTeardownResult(data);
  if (!parsed) {
    if (blockedJobIds.length > 0) {
      await service.from("music_storage_cleanup_jobs")
        .update({
          last_error_code: "teardown_result_invalid",
          updated_at: new Date().toISOString(),
        })
        .in("id", blockedJobIds);
    }
    console.error("music_track_teardown_invalid_result");
    throw new Error("music_track_teardown_failed");
  }
  if (parsed.status === "not_found") {
    if (blockedJobIds.length > 0) {
      await service.from("music_storage_cleanup_jobs").delete().in("id", blockedJobIds);
    }
  } else {
    const cleanupObjects = storageObjectsToRemove([
      ...parsed.objects.map((object) => ({
        ...object,
        provider: providers.get(`${object.bucket}\n${object.path}`) ?? "supabase_file",
      })),
      ...storageCopies.flatMap((copy) => [
        {
          provider: copy.source_provider,
          bucket: copy.storage_bucket,
          path: copy.storage_path,
        },
        {
          provider: copy.target_provider,
          bucket: copy.storage_bucket,
          path: copy.storage_path,
        },
      ]),
    ]);
    const now = new Date().toISOString();
    const { data: pendingJobs, error: pendingError } = await service
      .from("music_storage_cleanup_jobs")
      .upsert(cleanupObjects.map((object) => ({
        audio_item_id: input.audioId,
        provider: object.provider ?? "supabase_file",
        storage_bucket: object.bucket,
        storage_path: object.path,
        status: "pending",
        last_error_code: null,
        resolved_at: null,
        updated_at: now,
      })), {
        onConflict: "provider,storage_bucket,storage_path",
      })
      .select("id, provider, storage_bucket, storage_path, attempt_count");
    if (pendingError) {
      console.error("music_track_cleanup_stage_failed", pendingError.message);
      throw new Error("music_track_storage_cleanup_pending");
    }
    const failed = await removeMusicStorageObjectsBestEffort(service, cleanupObjects);
    const failedKeys = new Set(failed.map((object) => (
      `${object.provider ?? "supabase_file"}\n${object.bucket}\n${object.path}`
    )));
    await Promise.all((pendingJobs ?? []).map(async (job) => {
      const key = `${job.provider}\n${job.storage_bucket}\n${job.storage_path}`;
      const didFail = failedKeys.has(key);
      const { error: updateError } = await service
        .from("music_storage_cleanup_jobs")
        .update({
          status: didFail ? "pending" : "resolved",
          attempt_count: Number(job.attempt_count ?? 0) + 1,
          last_error_code: didFail ? "object_delete_failed" : null,
          resolved_at: didFail ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      if (updateError) {
        console.error("music_track_cleanup_status_failed", updateError.message);
      }
    }));
  }
  return { status: parsed.status };
}
