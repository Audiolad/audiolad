import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isLegacyMusicDraftEmptyPlaceholder,
  LEGACY_MUSIC_DRAFT_SEED_ENDED_AT,
  planLegacyMusicDraftPlaceholderCleanup,
  type LegacyMusicDraftAudioFacts,
  type LegacyMusicDraftDeliverySignals,
} from "@/lib/author-products/legacy-music-draft-placeholder";
import { syncPracticeAudioCompatibility } from "@/lib/author-products/publish";
import { getPracticeSaleLock } from "@/lib/author-products/sale-lock";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const AUDIO_FACT_SELECT = `
  id,
  title,
  position,
  status,
  created_at,
  audio_path,
  duration_seconds,
  active_music_delivery_asset_id,
  desired_music_master_asset_id,
  desired_product_audio_normalize_job_id,
  music_upload_generation,
  original_file_name,
  file_size_bytes,
  description,
  cover_url,
  cover_image,
  is_preview,
  preview_start_ms,
  preview_end_ms
`;

type AudioFactRow = {
  id: string;
  title: string;
  position: number;
  status: string;
  created_at: string;
  audio_path: string | null;
  duration_seconds: number | null;
  active_music_delivery_asset_id: string | null;
  desired_music_master_asset_id: string | null;
  desired_product_audio_normalize_job_id: string | null;
  music_upload_generation: number | string | null;
  original_file_name: string | null;
  file_size_bytes: number | null;
  description: string | null;
  cover_url: string | null;
  cover_image: unknown;
  is_preview: boolean;
  preview_start_ms: number | null;
  preview_end_ms: number | null;
};

function emptySignals(): LegacyMusicDraftDeliverySignals {
  return {
    musicAssetCount: 0,
    transcodeJobCount: 0,
    directUploadCount: 0,
    normalizeJobCount: 0,
  };
}

function normalizeUploadGeneration(value: number | string | null): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function toAudioFacts(row: AudioFactRow): LegacyMusicDraftAudioFacts {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    status: row.status,
    createdAt: row.created_at,
    audioPath: row.audio_path,
    durationSeconds: row.duration_seconds,
    activeMusicDeliveryAssetId: row.active_music_delivery_asset_id,
    desiredMusicMasterAssetId: row.desired_music_master_asset_id,
    desiredProductAudioNormalizeJobId: row.desired_product_audio_normalize_job_id,
    musicUploadGeneration: normalizeUploadGeneration(row.music_upload_generation),
    originalFileName: row.original_file_name,
    fileSizeBytes: row.file_size_bytes,
    description: row.description,
    coverUrl: row.cover_url,
    coverImage: row.cover_image ?? null,
    isPreview: row.is_preview,
    previewStartMs: row.preview_start_ms,
    previewEndMs: row.preview_end_ms,
  };
}

async function loadDeliverySignals(
  service: SupabaseClient,
  audioIds: readonly string[],
): Promise<Map<string, LegacyMusicDraftDeliverySignals>> {
  const signals = new Map<string, LegacyMusicDraftDeliverySignals>();
  for (const audioId of audioIds) {
    signals.set(audioId, emptySignals());
  }
  if (audioIds.length === 0) {
    return signals;
  }

  const [assets, uploads, normalizeJobs] = await Promise.all([
    service
      .from("music_audio_assets")
      .select("id, audio_item_id")
      .in("audio_item_id", [...audioIds]),
    service
      .from("music_direct_upload_generations")
      .select("audio_item_id")
      .in("audio_item_id", [...audioIds]),
    service
      .from("product_audio_normalize_jobs")
      .select("id, audio_item_id, status")
      .in("audio_item_id", [...audioIds]),
  ]);

  if (assets.error) {
    throw new Error("legacy_placeholder_asset_lookup_failed");
  }
  if (uploads.error) {
    throw new Error("legacy_placeholder_upload_lookup_failed");
  }
  if (normalizeJobs.error) {
    throw new Error("legacy_placeholder_normalize_lookup_failed");
  }

  const assetIdToAudioId = new Map<string, string>();
  for (const asset of assets.data ?? []) {
    const audioId = asset.audio_item_id as string;
    const bucket = signals.get(audioId);
    if (!bucket) {
      continue;
    }
    bucket.musicAssetCount += 1;
    assetIdToAudioId.set(asset.id as string, audioId);
  }

  for (const upload of uploads.data ?? []) {
    const bucket = signals.get(upload.audio_item_id as string);
    if (bucket) {
      bucket.directUploadCount += 1;
    }
  }

  for (const job of normalizeJobs.data ?? []) {
    const bucket = signals.get(job.audio_item_id as string);
    if (bucket) {
      bucket.normalizeJobCount += 1;
    }
  }

  const assetIds = [...assetIdToAudioId.keys()];
  if (assetIds.length === 0) {
    return signals;
  }

  const [sourceJobs, outputJobs] = await Promise.all([
    service
      .from("music_transcode_jobs")
      .select("id, source_asset_id, status")
      .in("source_asset_id", assetIds),
    service
      .from("music_transcode_jobs")
      .select("id, output_asset_id, status")
      .in("output_asset_id", assetIds),
  ]);

  if (sourceJobs.error || outputJobs.error) {
    throw new Error("legacy_placeholder_transcode_lookup_failed");
  }

  const countedJobIds = new Set<string>();
  for (const job of [...(sourceJobs.data ?? []), ...(outputJobs.data ?? [])]) {
    const jobId = job.id as string;
    if (countedJobIds.has(jobId)) {
      continue;
    }
    countedJobIds.add(jobId);
    const sourceAssetId =
      "source_asset_id" in job ? (job.source_asset_id as string | null) : null;
    const outputAssetId =
      "output_asset_id" in job ? (job.output_asset_id as string | null) : null;
    const audioId =
      (sourceAssetId ? assetIdToAudioId.get(sourceAssetId) : undefined) ??
      (outputAssetId ? assetIdToAudioId.get(outputAssetId) : undefined);
    const bucket = audioId ? signals.get(audioId) : undefined;
    if (bucket) {
      bucket.transcodeJobCount += 1;
    }
  }

  return signals;
}

async function deleteUntouchedSeedRow(
  service: SupabaseClient,
  practiceId: string,
  row: AudioFactRow,
): Promise<boolean> {
  const freshSignals = await loadDeliverySignals(service, [row.id]);
  const fresh = freshSignals.get(row.id);
  if (
    !fresh ||
    fresh.musicAssetCount > 0 ||
    fresh.transcodeJobCount > 0 ||
    fresh.directUploadCount > 0 ||
    fresh.normalizeJobCount > 0
  ) {
    return false;
  }

  const { data, error } = await service
    .from("audio_items")
    .delete()
    .eq("id", row.id)
    .eq("practice_id", practiceId)
    .eq("title", row.title)
    .eq("status", "draft")
    .eq("music_upload_generation", 0)
    .eq("is_preview", false)
    .is("audio_path", null)
    .is("duration_seconds", null)
    .is("active_music_delivery_asset_id", null)
    .is("desired_music_master_asset_id", null)
    .is("desired_product_audio_normalize_job_id", null)
    .is("original_file_name", null)
    .is("file_size_bytes", null)
    .is("description", null)
    .is("cover_url", null)
    .is("cover_image", null)
    .is("preview_start_ms", null)
    .is("preview_end_ms", null)
    .select("id");

  if (error) {
    throw new Error("legacy_placeholder_delete_failed");
  }

  return (data ?? []).length > 0;
}

/**
 * Idempotently deletes the pre-#591 empty music-draft slot and renumbers
 * the tracks that remain. A no-op when the practice is not an old music draft
 * or the slot already has any file, delivery, upload, or job signal.
 *
 * Teardown is intentionally not used: teardown deletes whatever the row has
 * become. This path deletes only while the empty-seed predicate still matches.
 */
export async function normalizeLegacyMusicDraftPlaceholder(
  practiceId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { data: practice, error: practiceError } = await service
    .from("practices")
    .select("id, product_kind, status, created_at")
    .eq("id", practiceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (practiceError) {
    throw new Error("legacy_placeholder_practice_lookup_failed");
  }

  if (
    !practice?.id ||
    practice.product_kind !== "music" ||
    practice.status !== "draft" ||
    typeof practice.created_at !== "string" ||
    Date.parse(practice.created_at) >= Date.parse(LEGACY_MUSIC_DRAFT_SEED_ENDED_AT)
  ) {
    return;
  }

  const { data: audioRows, error: audioError } = await service
    .from("audio_items")
    .select(AUDIO_FACT_SELECT)
    .eq("practice_id", practiceId);

  if (audioError) {
    throw new Error("legacy_placeholder_audio_lookup_failed");
  }

  const rows = (audioRows ?? []) as AudioFactRow[];
  if (rows.length === 0) {
    return;
  }

  const items = rows.map(toAudioFacts);
  const createdAtValues = items.map((item) => Date.parse(item.createdAt));
  const earliestAudioCreatedAtMs = createdAtValues.every((value) => Number.isFinite(value))
    ? Math.min(...createdAtValues)
    : null;
  const practiceFacts = {
    productKind: practice.product_kind as string,
    status: practice.status as string,
    createdAt: practice.created_at,
  };
  const candidateIds = items
    .filter((item) =>
      isLegacyMusicDraftEmptyPlaceholder(
        practiceFacts,
        item,
        emptySignals(),
        earliestAudioCreatedAtMs,
      ),
    )
    .map((item) => item.id);
  if (candidateIds.length === 0) {
    return;
  }

  const saleLock = await getPracticeSaleLock(service, practiceId);
  if (saleLock.locked) {
    return;
  }

  const signalsByAudioId = await loadDeliverySignals(service, candidateIds);
  const plan = planLegacyMusicDraftPlaceholderCleanup({
    practice: practiceFacts,
    items,
    signalsByAudioId,
  });

  if (plan.removeIds.length === 0) {
    return;
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const removedIds: string[] = [];
  for (const audioId of plan.removeIds) {
    const row = rowsById.get(audioId);
    if (!row) {
      continue;
    }
    if (await deleteUntouchedSeedRow(service, practiceId, row)) {
      removedIds.push(audioId);
    }
  }

  if (removedIds.length === 0) {
    return;
  }

  const { data: remainingRows, error: remainingError } = await service
    .from("audio_items")
    .select("id, position")
    .eq("practice_id", practiceId)
    .order("position", { ascending: true });

  if (remainingError) {
    throw new Error("legacy_placeholder_reorder_failed");
  }

  for (const [index, item] of (remainingRows ?? []).entries()) {
    const nextPosition = index + 1;
    if (item.position === nextPosition) {
      continue;
    }
    const { error: positionError } = await service
      .from("audio_items")
      .update({ position: nextPosition, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("practice_id", practiceId);
    if (positionError) {
      throw new Error("legacy_placeholder_reorder_failed");
    }
  }

  await syncPracticeAudioCompatibility(service, practiceId);
}
