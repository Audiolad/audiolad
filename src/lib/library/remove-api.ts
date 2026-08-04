import { parseJsonObject } from "@/lib/library/claim-api";

const PRACTICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RemoveLibraryRpcResult = {
  practice_id: string;
  practice_slug: string;
  removed: boolean;
  in_library: false;
};

export type RemoveLibrarySuccessBody = {
  library: {
    practice_id: string;
    practice_slug: string;
    removed: true;
    in_library: false;
  };
};

export type RemoveLibraryApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_in_library"
  | "not_removable"
  | "internal_error";

export function extractRemovePracticeId(
  body: Record<string, unknown>,
): string | null {
  const value = body.practice_id;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!PRACTICE_ID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

export { parseJsonObject };

export function mapRemoveRpcErrorMessage(message: string): {
  status: number;
  error: RemoveLibraryApiErrorCode;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (
    normalized.includes("practice_id_required") ||
    normalized.includes("invalid input")
  ) {
    return { status: 400, error: "invalid_request" };
  }

  if (normalized.includes("not_in_library")) {
    return { status: 404, error: "not_in_library" };
  }

  if (normalized.includes("not_removable")) {
    return { status: 409, error: "not_removable" };
  }

  return { status: 500, error: "internal_error" };
}

export function isRemoveLibraryRpcResult(
  value: unknown,
): value is RemoveLibraryRpcResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as RemoveLibraryRpcResult;

  return (
    typeof row.practice_id === "string" &&
    typeof row.practice_slug === "string" &&
    row.removed === true &&
    row.in_library === false
  );
}

export function toRemoveLibrarySuccessBody(
  row: RemoveLibraryRpcResult,
): RemoveLibrarySuccessBody {
  return {
    library: {
      practice_id: row.practice_id,
      practice_slug: row.practice_slug,
      removed: true,
      in_library: false,
    },
  };
}

export function isRemoveLibrarySuccessBody(
  body: unknown,
): body is RemoveLibrarySuccessBody {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const record = body as RemoveLibrarySuccessBody;

  return (
    typeof record.library?.practice_id === "string" &&
    record.library.removed === true &&
    record.library.in_library === false
  );
}

export function mapLibraryRemoveButtonError(
  status: number,
  errorCode: string | undefined,
): string {
  if (status === 409 || errorCode === "not_removable") {
    return "Этот материал нельзя удалить из Аудиотеки";
  }

  if (status === 404 || errorCode === "not_in_library") {
    return "Материал уже отсутствует в Аудиотеке";
  }

  if (status === 400 || errorCode === "invalid_request") {
    return "Не удалось удалить. Проверьте данные и попробуйте ещё раз.";
  }

  return "Не удалось удалить. Попробуйте ещё раз.";
}
