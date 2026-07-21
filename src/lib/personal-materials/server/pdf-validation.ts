import { PERSONAL_MATERIAL_LIMITS } from "@/lib/personal-materials/types";

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

export function hasPdfMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC.length) {
    return false;
  }

  return buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

export function isAllowedPdfMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) {
    return false;
  }

  return mimeType.trim().toLowerCase() === "application/pdf";
}

export function validatePdfUpload(input: {
  file: File;
  buffer: Buffer;
}): { ok: true } | { ok: false; code: "invalid_file_type" | "invalid_file_size" } {
  if (!isAllowedPdfMimeType(input.file.type)) {
    return { ok: false, code: "invalid_file_type" };
  }

  if (
    input.file.size <= 0 ||
    input.file.size > PERSONAL_MATERIAL_LIMITS.maxPdfBytes ||
    input.buffer.length > PERSONAL_MATERIAL_LIMITS.maxPdfBytes
  ) {
    return { ok: false, code: "invalid_file_size" };
  }

  if (!hasPdfMagicBytes(input.buffer)) {
    return { ok: false, code: "invalid_file_type" };
  }

  return { ok: true };
}
