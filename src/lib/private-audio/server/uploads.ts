import { randomUUID } from "node:crypto";

import {
  getMp3DurationSeconds,
} from "@/lib/author-products/media";
import { processPlaylistCoverImage } from "@/lib/playlists/cover-image";
import { PRIVATE_AUDIO_DEFAULT_SOURCE_TYPE } from "@/lib/private-audio/limits";
import { PRIVATE_AUDIO_LIMITS } from "@/lib/private-audio/limits";
import {
  buildPrivateAudioPath,
  buildPrivateCoverPath,
  isOwnedPrivateAudioPrefix,
  isPathInsidePrivateAudioRoot,
  PRIVATE_AUDIO_BUCKET,
} from "@/lib/private-audio/storage";
import { PrivateAudioApiError } from "@/lib/private-audio/server/errors";
import {
  deletePrivateAudioItemRow,
  getOwnedPrivateAudioItem,
  getPrivateAudioQuotaUsage,
  insertPrivateAudioItem,
  updatePrivateAudioCoverPath,
} from "@/lib/private-audio/server/repository";
import type { PrivateAudioItemRow } from "@/lib/private-audio/types";
import {
  isAllowedPrivateCoverFile,
  isAllowedPrivateMp3File,
  normalizePrivateAuthorText,
  normalizePrivateTitle,
  wouldExceedPrivateAudioQuota,
} from "@/lib/private-audio/validation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

async function removeStorageObjects(paths: string[]): Promise<void> {
  const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];

  if (unique.length === 0) {
    return;
  }

  const service = createServiceRoleClient();
  const { error } = await service.storage
    .from(PRIVATE_AUDIO_BUCKET)
    .remove(unique);

  if (error) {
    console.error("private_audio_storage_remove_error", error.message, {
      paths: unique,
    });
  }
}

async function uploadCoverBuffer(input: {
  ownerUserId: string;
  itemId: string;
  file: File;
}): Promise<string> {
  if (!isAllowedPrivateCoverFile(input.file)) {
    throw new PrivateAudioApiError("invalid_cover_type", 400);
  }

  if (input.file.size <= 0) {
    throw new PrivateAudioApiError("empty_file", 400);
  }

  if (input.file.size > PRIVATE_AUDIO_LIMITS.maxCoverBytes) {
    throw new PrivateAudioApiError("cover_too_large", 400);
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const processed = await processPlaylistCoverImage(buffer, input.file.type);

  if (!processed.ok) {
    throw new PrivateAudioApiError("cover_process_failed", 400);
  }

  const coverPath = buildPrivateCoverPath(input.ownerUserId, input.itemId);

  if (
    !isPathInsidePrivateAudioRoot(coverPath, input.ownerUserId, input.itemId)
  ) {
    throw new PrivateAudioApiError("invalid_request", 400);
  }

  const service = createServiceRoleClient();
  const { error } = await service.storage
    .from(PRIVATE_AUDIO_BUCKET)
    .upload(coverPath, processed.buffer, {
      contentType: "image/webp",
      upsert: false,
    });

  if (error) {
    console.error("private_audio_cover_upload_error", error.message);
    throw new PrivateAudioApiError("storage_upload_failed", 500);
  }

  return coverPath;
}

export async function createPrivateAudioItemWithUpload(input: {
  ownerUserId: string;
  title: string;
  authorText: string | null | undefined;
  rightsAccepted: boolean;
  audioFile: File;
  coverFile?: File | null;
}): Promise<PrivateAudioItemRow> {
  if (!input.rightsAccepted) {
    throw new PrivateAudioApiError("rights_required", 422);
  }

  const title = normalizePrivateTitle(input.title);

  if (!title) {
    throw new PrivateAudioApiError("invalid_title", 422);
  }

  const authorText = normalizePrivateAuthorText(input.authorText);

  if (
    input.authorText != null &&
    String(input.authorText).trim() !== "" &&
    authorText === null
  ) {
    throw new PrivateAudioApiError("invalid_author_text", 422);
  }

  if (!isAllowedPrivateMp3File(input.audioFile)) {
    throw new PrivateAudioApiError("invalid_file_type", 400);
  }

  if (input.audioFile.size <= 0) {
    throw new PrivateAudioApiError("empty_file", 400);
  }

  if (input.audioFile.size > PRIVATE_AUDIO_LIMITS.maxAudioBytes) {
    throw new PrivateAudioApiError("file_too_large", 400);
  }

  const quota = await getPrivateAudioQuotaUsage(input.ownerUserId);

  if (
    wouldExceedPrivateAudioQuota({
      currentItemCount: quota.itemCount,
      currentTotalBytes: quota.totalBytes,
      additionalBytes: input.audioFile.size,
      additionalItems: 1,
    })
  ) {
    throw new PrivateAudioApiError("quota_exceeded", 422);
  }

  const audioBuffer = Buffer.from(await input.audioFile.arrayBuffer());
  const durationSeconds = await getMp3DurationSeconds(audioBuffer);

  if (!durationSeconds) {
    throw new PrivateAudioApiError("invalid_audio_duration", 400);
  }

  const itemId = randomUUID();
  const audioPath = buildPrivateAudioPath(input.ownerUserId, itemId);

  if (!isPathInsidePrivateAudioRoot(audioPath, input.ownerUserId, itemId)) {
    throw new PrivateAudioApiError("invalid_request", 400);
  }

  const service = createServiceRoleClient();
  const uploadedPaths: string[] = [];

  try {
    const { error: audioUploadError } = await service.storage
      .from(PRIVATE_AUDIO_BUCKET)
      .upload(audioPath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (audioUploadError) {
      console.error("private_audio_upload_error", audioUploadError.message);
      throw new PrivateAudioApiError("storage_upload_failed", 500);
    }

    uploadedPaths.push(audioPath);

    let coverPath: string | null = null;

    if (input.coverFile) {
      coverPath = await uploadCoverBuffer({
        ownerUserId: input.ownerUserId,
        itemId,
        file: input.coverFile,
      });
      uploadedPaths.push(coverPath);
    }

    // Re-check quota after upload to reduce race window before insert.
    const quotaAfter = await getPrivateAudioQuotaUsage(input.ownerUserId);

    if (
      wouldExceedPrivateAudioQuota({
        currentItemCount: quotaAfter.itemCount,
        currentTotalBytes: quotaAfter.totalBytes,
        additionalBytes: input.audioFile.size,
        additionalItems: 1,
      })
    ) {
      throw new PrivateAudioApiError("quota_exceeded", 422);
    }

    void PRIVATE_AUDIO_DEFAULT_SOURCE_TYPE;

    const row = await insertPrivateAudioItem({
      id: itemId,
      ownerUserId: input.ownerUserId,
      title,
      authorText,
      audioPath,
      audioMimeType: "audio/mpeg",
      audioSizeBytes: input.audioFile.size,
      durationSeconds,
      originalFilename: input.audioFile.name.slice(0, 240) || null,
      coverPath,
      rightsAcceptedAt: new Date().toISOString(),
    });

    return row;
  } catch (error) {
    await removeStorageObjects(uploadedPaths);
    throw error;
  }
}

export async function replacePrivateAudioCover(input: {
  ownerUserId: string;
  itemId: string;
  coverFile: File;
}): Promise<PrivateAudioItemRow> {
  const existing = await getOwnedPrivateAudioItem(
    input.ownerUserId,
    input.itemId,
  );
  const previousPath = existing.cover_path;

  const coverPath = await uploadCoverBuffer({
    ownerUserId: input.ownerUserId,
    itemId: input.itemId,
    file: input.coverFile,
  });

  try {
    const updated = await updatePrivateAudioCoverPath({
      ownerUserId: input.ownerUserId,
      itemId: input.itemId,
      coverPath,
    });

    if (previousPath && previousPath !== coverPath) {
      await removeStorageObjects([previousPath]);
    }

    return updated;
  } catch (error) {
    await removeStorageObjects([coverPath]);
    throw error;
  }
}

export async function deletePrivateAudioCover(input: {
  ownerUserId: string;
  itemId: string;
}): Promise<PrivateAudioItemRow> {
  const existing = await getOwnedPrivateAudioItem(
    input.ownerUserId,
    input.itemId,
  );

  if (!existing.cover_path) {
    return existing;
  }

  const previousPath = existing.cover_path;
  const updated = await updatePrivateAudioCoverPath({
    ownerUserId: input.ownerUserId,
    itemId: input.itemId,
    coverPath: null,
  });

  await removeStorageObjects([previousPath]);

  return updated;
}

export async function deletePrivateAudioItemCompletely(input: {
  ownerUserId: string;
  itemId: string;
}): Promise<void> {
  const existing = await deletePrivateAudioItemRow(input);
  const paths = [existing.audio_path, existing.cover_path].filter(
    (path): path is string => Boolean(path),
  );

  await removeStorageObjects(paths);
}

export async function cleanupPrivateAudioStorageForUser(
  ownerUserId: string,
): Promise<{ removedItems: number; removedPaths: number }> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("private_audio_items")
    .select("id, audio_path, cover_path")
    .eq("owner_user_id", ownerUserId);

  if (error) {
    console.error("private_audio_cleanup_list_error", error.message);
    throw new Error("private_audio_cleanup_list_failed");
  }

  const rows = data ?? [];
  const paths: string[] = [];

  for (const row of rows) {
    if (
      typeof row.audio_path === "string" &&
      isOwnedPrivateAudioPrefix(row.audio_path, ownerUserId)
    ) {
      paths.push(row.audio_path);
    }

    if (
      typeof row.cover_path === "string" &&
      isOwnedPrivateAudioPrefix(row.cover_path, ownerUserId)
    ) {
      paths.push(row.cover_path);
    }
  }

  if (rows.length > 0) {
    const { error: deleteError } = await service
      .from("private_audio_items")
      .delete()
      .eq("owner_user_id", ownerUserId);

    if (deleteError) {
      console.error("private_audio_cleanup_delete_error", deleteError.message);
      throw new Error("private_audio_cleanup_delete_failed");
    }
  }

  await removeStorageObjects(paths);

  // Best-effort: remove any leftover objects under the user prefix.
  const { data: listed, error: listError } = await service.storage
    .from(PRIVATE_AUDIO_BUCKET)
    .list(ownerUserId, { limit: 100 });

  if (!listError && listed && listed.length > 0) {
    for (const entry of listed) {
      if (!entry.name) {
        continue;
      }

      const prefix = `${ownerUserId}/${entry.name}`;
      const { data: nested } = await service.storage
        .from(PRIVATE_AUDIO_BUCKET)
        .list(prefix, { limit: 100 });

      if (!nested) {
        continue;
      }

      for (const nestedEntry of nested) {
        if (!nestedEntry.name) {
          continue;
        }

        const nestedPrefix = `${prefix}/${nestedEntry.name}`;
        const { data: files } = await service.storage
          .from(PRIVATE_AUDIO_BUCKET)
          .list(nestedPrefix, { limit: 100 });

        const filePaths = (files ?? [])
          .map((file) =>
            file.name ? `${nestedPrefix}/${file.name}` : null,
          )
          .filter((path): path is string => Boolean(path));

        await removeStorageObjects(filePaths);
      }
    }
  }

  return {
    removedItems: rows.length,
    removedPaths: paths.length,
  };
}
