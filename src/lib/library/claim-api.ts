import {
  extractPracticeSlug,
  parseJsonObject,
} from "@/lib/orders/create-order-api";

export type ClaimFreePracticeRpcResult = {
  practice_id: string;
  practice_slug: string;
  inserted: boolean;
  access_source: string;
  in_library: boolean;
  show_first_save_prompt: boolean;
};

export type ClaimLibrarySuccessBody = {
  library: {
    practice_id: string;
    practice_slug: string;
    access_source: string;
    inserted: boolean;
    in_library: true;
  };
  retention: {
    show_first_save_prompt: boolean;
  };
};

export type ClaimLibraryApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "practice_not_found"
  | "practice_not_free"
  | "internal_error";

export function extractClaimPracticeSlug(
  body: Record<string, unknown>,
): string | null {
  return extractPracticeSlug(body);
}

export { parseJsonObject };

export function mapClaimRpcErrorMessage(message: string): {
  status: number;
  error: ClaimLibraryApiErrorCode;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (
    normalized.includes("practice_slug_required") ||
    normalized.includes("invalid input")
  ) {
    return { status: 400, error: "invalid_request" };
  }

  if (
    normalized.includes("practice_not_found") ||
    normalized.includes("practice_not_published") ||
    normalized.includes("practice_not_listed")
  ) {
    return { status: 404, error: "practice_not_found" };
  }

  if (normalized.includes("practice_not_free")) {
    return { status: 409, error: "practice_not_free" };
  }

  return { status: 500, error: "internal_error" };
}

export function isClaimFreePracticeRpcResult(
  value: unknown,
): value is ClaimFreePracticeRpcResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as ClaimFreePracticeRpcResult;

  return (
    typeof row.practice_id === "string" &&
    typeof row.practice_slug === "string" &&
    typeof row.inserted === "boolean" &&
    typeof row.access_source === "string" &&
    typeof row.show_first_save_prompt === "boolean" &&
    row.in_library === true
  );
}

export function toClaimLibrarySuccessBody(
  row: ClaimFreePracticeRpcResult,
): ClaimLibrarySuccessBody {
  return {
    library: {
      practice_id: row.practice_id,
      practice_slug: row.practice_slug,
      access_source: row.access_source,
      inserted: row.inserted,
      in_library: true,
    },
    retention: {
      show_first_save_prompt: row.inserted && row.show_first_save_prompt,
    },
  };
}

export function isClaimLibrarySuccessBody(
  body: unknown,
): body is ClaimLibrarySuccessBody {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const record = body as ClaimLibrarySuccessBody;

  return (
    typeof record.library?.in_library === "boolean" &&
    record.library.in_library === true &&
    typeof record.retention?.show_first_save_prompt === "boolean"
  );
}
