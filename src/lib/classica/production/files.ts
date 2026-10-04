export const CLASSICA_MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const CLASSICA_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const CLASSICA_MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
]);

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const SOURCE_MIME = new Set([
  ...AUDIO_MIME,
  "audio/midi",
  "audio/mid",
  "application/pdf",
  "application/xml",
  "text/xml",
  "text/plain",
  "application/octet-stream",
  "application/zip",
]);

const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/midi": "mid",
  "audio/mid": "mid",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/plain": "txt",
  "application/zip": "zip",
  "application/octet-stream": "bin",
};

export type ClassicaAssetKind =
  | "source_file"
  | "source_render"
  | "final_audio"
  | "cover"
  | "slider";

export function classicaAssetMaxBytes(kind: ClassicaAssetKind): number {
  if (kind === "cover" || kind === "slider") {
    return CLASSICA_MAX_IMAGE_BYTES;
  }
  if (kind === "source_file") {
    return CLASSICA_MAX_SOURCE_BYTES;
  }
  return CLASSICA_MAX_AUDIO_BYTES;
}

export function classicaAssetAllowsMime(kind: ClassicaAssetKind, mime: string): boolean {
  if (kind === "cover" || kind === "slider") {
    return IMAGE_MIME.has(mime);
  }
  if (kind === "source_file") {
    return SOURCE_MIME.has(mime);
  }
  return AUDIO_MIME.has(mime);
}

export function classicaAssetExtension(mime: string): string | null {
  return EXTENSIONS[mime] ?? null;
}

export function classicaChosenFileError(
  kind: ClassicaAssetKind,
  file: { type: string; size: number },
): string | null {
  if (file.size <= 0) {
    return "Выберите файл.";
  }
  if (!classicaAssetAllowsMime(kind, file.type)) {
    return "Этот тип файла для выбранного поля не подходит.";
  }
  if (file.size > classicaAssetMaxBytes(kind)) {
    return "Файл больше допустимого размера.";
  }
  if (!classicaAssetExtension(file.type)) {
    return "Не удалось определить расширение файла.";
  }
  return null;
}

export function classicaAssetFileLabel(storagePath: string): string {
  const name = storagePath.split("/").filter(Boolean).pop()?.trim() ?? "";
  return name || "Файл";
}

export function formatClassicaByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 Б";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} Б`;
  }
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    const digits = kilobytes >= 10 ? 0 : 1;
    return `${formatRuQuantity(kilobytes, digits)} КБ`;
  }
  const megabytes = kilobytes / 1024;
  const digits = megabytes >= 10 ? 1 : 2;
  return `${formatRuQuantity(megabytes, digits)} МБ`;
}

function formatRuQuantity(value: number, maximumFractionDigits: number): string {
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  });
}

export function classicaProductionObjectPath(
  jobId: string,
  kind: ClassicaAssetKind,
  assetId: string,
  extension: string,
): string {
  return `${jobId}/${kind}/${assetId}.${extension}`;
}

export function classicaPublishedObjectPath(
  jobId: string,
  folder: "audio" | "cover" | "slider",
  fileName: string,
): string {
  return `works/${jobId}/${folder}/${fileName}`;
}

export type ClassicaPublicCopyAttempt = {
  path: string;
  existedBefore: boolean;
};

/** Paths uploaded during a failed publication. Pre-existing public objects stay. */
export function classicaPublishCleanupPaths(
  copies: readonly ClassicaPublicCopyAttempt[],
): string[] {
  return copies.filter((copy) => copy.existedBefore === false).map((copy) => copy.path);
}
