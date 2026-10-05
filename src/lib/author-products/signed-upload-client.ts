/**
 * Supabase storage-js 2.110.1 serializes Blob/File uploads as multipart and
 * uses the Blob/File type for the part MIME. The contentType option alone is
 * not enough when the browser reports an empty or application/octet-stream
 * type, so wrap the bytes in a File with the canonical MIME before upload.
 */
export function fileForSignedAuthorAudioUpload(
  file: Blob,
  filename: string,
  mime: string,
): File {
  const base =
    filename
      .split(/[/\\]/)
      .pop()
      ?.replace(/[\u0000-\u001f]/g, "")
      .trim() || "audio";

  return new File([file], base.slice(0, 180), { type: mime });
}

export const AUTHOR_SIGNED_UPLOAD_ERROR_CODES = [
  "invalid_mime_type",
  "upload_network",
  "object_missing",
  "upload_rejected",
  "upload_token_expired",
] as const;

export type AuthorSignedUploadErrorCode =
  (typeof AUTHOR_SIGNED_UPLOAD_ERROR_CODES)[number];

export type AuthorSignedUploadErrorReport = {
  code: AuthorSignedUploadErrorCode;
  status: number | null;
  statusCode: string | null;
  message: string | null;
};

const AUTHOR_SIGNED_UPLOAD_ERROR_CODE_SET = new Set<string>(
  AUTHOR_SIGNED_UPLOAD_ERROR_CODES,
);

/**
 * Sanitize browser→Storage failures for abandon diagnostics (PR #718 pattern).
 * Never include signed URLs, tokens, or raw JWT fragments.
 */
export function classifyAuthorSignedUploadError(
  error: unknown,
): AuthorSignedUploadErrorReport {
  const fields = readErrorFields(error);
  return {
    code: classifyCode(error, fields),
    status: fields.status,
    statusCode: fields.statusCode,
    message: fields.message,
  };
}

export function readAuthorSignedUploadClientReport(
  value: unknown,
): AuthorSignedUploadErrorReport | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawCode = typeof record.code === "string" ? record.code : "";
  if (!AUTHOR_SIGNED_UPLOAD_ERROR_CODE_SET.has(rawCode)) return null;
  return {
    code: rawCode as AuthorSignedUploadErrorCode,
    status: readStatus(record.status),
    statusCode: readStatusCode(record.statusCode),
    message: sanitizeStorageMessage(
      typeof record.message === "string" ? record.message : null,
    ),
  };
}

function classifyCode(
  error: unknown,
  fields: {
    status: number | null;
    statusCode: string | null;
    message: string | null;
    errorName: string | null;
  },
): AuthorSignedUploadErrorCode {
  const haystack = [fields.statusCode, fields.message, fields.errorName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLowerCase();
  if (
    haystack.includes("invalidjwt")
    || haystack.includes('"exp" claim')
    || haystack.includes("exp claim")
    || haystack.includes("token is expired")
    || haystack.includes("jwt expired")
  ) {
    return "upload_token_expired";
  }
  if (
    fields.status === 415
    || fields.statusCode === "415"
    || haystack.includes("invalid_mime_type")
    || haystack.includes("invalidmimetype")
    || /mime type .+ is not supported/.test(haystack)
  ) {
    return "invalid_mime_type";
  }
  if (
    fields.status === 404
    || fields.statusCode === "404"
    || haystack.includes("object not found")
    || haystack.includes("nosuchkey")
  ) {
    return "object_missing";
  }
  if (isNetworkFailure(error, fields.status, haystack)) return "upload_network";
  return "upload_rejected";
}

function isNetworkFailure(
  error: unknown,
  status: number | null,
  haystack: string,
): boolean {
  if (status !== null && status !== 0) return false;
  if (error instanceof TypeError) return true;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return true;
  }
  if (/failed to fetch|networkerror|network request failed|load failed/.test(haystack)) {
    return true;
  }
  if (!error || typeof error !== "object") return status === 0;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  return name === "StorageUnknownError" || name === "NetworkError" || name === "TypeError";
}

function readErrorFields(error: unknown): {
  status: number | null;
  statusCode: string | null;
  message: string | null;
  errorName: string | null;
} {
  if (!error || typeof error !== "object") {
    return {
      status: null,
      statusCode: null,
      message: sanitizeStorageMessage(typeof error === "string" ? error : null),
      errorName: null,
    };
  }
  const record = error as Record<string, unknown>;
  const errorField = record.error;
  return {
    status: readStatus(record.status),
    statusCode: readStatusCode(record.statusCode ?? record.code),
    message: sanitizeStorageMessage(
      typeof record.message === "string" ? record.message : null,
    ),
    errorName: typeof errorField === "string" ? errorField.slice(0, 80) : null,
  };
}

function readStatus(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 599) return null;
  return value;
}

function readStatusCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\r\n]/g, " ").trim().slice(0, 64);
  return cleaned || null;
}

function sanitizeStorageMessage(message: string | null): string | null {
  if (!message) return null;
  const cleaned = message
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/token=[^&\s]+/gi, "token=[redacted]")
    .replace(/[\r\n]/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || null;
}
