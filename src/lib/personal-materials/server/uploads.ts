import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getPersonalMaterialAudioFileIssue,
  resolvePersonalMaterialAudioFormat,
} from "@/lib/personal-materials/audio-format";
import { probePersonalMaterialAudioDuration } from "@/lib/personal-materials/server/audio-probe";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildPersonalMaterialAudioPath,
  buildPersonalMaterialDocumentPath,
  isPathInsidePersonalMaterialRoot,
  PERSONAL_MATERIALS_BUCKET,
  resolveReplacedPersonalMaterialStoragePath,
} from "@/lib/personal-materials/storage";
import { validatePdfUpload } from "@/lib/personal-materials/server/pdf-validation";
import type { PersonalMaterialRow } from "@/lib/personal-materials/types";

import { PersonalMaterialApiError } from "./errors";
import { clearPersonalMaterialDraftAudio, clearPersonalMaterialDraftPdf } from "./repository";

export type UploadedAudioMetadata = {
  durationSeconds: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

export type UploadedPdfMetadata = {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

export async function uploadPersonalMaterialAudio(
  material: PersonalMaterialRow,
  file: File,
): Promise<UploadedAudioMetadata> {
  if (
    material.status !== "draft" &&
    material.status !== "active" &&
    material.status !== "revoked"
  ) {
    throw new PersonalMaterialApiError("material_not_editable", 409);
  }

  const format = resolvePersonalMaterialAudioFormat(file);
  const fileIssue = getPersonalMaterialAudioFileIssue(file);

  if (!format || fileIssue === "invalid_file_type") {
    throw new PersonalMaterialApiError("invalid_file_type", 400);
  }

  if (fileIssue === "empty_file") {
    throw new PersonalMaterialApiError("empty_file", 400);
  }

  if (fileIssue === "file_too_large") {
    throw new PersonalMaterialApiError("file_too_large", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const durationSeconds = await probePersonalMaterialAudioDuration(
    buffer,
    format.extension,
  );

  if (!durationSeconds) {
    throw new PersonalMaterialApiError("invalid_audio_duration", 400);
  }

  const storagePath = buildPersonalMaterialAudioPath(
    material.author_id,
    material.id,
    format.extension,
  );

  if (!isPathInsidePersonalMaterialRoot(storagePath)) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const service = createServiceRoleClient();
  const previousPath = material.audio_path?.trim() || null;

  const { error: uploadError } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: format.mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error("personal_material_audio_upload_error", {
      code: "storage_upload_failed",
      materialId: material.id,
      authorId: material.author_id,
      message: uploadError.message,
    });
    throw new PersonalMaterialApiError("storage_upload_failed", 500);
  }

  const { error: updateError } = await service
    .from("personal_materials")
    .update({
      audio_path: storagePath,
      audio_original_filename: file.name,
      audio_mime_type: format.mimeType,
      audio_size_bytes: file.size,
      duration_seconds: durationSeconds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", material.id)
    .in("status", ["draft", "active", "revoked"]);

  if (updateError) {
    await service.storage.from(PERSONAL_MATERIALS_BUCKET).remove([storagePath]);
    console.error("personal_material_audio_db_update_error", updateError.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const replacedPath = resolveReplacedPersonalMaterialStoragePath(
    previousPath,
    storagePath,
  );

  if (replacedPath) {
    await removeStorageObjects(service, [replacedPath]);
  }

  return {
    durationSeconds,
    originalFilename: file.name,
    mimeType: format.mimeType,
    sizeBytes: file.size,
    storagePath,
  };
}

export async function deletePersonalMaterialAudio(
  supabase: SupabaseClient,
  material: PersonalMaterialRow,
): Promise<void> {
  if (
    material.status !== "draft" &&
    material.status !== "active" &&
    material.status !== "revoked"
  ) {
    throw new PersonalMaterialApiError("material_not_editable", 409);
  }

  const previousPath = material.audio_path?.trim() || null;
  const service = createServiceRoleClient();

  await clearPersonalMaterialDraftAudio(supabase, material.id);

  if (previousPath) {
    await removeStorageObjects(service, [previousPath]);
  }
}

export async function uploadPersonalMaterialPdf(
  material: PersonalMaterialRow,
  file: File,
): Promise<UploadedPdfMetadata> {
  if (material.status !== "draft") {
    throw new PersonalMaterialApiError("material_not_editable", 409);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validatePdfUpload({ file, buffer });

  if (!validation.ok) {
    throw new PersonalMaterialApiError(validation.code, 400);
  }

  const storagePath = buildPersonalMaterialDocumentPath(
    material.author_id,
    material.id,
    file.name,
  );

  if (!isPathInsidePersonalMaterialRoot(storagePath)) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const service = createServiceRoleClient();
  const previousPath = material.pdf_path?.trim() || null;

  const { error: uploadError } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    console.error("personal_material_pdf_upload_error", uploadError.message);
    throw new PersonalMaterialApiError("upload_failed", 500);
  }

  const { error: updateError } = await service
    .from("personal_materials")
    .update({
      pdf_path: storagePath,
      pdf_original_filename: file.name,
      pdf_mime_type: "application/pdf",
      pdf_size_bytes: file.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", material.id)
    .eq("status", "draft");

  if (updateError) {
    await service.storage.from(PERSONAL_MATERIALS_BUCKET).remove([storagePath]);
    console.error("personal_material_pdf_db_update_error", updateError.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  if (previousPath && previousPath !== storagePath) {
    await removeStorageObjects(service, [previousPath]);
  }

  return {
    originalFilename: file.name,
    mimeType: "application/pdf",
    sizeBytes: file.size,
    storagePath,
  };
}

export async function deletePersonalMaterialPdf(
  supabase: SupabaseClient,
  material: PersonalMaterialRow,
): Promise<void> {
  if (material.status !== "draft") {
    throw new PersonalMaterialApiError("material_not_editable", 409);
  }

  const previousPath = material.pdf_path?.trim() || null;
  const service = createServiceRoleClient();

  await clearPersonalMaterialDraftPdf(supabase, material.id);

  if (previousPath) {
    await removeStorageObjects(service, [previousPath]);
  }
}

export async function removeStorageObjects(
  service: SupabaseClient,
  paths: string[],
): Promise<void> {
  const safePaths = paths.filter(
    (path) => path && isPathInsidePersonalMaterialRoot(path),
  );

  if (safePaths.length === 0) {
    return;
  }

  const { error } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .remove(safePaths);

  if (error) {
    console.error("personal_material_storage_remove_error", error.message);
  }
}

export async function removePersonalMaterialStorageFiles(
  material: Pick<PersonalMaterialRow, "audio_path" | "pdf_path">,
): Promise<void> {
  const service = createServiceRoleClient();
  const paths = [material.audio_path, material.pdf_path].filter(
    (path): path is string => Boolean(path?.trim()),
  );

  await removeStorageObjects(service, paths);
}
