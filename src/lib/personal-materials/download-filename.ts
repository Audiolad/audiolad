const CONTROL_CHARS_PATTERN = /[\u0000-\u001F\u007F]/g;
const PERCENT_ENCODED_SEGMENT_PATTERN = /(?:%[0-9A-Fa-f]{2})+/g;

function stripControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARS_PATTERN, "");
}

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

function basename(value: string): string {
  const normalized = normalizePathSeparators(value.trim());
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

/**
 * Decode filenames that were accidentally stored or returned as full percent-encoding.
 * Does not decode strings that already contain readable Unicode or isolated `%` tokens.
 */
export function maybeDecodePercentEncodedFilename(value: string): string {
  const trimmed = value.trim();

  if (!trimmed || /[\u0400-\u04FF]/.test(trimmed)) {
    return trimmed;
  }

  if (!/%[0-9A-Fa-f]{2}/.test(trimmed)) {
    return trimmed;
  }

  const withoutLiterals = trimmed.replace(/%%/g, "");
  const encodedSegments = withoutLiterals.match(PERCENT_ENCODED_SEGMENT_PATTERN) ?? [];
  const encodedLength = encodedSegments.join("").length;

  if (encodedLength < withoutLiterals.length * 0.5) {
    return trimmed;
  }

  try {
    const decoded = decodeURIComponent(trimmed);

    if (decoded && decoded !== trimmed && !/[\u0000-\u001F\u007F]/.test(decoded)) {
      return decoded;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function sanitizePersonalMaterialDownloadFilename(
  originalFilename: string,
  fallbackFilename: string,
): string {
  const decoded = maybeDecodePercentEncodedFilename(originalFilename);
  const baseName = basename(decoded);
  const sanitized = stripControlCharacters(baseName).trim();

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return fallbackFilename;
  }

  if (sanitized.includes("/") || sanitized.includes("\\")) {
    return fallbackFilename;
  }

  return sanitized;
}

export function buildAttachmentContentDisposition(filename: string): string {
  const sanitized = sanitizePersonalMaterialDownloadFilename(filename, "download");
  const asciiFallback = sanitized
    .replace(/[^\u0020-\u007E]+/g, "_")
    .replace(/["\\]/g, "_")
    .trim() || "download";
  const encoded = encodeURIComponent(sanitized);

  return `attachment; filename="${asciiFallback.replace(/"/g, "")}"; filename*=UTF-8''${encoded}`;
}
