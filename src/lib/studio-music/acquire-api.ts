const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StudioMusicAcquireRequestBody = {
  practiceId: string;
};

export type StudioMusicAcquireRow = {
  entitlement_id: string;
  practice_id: string;
  grant_source: string;
  order_id: string | null;
  inserted: boolean;
  granted_at: string;
};

export type StudioMusicAcquireSuccessBody = {
  entitlement: {
    id: string;
    practice_id: string;
    grant_source: string;
    order_id: null;
    inserted: boolean;
    granted_at: string;
  };
};

export type StudioMusicAcquireErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "practice_not_found"
  | "practice_not_free"
  | "internal_error";

export function parseStudioMusicAcquireRequest(
  body: Record<string, unknown>,
):
  | { ok: true; value: StudioMusicAcquireRequestBody }
  | { ok: false; error: StudioMusicAcquireErrorCode } {
  if (
    "userId" in body ||
    "user_id" in body ||
    "email" in body ||
    "amount" in body ||
    "amount_minor" in body ||
    "order_id" in body ||
    "orderId" in body
  ) {
    return { ok: false, error: "invalid_request" };
  }

  const practiceIdRaw = body.practiceId ?? body.practice_id;

  if (typeof practiceIdRaw !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  const practiceId = practiceIdRaw.trim().toLowerCase();

  if (!UUID_PATTERN.test(practiceId)) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, value: { practiceId } };
}

export function mapStudioMusicAcquireRpcError(message: string): {
  status: number;
  error: StudioMusicAcquireErrorCode;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (normalized.includes("practice_not_free")) {
    return { status: 409, error: "practice_not_free" };
  }

  if (
    normalized.includes("practice_not_found") ||
    normalized.includes("practice_not_published") ||
    normalized.includes("not_studio_music") ||
    normalized.includes("studio_reuse_not_allowed")
  ) {
    return { status: 404, error: "practice_not_found" };
  }

  if (normalized.includes("practice_id_required")) {
    return { status: 400, error: "invalid_request" };
  }

  return { status: 500, error: "internal_error" };
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

export function coerceStudioMusicAcquireRow(
  value: unknown,
): StudioMusicAcquireRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const inserted = asBoolean(row.inserted);
  const grantedAt =
    typeof row.granted_at === "string"
      ? row.granted_at
      : row.granted_at instanceof Date
        ? row.granted_at.toISOString()
        : null;

  if (
    typeof row.entitlement_id !== "string" ||
    typeof row.practice_id !== "string" ||
    typeof row.grant_source !== "string" ||
    inserted == null ||
    grantedAt == null
  ) {
    return null;
  }

  if (row.order_id != null && typeof row.order_id !== "string") {
    return null;
  }

  return {
    entitlement_id: row.entitlement_id,
    practice_id: row.practice_id,
    grant_source: row.grant_source,
    order_id: typeof row.order_id === "string" ? row.order_id : null,
    inserted,
    granted_at: grantedAt,
  };
}

export function toStudioMusicAcquireSuccessBody(
  row: StudioMusicAcquireRow,
): StudioMusicAcquireSuccessBody {
  return {
    entitlement: {
      id: row.entitlement_id,
      practice_id: row.practice_id,
      grant_source: row.grant_source,
      order_id: null,
      inserted: row.inserted,
      granted_at: row.granted_at,
    },
  };
}
