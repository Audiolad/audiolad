const SAFE_TOCHKA_CODE = /^[A-Za-z0-9_.-]{1,80}$/;

/**
 * Extract a provider error code that is safe to log.
 * Never returns tokens, JWTs, payment URLs, or raw message text.
 */
export function extractSafeTochkaErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    record.code,
    record.errorCode,
    record.error_code,
  ];

  const errors = record.Errors ?? record.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        candidates.push(row.code, row.errorCode, row.error_code);
      }
    }
  }

  const data = record.Data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const row = data as Record<string, unknown>;
    candidates.push(row.code, row.errorCode, row.error_code);
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && SAFE_TOCHKA_CODE.test(candidate.trim())) {
      return candidate.trim();
    }
  }

  return null;
}

export function extractSafeTochkaHttpStatus(status: number): number | null {
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}
