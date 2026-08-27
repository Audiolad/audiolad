import { isCoursePublication } from "@/lib/author-products/publication-class";
import {
  hasPdfMagicBytes,
  isAllowedPdfMimeType,
} from "@/lib/personal-materials/server/pdf-validation";
import { PERSONAL_MATERIAL_LIMITS } from "@/lib/personal-materials/types";

import {
  COURSE_LESSON_BLOCK_TYPES,
  PUBLICATION_FILE_MAX_PDF_BYTES,
  PUBLICATION_FILE_PDF_MIME,
  type CourseLessonBlockType,
} from "./types";

/**
 * Course lesson PDF cap (5 MB). Personal-materials keeps its own 20 MB
 * limit; only magic-byte / MIME helpers are shared.
 */
export const PUBLICATION_FILE_LIMITS = {
  maxPdfBytes: PUBLICATION_FILE_MAX_PDF_BYTES,
  signedUrlTtlSeconds: PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds,
} as const;

export function isCourseLessonBlockType(
  value: string | null | undefined,
): value is CourseLessonBlockType {
  return COURSE_LESSON_BLOCK_TYPES.includes(value as CourseLessonBlockType);
}

export { isCoursePublication };

export function isPublicationFilePdfMime(
  mime: string | null | undefined,
): boolean {
  return isAllowedPdfMimeType(mime) && mime?.trim().toLowerCase() === PUBLICATION_FILE_PDF_MIME;
}

export function validatePublicationPdfUpload(input: {
  file: File;
  buffer: Buffer;
}): { ok: true } | { ok: false; code: "invalid_file_type" | "invalid_file_size" } {
  if (
    input.file.size <= 0 ||
    input.file.size > PUBLICATION_FILE_LIMITS.maxPdfBytes ||
    input.buffer.length > PUBLICATION_FILE_LIMITS.maxPdfBytes
  ) {
    return { ok: false, code: "invalid_file_size" };
  }

  if (!isAllowedPdfMimeType(input.file.type) || !hasPdfMagicBytes(input.buffer)) {
    return { ok: false, code: "invalid_file_type" };
  }

  return { ok: true };
}

export { hasPdfMagicBytes, isAllowedPdfMimeType };

export type CourseLessonBlockValidation =
  | { ok: true; type: CourseLessonBlockType }
  | { ok: false; reason: string };

export function validateCourseLessonBlock(input: {
  type: string | null | undefined;
  assetId: string | null | undefined;
  payload: unknown;
}): CourseLessonBlockValidation {
  if (!isCourseLessonBlockType(input.type)) {
    return { ok: false, reason: "invalid_block_type" };
  }

  if (input.type === "text") {
    if (input.assetId != null) {
      return { ok: false, reason: "text_block_must_not_have_asset" };
    }

    if (
      input.payload == null ||
      typeof input.payload !== "object" ||
      Array.isArray(input.payload) ||
      typeof (input.payload as { text?: unknown }).text !== "string"
    ) {
      return { ok: false, reason: "text_block_requires_text_payload" };
    }

    return { ok: true, type: "text" };
  }

  if (input.assetId == null || input.assetId.trim() === "") {
    return { ok: false, reason: `${input.type}_block_requires_asset` };
  }

  if (
    input.payload != null &&
    (typeof input.payload !== "object" || Array.isArray(input.payload))
  ) {
    return { ok: false, reason: `${input.type}_block_payload_must_be_object` };
  }

  return { ok: true, type: input.type };
}

export function validateCourseParentClass(
  publicationClass: string | null | undefined,
): { ok: true } | { ok: false; reason: "course_content_parent_must_be_course" } {
  if (publicationClass === "course") {
    return { ok: true };
  }

  return { ok: false, reason: "course_content_parent_must_be_course" };
}
