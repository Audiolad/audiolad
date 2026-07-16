const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRACTICE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PromoCompleteSignupBody = {
  practice_id?: string;
  practice_slug: string;
  progress?: {
    audio_item_id: string;
    position_seconds: number;
    completed: boolean;
  } | null;
};

export type PromoCompleteSignupResponse = {
  ok: true;
  practiceSaved: boolean;
  alreadySaved: boolean;
  progressTransferred: boolean;
  library: {
    practice_id: string;
    practice_slug: string;
    access_source: string;
    inserted: boolean;
    in_library: boolean;
  };
};

export type PromoClaimRpcResult = {
  practice_id: string;
  practice_slug: string;
  inserted: boolean;
  access_source: string;
  in_library: boolean;
};

export function parsePromoCompleteSignupBody(
  body: unknown,
): PromoCompleteSignupBody | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const practiceSlug = record.practice_slug;
  const practiceIdRaw = record.practice_id;

  if (typeof practiceSlug !== "string") {
    return null;
  }

  const trimmedSlug = practiceSlug.trim();

  if (
    !trimmedSlug ||
    trimmedSlug.length > 128 ||
    !PRACTICE_SLUG_PATTERN.test(trimmedSlug)
  ) {
    return null;
  }

  let practiceId: string | undefined;

  if (practiceIdRaw !== undefined && practiceIdRaw !== null) {
    if (typeof practiceIdRaw !== "string" || !UUID_PATTERN.test(practiceIdRaw.trim())) {
      return null;
    }

    practiceId = practiceIdRaw.trim();
  }

  let progress: PromoCompleteSignupBody["progress"] = null;

  if (record.progress !== undefined && record.progress !== null) {
    if (typeof record.progress !== "object") {
      return null;
    }

    const progressRecord = record.progress as Record<string, unknown>;
    const audioItemId = progressRecord.audio_item_id;
    const positionSeconds = progressRecord.position_seconds;
    const completed = progressRecord.completed;

    if (
      typeof audioItemId !== "string" ||
      !UUID_PATTERN.test(audioItemId.trim()) ||
      typeof positionSeconds !== "number" ||
      !Number.isFinite(positionSeconds) ||
      positionSeconds < 0 ||
      positionSeconds > 86400 ||
      typeof completed !== "boolean"
    ) {
      return null;
    }

    progress = {
      audio_item_id: audioItemId.trim(),
      position_seconds: Math.floor(positionSeconds),
      completed,
    };
  }

  return {
    practice_id: practiceId,
    practice_slug: trimmedSlug,
    progress,
  };
}

export function isPromoClaimRpcResult(value: unknown): value is PromoClaimRpcResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.practice_id === "string" &&
    typeof record.practice_slug === "string" &&
    typeof record.inserted === "boolean" &&
    typeof record.access_source === "string" &&
    record.in_library === true
  );
}

export function mapPromoClaimRpcErrorMessage(message: string): {
  status: number;
  error: string;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (normalized.includes("practice_slug_required")) {
    return { status: 400, error: "invalid_request" };
  }

  if (
    normalized.includes("practice_not_found") ||
    normalized.includes("practice_not_published") ||
    normalized.includes("practice_not_promo_eligible") ||
    normalized.includes("practice_identifier_required")
  ) {
    return { status: 404, error: "practice_not_found" };
  }

  return { status: 500, error: "internal_error" };
}
