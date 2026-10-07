import "server-only";

import { randomUUID } from "node:crypto";

import sharp from "sharp";

import {
  AuthorAccessError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  PRODUCT_VIDEO_EXPORT_BUCKET,
  PRODUCT_VIDEO_EXPORT_MAX_IMAGE_BYTES,
  PRODUCT_VIDEO_ORIENTATION_META,
  isProductVideoExportAuthorSlug,
  parseProductVideoOrientation,
  productVideoCoverColumn,
  productVideoCoverStoragePath,
  type ProductVideoOrientation,
} from "./contract";

export type ProductVideoAssetState = {
  landscape_cover_path: string | null;
  portrait_cover_path: string | null;
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
};

export async function requireProductVideoExportAccess(practiceId: string) {
  const context = await requirePracticeMutationAccess(practiceId);
  const { data: author, error } = await context.supabase
    .from("authors")
    .select("slug")
    .eq("id", context.practice.author_id)
    .maybeSingle();

  if (error) {
    console.error("product_video_author_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }
  if (!isProductVideoExportAuthorSlug(author?.slug)) {
    throw new AuthorAccessError("forbidden", 403);
  }

  return {
    ...context,
    authorSlug: author!.slug as string,
    service: createServiceRoleClient(),
  };
}

export async function getProductVideoAssets(
  practiceId: string,
): Promise<ProductVideoAssetState> {
  const { service } = await requireProductVideoExportAccess(practiceId);
  const { data, error } = await service
    .from("product_video_assets")
    .select("landscape_cover_path, portrait_cover_path, updated_at")
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (error) {
    console.error("product_video_assets_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  return {
    landscape_cover_path: data?.landscape_cover_path ?? null,
    portrait_cover_path: data?.portrait_cover_path ?? null,
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
        .select("landscape_cover_path, portrait_cover_path")
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

  const coverPath =
    orientation === "landscape_16_9"
      ? assets?.landscape_cover_path
      : assets?.portrait_cover_path;
  if (!coverPath) {
    throw new AuthorAccessError("video_cover_required", 409);
  }

  const { data, error } = await service.rpc("enqueue_product_video_render_job", {
    p_practice_id: practiceId,
    p_author_id: practice.author_id,
    p_audio_item_id: audioItemId,
    p_orientation: orientation,
    p_source_audio_path: audioItem.audio_path,
    p_source_cover_path: coverPath,
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
        .select("landscape_cover_path, portrait_cover_path")
        .eq("practice_id", practiceId)
        .maybeSingle(),
      service
        .from("product_video_render_jobs")
        .select(
          "id, practice_id, author_id, audio_item_id, orientation, source_audio_path, source_cover_path, output_storage_path, status, attempt_count, error_code, error_message_safe, progress_percent, created_at, completed_at",
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
    const currentCover =
      orientation === "landscape_16_9"
        ? assets?.landscape_cover_path
        : assets?.portrait_cover_path;
    const job = raw as ProductVideoRenderJobState;
    result[orientation] = {
      ...job,
      orientation,
      stale:
        !item?.audio_path ||
        job.source_audio_path !== item.audio_path ||
        !currentCover ||
        job.source_cover_path !== currentCover,
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
