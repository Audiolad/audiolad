import { randomUUID } from "node:crypto";
import path from "node:path";

export const PERSONAL_MATERIALS_BUCKET = "personal-materials" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function assertUuid(value: string, fieldName: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`invalid_${fieldName}`);
  }
}

export function sanitizeStorageFilename(originalName: string): string {
  const baseName = path.basename(originalName.trim());
  const normalized = baseName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);

  if (!normalized || !SAFE_FILENAME_PATTERN.test(normalized)) {
    return `${randomUUID()}.bin`;
  }

  return normalized;
}

export function buildPersonalMaterialAudioPath(
  authorId: string,
  materialId: string,
  originalFilename: string,
): string {
  assertUuid(authorId, "author_id");
  assertUuid(materialId, "material_id");

  const safeFilename = sanitizeStorageFilename(originalFilename);

  return `${authorId}/${materialId}/audio/${safeFilename}`;
}

export function buildPersonalMaterialDocumentPath(
  authorId: string,
  materialId: string,
  originalFilename: string,
): string {
  assertUuid(authorId, "author_id");
  assertUuid(materialId, "material_id");

  const safeFilename = sanitizeStorageFilename(originalFilename);

  return `${authorId}/${materialId}/documents/${safeFilename}`;
}

export function isPathInsidePersonalMaterialRoot(storagePath: string): boolean {
  const normalized = storagePath.replace(/\\/g, "/").trim();

  if (!normalized || normalized.includes("..")) {
    return false;
  }

  const segments = normalized.split("/").filter(Boolean);

  if (segments.length !== 4) {
    return false;
  }

  const [authorId, materialId, kind] = segments;

  if (!UUID_PATTERN.test(authorId) || !UUID_PATTERN.test(materialId)) {
    return false;
  }

  return kind === "audio" || kind === "documents";
}
