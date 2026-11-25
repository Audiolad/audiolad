import "server-only";

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import {
  AuthorAccessError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { isCoursePublication } from "@/lib/author-products/publication-class";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  removeTempFile,
  writeStreamToTempFile,
} from "@/lib/studio/server/audio-duration";

import {
  PRODUCT_VIDEO_EXPORT_BUCKET,
  PRODUCT_VIDEO_EXPORT_MAX_BACKGROUND_BYTES,
  PRODUCT_VIDEO_EXPORT_MAX_BACKGROUND_DURATION_SECONDS,
  PRODUCT_VIDEO_EXPORT_MAX_BACKGROUND_PIXELS,
  PRODUCT_VIDEO_EXPORT_MAX_IMAGE_BYTES,
  PRODUCT_VIDEO_ORIENTATION_META,
  isProductVideoRenderJobStale,
  isProductVideoBackgroundStoragePath,
  parseProductVideoOrientation,
  productVideoBackgroundColumn,
  productVideoBackgroundExtension,
  productVideoBackgroundMimeType,
  productVideoBackgroundPosterStoragePath,
  productVideoBackgroundStoragePath,
  productVideoCoverColumn,
  productVideoCoverStoragePath,
  type ProductVideoOrientation,
} from "./contract";
import {
  extractProductVideoBackgroundPoster,
  inspectProductVideoBackground,
} from "./ffmpeg";

export type ProductVideoAssetState = {
  landscape_cover_path: string | null;
  portrait_cover_path: string | null;
  landscape_background_path: string | null;
  portrait_background_path: string | null;
  updated_at: string | null;
};

export type ProductVideoRenderJobState = {
  id: string;
  practice_id: string;
  author_id: string;
  audio_item_id: string;
  orientation: ProductVideoOrientation;
  source_audio_path: string;
  source_cover_path: string;
  output_storage_path: string;
  status: "queued" | "processing" | "completed" | "failed" | "superseded";
  attempt_count: number;
  error_code: string | null;
  error_message_safe: string | null;
  progress_percent: number | null;
  created_at: string;
  completed_at: string | null;
  render_recipe?: string | null;
};

export async function requireProductVideoExportAccess(practiceId: string) {
  const context = await requirePracticeMutationAccess(practiceId);
  const { practice } = context;
  if (
    practice.business_only ||
    isCoursePublication(practice.publication_class, practice.product_kind)
  ) {
    throw new AuthorAccessError("forbidden", 403);
  }

  return {
    ...context,
    service: createServiceRoleClient(),
  };
}

export async function getProductVideoAssets(
  practiceId: string,
): Promise<ProductVideoAssetState> {
  const { service } = await requireProductVideoExportAccess(practiceId);
  const { data, error } = await service
    .from("product_video_assets")
    .select(
      "landscape_cover_path, portrait_cover_path, landscape_background_path, portrait_background_path, updated_at",
    )
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (error) {
    console.error("product_video_assets_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  return {
    landscape_cover_path: data?.landscape_cover_path ?? null,
    portrait_cover_path: data?.portrait_cover_path ?? null,
    landscape_background_path: data?.landscape_background_path ?? null,
    portrait_background_path: data?.portrait_background_path ?? null,
    updated_at: data?.updated_at ?? null,
  };
}

export async function createProductVideoCoverSignedUrl(
  storagePath: string | null,
): Promise<string | null> {
  if (!storagePath) return null;
  const service = createServiceRoleClient();
  const { data, error } = await service.storage
    .from(PRODUCT_VIDEO_EXPORT_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) {
    console.error("product_video_cover_signed_url_error", error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function createProductVideoAssetSignedUrl(
  storagePath: string | null,
): Promise<string | null> {
  return createProductVideoCoverSignedUrl(storagePath);
}

function isOwnedBackgroundPath(input: {
  path: string;
  practiceId: string;
  orientation: ProductVideoOrientation;
}): boolean {
  return (
    isProductVideoBackgroundStoragePath(input.path) &&
    input.path.startsWith(
      `practices/${input.practiceId}/video-backgrounds/${input.orientation}/`,
    )
  );
}

async function readProductVideoStorageObjectSize(
  storagePath: string,
): Promise<number | null> {
  const service = createServiceRoleClient();
  const slash = storagePath.lastIndexOf("/");
  const directory = storagePath.slice(0, slash);
  const filename = storagePath.slice(slash + 1);
  const { data, error } = await service.storage
    .from(PRODUCT_VIDEO_EXPORT_BUCKET)
    .list(directory, { limit: 20, search: filename });
  if (error) return null;
  const object = data?.find((entry) => entry.name === filename);
  const size = Number(
    (object?.metadata as { size?: number | string } | undefined)?.size,
  );
  return Number.isFinite(size) && size > 0 ? size : null;
}

async function materializeProductVideoAsset(
  storagePath: string,
  extension: string,
): Promise<string> {
  const service = createServiceRoleClient();
  const { data, error } = await service.storage
    .from(PRODUCT_VIDEO_EXPORT_BUCKET)
    .createSignedUrl(storagePath, 120);
  if (error || !data?.signedUrl) {
    throw new AuthorAccessError("video_background_upload_incomplete", 409);
  }
  const response = await fetch(data.signedUrl);
  if (!response.ok || !response.body) {
    throw new AuthorAccessError("video_background_upload_incomplete", 409);
  }
  const tempPath = join(
    tmpdir(),
    `audiolad-product-video-${randomUUID()}.${extension}`,
  );
  try {
    await writeStreamToTempFile(response.body, tempPath);
    return tempPath;
  } catch (error) {
    await removeTempFile(tempPath);
    throw error;
  }
}

export async function startProductVideoBackgroundUpload(input: {
  practiceId: string;
  orientation: ProductVideoOrientation;
  fileName: string;
  fileSize: number;
  mimeType: string;
}) {
  await requireProductVideoExportAccess(input.practiceId);
  const extension = productVideoBackgroundExtension(
    input.fileName,
    input.mimeType,
  );
  if (
    !extension ||
    !Number.isFinite(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > PRODUCT_VIDEO_EXPORT_MAX_BACKGROUND_BYTES
  ) {
    throw new AuthorAccessError("invalid_video_background", 400);
  }
  const path = productVideoBackgroundStoragePath(
    input.practiceId,
    input.orientation,
    randomUUID(),
    extension,
  );
  const service = createServiceRoleClient();
  const { data, error } = await service.storage
    .from(PRODUCT_VIDEO_EXPORT_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.path || !data.token) {
    console.error("product_video_background_signed_upload_error", error?.message);
    throw new AuthorAccessError("video_background_upload_failed", 502);
  }
  return {
    uploadPath: data.path,
    contentType: productVideoBackgroundMimeType(extension),
    signedUpload: { path: data.path, token: data.token },
  };
}

export async function finalizeProductVideoBackgroundUpload(input: {
  practiceId: string;
  orientation: ProductVideoOrientation;
  uploadPath: string;
  fileSize: number;
}): Promise<{
  path: string;
  previewUrl: string | null;
  posterUrl: string | null;
}> {
  const { service } = await requireProductVideoExportAccess(input.practiceId);
  if (
    !isOwnedBackgroundPath({
      path: input.uploadPath,
      practiceId: input.practiceId,
      orientation: input.orientation,
    }) ||
    !Number.isFinite(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > PRODUCT_VIDEO_EXPORT_MAX_BACKGROUND_BYTES
  ) {
    throw new AuthorAccessError("invalid_video_background", 400);
  }
  const extension = input.uploadPath.match(/[.]([a-z0-9]+)$/i)?.[1] ?? "bin";
  const posterPath = productVideoBackgroundPosterStoragePath(input.uploadPath);
  const column = productVideoBackgroundColumn(input.orientation);
  let tempPath: string | null = null;
  let posterTempPath: string | null = null;
  let persisted = false;
  try {
    const objectSize = await readProductVideoStorageObjectSize(input.uploadPath);
    if (!objectSize || objectSize !== input.fileSize) {
      throw new AuthorAccessError("video_background_upload_incomplete", 409);
    }
    tempPath = await materializeProductVideoAsset(input.uploadPath, extension);
    if ((await stat(tempPath)).size !== objectSize) {
      throw new AuthorAccessError("video_background_upload_incomplete", 409);
    }
    const media = await inspectProductVideoBackground(tempPath);
    const expectedContainer =
      extension.toLowerCase() === "webm"
        ? media?.formatNames.some(
            (name) => name === "webm" || name === "matroska",
          )
        : media?.formatNames.some((name) => name === "mov" || name === "mp4");
    if (
      !media ||
      !expectedContainer ||
      media.durationSeconds <= 0 ||
      media.durationSeconds > PRODUCT_VIDEO_EXPORT_MAX_BACKGROUND_DURATION_SECONDS ||
      media.width <= 0 ||
      media.height <= 0 ||
      media.width * media.height > PRODUCT_VIDEO_EXPORT_MAX_BACKGROUND_PIXELS
    ) {
      throw new AuthorAccessError("invalid_video_background", 400);
    }
    posterTempPath = join(
      tmpdir(),
      `audiolad-product-video-${randomUUID()}.webp`,
    );
    await extractProductVideoBackgroundPoster(tempPath, posterTempPath);
    const poster = await sharp(posterTempPath)
      .resize(
        PRODUCT_VIDEO_ORIENTATION_META[input.orientation].width,
        PRODUCT_VIDEO_ORIENTATION_META[input.orientation].height,
        { fit: "cover", position: "centre" },
      )
      .webp({ quality: 88 })
      .toBuffer();
    const { error: posterError } = await service.storage
      .from(PRODUCT_VIDEO_EXPORT_BUCKET)
      .upload(posterPath, poster, {
        contentType: "image/webp",
        cacheControl: "31536000",
        // Finalization can be retried after a lost response. The poster is a
        // deterministic derivative of this immutable, UUID-named source.
        upsert: true,
      });
    if (posterError) throw new Error("video_background_poster_upload_failed");

    const { data: existing, error: lookupError } = await service
      .from("product_video_assets")
      .select("landscape_background_path, portrait_background_path")
      .eq("practice_id", input.practiceId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const previous = existing?.[column] ?? null;
    // Keep cover uploads independent: update only this orientation's
    // background column instead of writing a stale snapshot of every asset.
    const row = {
      practice_id: input.practiceId,
      [column]: input.uploadPath,
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await service
      .from("product_video_assets")
      .upsert(row, { onConflict: "practice_id" });
    if (updateError) throw updateError;
    persisted = true;

    if (previous && previous !== input.uploadPath) {
      await service.storage.from(PRODUCT_VIDEO_EXPORT_BUCKET).remove([
        previous,
        productVideoBackgroundPosterStoragePath(previous),
      ]);
    }
    return {
      path: input.uploadPath,
      previewUrl: await createProductVideoAssetSignedUrl(input.uploadPath),
      posterUrl: await createProductVideoAssetSignedUrl(posterPath),
    };
  } catch (error) {
    if (!persisted) {
      const { data: current } = await service
        .from("product_video_assets")
        .select("landscape_background_path, portrait_background_path")
        .eq("practice_id", input.practiceId)
        .maybeSingle();
      persisted = current?.[column] === input.uploadPath;
    }
    if (!persisted) {
      await service.storage
        .from(PRODUCT_VIDEO_EXPORT_BUCKET)
        .remove([input.uploadPath, posterPath]);
    }
    if (error instanceof AuthorAccessError) throw error;
    console.error(
      "product_video_background_finalize_error",
      error instanceof Error ? error.message : "unknown",
    );
    throw new AuthorAccessError("video_background_processing_failed", 500);
  } finally {
    if (tempPath) await removeTempFile(tempPath);
    if (posterTempPath) await removeTempFile(posterTempPath);
  }
}

export async function deleteProductVideoBackground(input: {
  practiceId: string;
  orientation: ProductVideoOrientation;
}): Promise<void> {
  const { service } = await requireProductVideoExportAccess(input.practiceId);
  const column = productVideoBackgroundColumn(input.orientation);
  const { data: existing, error: lookupError } = await service
    .from("product_video_assets")
    .select("landscape_background_path, portrait_background_path")
    .eq("practice_id", input.practiceId)
    .maybeSingle();
  if (lookupError) throw new AuthorAccessError("internal_error", 500);
  const previous = existing?.[column] ?? null;
  if (!existing) return;
  const { error: updateError } = await service
    .from("product_video_assets")
    .update({ [column]: null, updated_at: new Date().toISOString() })
    .eq("practice_id", input.practiceId);
  if (updateError) throw new AuthorAccessError("internal_error", 500);
  if (previous) {
    await service.storage.from(PRODUCT_VIDEO_EXPORT_BUCKET).remove([
      previous,
      productVideoBackgroundPosterStoragePath(previous),
    ]);
  }
}

export async function abandonProductVideoBackgroundUpload(input: {
  practiceId: string;
  orientation: ProductVideoOrientation;
  uploadPath: string;
}): Promise<void> {
  const { service } = await requireProductVideoExportAccess(input.practiceId);
  if (
    !isOwnedBackgroundPath({
      path: input.uploadPath,
      practiceId: input.practiceId,
      orientation: input.orientation,
    })
  ) {
    throw new AuthorAccessError("invalid_request", 400);
  }
  await service.storage
    .from(PRODUCT_VIDEO_EXPORT_BUCKET)
    .remove([
      input.uploadPath,
      productVideoBackgroundPosterStoragePath(input.uploadPath),
    ]);
}

export async function uploadProductVideoCover(params: {
  practiceId: string;
  orientation: ProductVideoOrientation;
  file: File;
}): Promise<{ path: string; previewUrl: string | null }> {
  const { practiceId, orientation, file } = params;
  const { service } = await requireProductVideoExportAccess(practiceId);

  if (
    file.size <= 0 ||
    file.size > PRODUCT_VIDEO_EXPORT_MAX_IMAGE_BYTES ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    throw new AuthorAccessError("invalid_video_cover", 400);
  }

  let output: Buffer;
  try {
    const meta = PRODUCT_VIDEO_ORIENTATION_META[orientation];
    output = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(meta.width, meta.height, {
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: 92 })
      .toBuffer();
  } catch {
    throw new AuthorAccessError("invalid_video_cover", 400);
  }

  const column = productVideoCoverColumn(orientation);
  const path = productVideoCoverStoragePath(
    practiceId,
    orientation,
    randomUUID(),
  );

  const { data: existing, error: existingError } = await service
    .from("product_video_assets")
    .select("landscape_cover_path, portrait_cover_path")
    .eq("practice_id", practiceId)
    .maybeSingle();
  if (existingError) {
    console.error("product_video_cover_lookup_error", existingError.message);
    throw new AuthorAccessError("internal_error", 500);
  }
  const previous =
    column === "landscape_cover_path"
      ? existing?.landscape_cover_path
      : existing?.portrait_cover_path;

  const { error: uploadError } = await service.storage
    .from(PRODUCT_VIDEO_EXPORT_BUCKET)
    .upload(path, output, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    console.error("product_video_cover_upload_error", uploadError.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  const now = new Date().toISOString();
  const row = {
    practice_id: practiceId,
    landscape_cover_path:
      column === "landscape_cover_path"
        ? path
        : (existing?.landscape_cover_path ?? null),
    portrait_cover_path:
      column === "portrait_cover_path"
        ? path
        : (existing?.portrait_cover_path ?? null),
    updated_at: now,
  };
  const { error: updateError } = await service
    .from("product_video_assets")
    .upsert(row, { onConflict: "practice_id" });
  if (updateError) {
    await service.storage.from(PRODUCT_VIDEO_EXPORT_BUCKET).remove([path]);
    const code = /path_check/i.test(updateError.message)
      ? "video_cover_path_rejected"
      : "video_cover_persist_failed";
    console.error("product_video_cover_update_error", code, updateError.message);
    throw new AuthorAccessError(code, 500);
  }

  if (previous && previous !== path) {
    const { error: removeError } = await service.storage
      .from(PRODUCT_VIDEO_EXPORT_BUCKET)
      .remove([previous]);
    if (removeError) {
      console.error(
        "product_video_previous_cover_cleanup_error",
        removeError.message,
      );
    }
  }

  return {
    path,
    previewUrl: await createProductVideoCoverSignedUrl(path),
  };
}

export async function deleteProductVideoCover(params: {
  practiceId: string;
  orientation: ProductVideoOrientation;
}): Promise<void> {
  const { practiceId, orientation } = params;
  const { service } = await requireProductVideoExportAccess(practiceId);
  const column = productVideoCoverColumn(orientation);

  const { data: existing, error: lookupError } = await service
    .from("product_video_assets")
    .select("landscape_cover_path, portrait_cover_path")
    .eq("practice_id", practiceId)
    .maybeSingle();
  if (lookupError) {
    console.error("product_video_cover_delete_lookup_error", lookupError.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  const previous =
    column === "landscape_cover_path"
      ? existing?.landscape_cover_path
      : existing?.portrait_cover_path;
  if (!existing) return;

  const patch =
    column === "landscape_cover_path"
      ? { landscape_cover_path: null, updated_at: new Date().toISOString() }
      : { portrait_cover_path: null, updated_at: new Date().toISOString() };
  const { error: updateError } = await service
    .from("product_video_assets")
    .update(patch)
    .eq("practice_id", practiceId);
  if (updateError) {
    console.error("product_video_cover_delete_update_error", updateError.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (previous) {
    const { error: removeError } = await service.storage
      .from(PRODUCT_VIDEO_EXPORT_BUCKET)
      .remove([previous]);
    if (removeError) {
      console.error("product_video_cover_delete_storage_error", removeError.message);
    }
  }
}

export async function enqueueProductVideoRender(params: {
  practiceId: string;
  audioItemId: string;
  orientation: ProductVideoOrientation;
}): Promise<ProductVideoRenderJobState> {
  const { practiceId, audioItemId, orientation } = params;
  const { practice, service } = await requireProductVideoExportAccess(practiceId);

  const [{ data: audioItem, error: audioError }, { data: assets, error: assetsError }] =
    await Promise.all([
      service
        .from("audio_items")
        .select("id, practice_id, audio_path")
        .eq("id", audioItemId)
        .eq("practice_id", practiceId)
        .maybeSingle(),
      service
        .from("product_video_assets")
        .select(
          "landscape_cover_path, portrait_cover_path, landscape_background_path, portrait_background_path",
        )
        .eq("practice_id", practiceId)
        .maybeSingle(),
    ]);

  if (audioError || assetsError) {
    console.error(
      "product_video_render_source_lookup_error",
      audioError?.message ?? assetsError?.message,
    );
    throw new AuthorAccessError("internal_error", 500);
  }
  if (!audioItem?.audio_path) {
    throw new AuthorAccessError("audio_not_ready", 409);
  }

  const backgroundPath =
    orientation === "landscape_16_9"
      ? assets?.landscape_background_path
      : assets?.portrait_background_path;
  const coverPath =
    orientation === "landscape_16_9"
      ? assets?.landscape_cover_path
      : assets?.portrait_cover_path;
  const visualPath = backgroundPath || coverPath;
  if (!visualPath) {
    throw new AuthorAccessError("video_visual_required", 409);
  }

  const { data, error } = await service.rpc("enqueue_product_video_render_job", {
    p_practice_id: practiceId,
    p_author_id: practice.author_id,
    p_audio_item_id: audioItemId,
    p_orientation: orientation,
    p_source_audio_path: audioItem.audio_path,
    p_source_cover_path: visualPath,
  });
  if (error || !data) {
    console.error("product_video_render_enqueue_error", error?.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  return data as ProductVideoRenderJobState;
}

export async function getProductVideoRenderStates(params: {
  practiceId: string;
  audioItemId: string;
}): Promise<Record<ProductVideoOrientation, (ProductVideoRenderJobState & { stale: boolean }) | null>> {
  const { practiceId, audioItemId } = params;
  const { service } = await requireProductVideoExportAccess(practiceId);

  const [{ data: item, error: itemError }, { data: assets, error: assetError }, { data: jobs, error: jobsError }] =
    await Promise.all([
      service
        .from("audio_items")
        .select("id, audio_path")
        .eq("id", audioItemId)
        .eq("practice_id", practiceId)
        .maybeSingle(),
      service
        .from("product_video_assets")
        .select(
          "landscape_cover_path, portrait_cover_path, landscape_background_path, portrait_background_path",
        )
        .eq("practice_id", practiceId)
        .maybeSingle(),
      service
        .from("product_video_render_jobs")
        .select(
          "id, practice_id, author_id, audio_item_id, orientation, source_audio_path, source_cover_path, output_storage_path, status, attempt_count, error_code, error_message_safe, progress_percent, created_at, completed_at, render_recipe",
        )
        .eq("practice_id", practiceId)
        .eq("audio_item_id", audioItemId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  if (itemError || assetError || jobsError) {
    console.error(
      "product_video_render_state_lookup_error",
      itemError?.message ?? assetError?.message ?? jobsError?.message,
    );
    throw new AuthorAccessError("internal_error", 500);
  }

  const result: Record<
    ProductVideoOrientation,
    (ProductVideoRenderJobState & { stale: boolean }) | null
  > = {
    landscape_16_9: null,
    portrait_9_16: null,
  };

  for (const raw of jobs ?? []) {
    const orientation = parseProductVideoOrientation(raw.orientation);
    if (!orientation || result[orientation]) continue;
    const currentBackground =
      orientation === "landscape_16_9"
        ? assets?.landscape_background_path
        : assets?.portrait_background_path;
    const currentCover =
      orientation === "landscape_16_9"
        ? assets?.landscape_cover_path
        : assets?.portrait_cover_path;
    const currentVisual = currentBackground || currentCover;
    const job = raw as ProductVideoRenderJobState;
    result[orientation] = {
      ...job,
      orientation,
      stale: isProductVideoRenderJobStale({
        status: job.status,
        sourceAudioPath: job.source_audio_path,
        sourceCoverPath: job.source_cover_path,
        renderRecipe: job.render_recipe,
        currentAudioPath: item?.audio_path,
        currentCoverPath: currentVisual,
      }),
    };
  }

  return result;
}

export async function downloadLatestProductVideo(params: {
  practiceId: string;
  audioItemId: string;
  orientation: ProductVideoOrientation;
}) {
  const states = await getProductVideoRenderStates({
    practiceId: params.practiceId,
    audioItemId: params.audioItemId,
  });
  const job = states[params.orientation];
  if (
    !job ||
    job.stale ||
    job.status !== "completed" ||
    !job.output_storage_path
  ) {
    throw new AuthorAccessError("not_found", 404);
  }

  const service = createServiceRoleClient();
  const { data, error } = await service.storage
    .from(PRODUCT_VIDEO_EXPORT_BUCKET)
    .download(job.output_storage_path);
  if (error || !data) {
    throw new AuthorAccessError("not_found", 404);
  }
  return data;
}

export async function createLatestProductVideoPlaybackUrl(params: {
  practiceId: string;
  audioItemId: string;
  orientation: ProductVideoOrientation;
}): Promise<string> {
  const states = await getProductVideoRenderStates({
    practiceId: params.practiceId,
    audioItemId: params.audioItemId,
  });
  const job = states[params.orientation];
  if (
    !job ||
    job.stale ||
    job.status !== "completed" ||
    !job.output_storage_path
  ) {
    throw new AuthorAccessError("not_found", 404);
  }
  const { data, error } = await createServiceRoleClient().storage
    .from(PRODUCT_VIDEO_EXPORT_BUCKET)
    .createSignedUrl(job.output_storage_path, 300);
  if (error || !data?.signedUrl) {
    throw new AuthorAccessError("not_found", 404);
  }
  return data.signedUrl;
}
