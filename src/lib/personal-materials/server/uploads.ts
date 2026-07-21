import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getMp3DurationSeconds,
  isAllowedMp3File,
} from "@/lib/author-products/media";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildPersonalMaterialAudioPath,
  buildPersonalMaterialDocumentPath,
  isPathInsidePersonalMaterialRoot,
  PERSONAL_MATERIALS_BUCKET,
} from "@/lib/personal-materials/storage";
import { validatePdfUpload } from "@/lib/personal-materials/server/pdf-validation";
import {
  PERSONAL_MATERIAL_LIMITS,
  type PersonalMaterialRow,
} from "@/lib/personal-materials/types";

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
  if (material.status !== "draft") {
    throw new PersonalMaterialApiError("material_not_editable", 409);
  }

  if (!isAllowedMp3File(file)) {
    throw new PersonalMaterialApiError("invalid_file_type", 400);
  }

  if (file.size <= 0 || file.size > PERSONAL_MATERIAL_LIMITS.maxAudioBytes) {
    throw new PersonalMaterialApiError("invalid_file_size", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const durationSeconds = await getMp3DurationSeconds(buffer);

  if (!durationSeconds) {
    throw new PersonalMaterialApiError("invalid_audio_duration", 400);
  }

  const storagePath = buildPersonalMaterialAudioPath(
    material.author_id,
    material.id,
    file.name,
  );

  if (!isPathInsidePersonalMaterialRoot(storagePath)) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const service = createServiceRoleClient();
  const previousPath = material.audio_path?.trim() || null;

  const { error: uploadError } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (uploadError) {
    console.error("personal_material_audio_upload_error", uploadError.message);
    throw new PersonalMaterialApiError("upload_failed", 500);
  }

  const { error: updateError } = await service
    .from("personal_materials")
    .update({
      audio_path: storagePath,
      audio_original_filename: file.name,
      audio_mime_type: "audio/mpeg",
      audio_size_bytes: file.size,
      duration_seconds: durationSeconds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", material.id)
    .eq("status", "draft");

  if (updateError) {
    await service.storage.from(PERSONAL_MATERIALS_BUCKET).remove([storagePath]);
    console.error("personal_material_audio_db_update_error", updateError.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  if (previousPath && previousPath !== storagePath) {
    await removeStorageObjects(service, [previousPath]);
  }

  return {
    durationSeconds,
    originalFilename: file.name,
    mimeType: "audio/mpeg",
    sizeBytes: file.size,
    storagePath,
  };
}

export async function deletePersonalMaterialAudio(
  supabase: SupabaseClient,
  material: PersonalMaterialRow,
): Promise<void> {
  if (material.status !== "draft") {
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
