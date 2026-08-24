/**
 * HTTP contract for /api/library/saves.
 *
 * Heart save ≠ claim, entitlement, or purchase.
 */

import { parseJsonObject } from "@/lib/library/claim-api";
import {
  LIBRARY_SAVES_LOOKUP_MAX_IDS,
  LibrarySavesStoreError,
  createLibrarySaveAsync,
  deleteLibrarySaveAsync,
  listSavedPracticeIds,
  type LibrarySavesAsyncStore,
} from "@/lib/library/saves";

const PRACTICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LibrarySavesApiErrorCode = "unauthorized" | "invalid_request" | "internal_error";

export type LibrarySavesApiResult = {
  status: number;
  body: Record<string, unknown>;
};

export function parseLibrarySavePracticeId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!PRACTICE_ID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

export function parseLibrarySaveRequestBody(
  body: unknown,
): { ok: true; practiceId: string } | { ok: false } {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false };
  }

  const practiceId = parseLibrarySavePracticeId(parsed.practiceId);

  if (!practiceId) {
    return { ok: false };
  }

  return { ok: true, practiceId };
}

export function parseLibrarySavePracticeIdsQuery(
  value: string | null | undefined,
): { ok: true; practiceIds: string[] } | { ok: false } {
  if (value == null || value.trim() === "") {
    return { ok: true, practiceIds: [] };
  }

  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length > LIBRARY_SAVES_LOOKUP_MAX_IDS) {
    return { ok: false };
  }

  const practiceIds: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const practiceId = parseLibrarySavePracticeId(token);

    if (!practiceId) {
      return { ok: false };
    }

    if (seen.has(practiceId)) {
      continue;
    }

    seen.add(practiceId);
    practiceIds.push(practiceId);
  }

  return { ok: true, practiceIds };
}

function unauthorizedResult(): LibrarySavesApiResult {
  return { status: 401, body: { error: "unauthorized" } };
}

function invalidRequestResult(): LibrarySavesApiResult {
  return { status: 400, body: { error: "invalid_request" } };
}

function internalErrorResult(): LibrarySavesApiResult {
  return { status: 500, body: { error: "internal_error" } };
}

function mapStoreError(error: unknown): LibrarySavesApiResult {
  if (error instanceof LibrarySavesStoreError && error.code === "invalid_request") {
    return invalidRequestResult();
  }

  console.error(
    "library_saves_store_error",
    error instanceof Error ? error.message : error,
  );

  return internalErrorResult();
}

export async function handleCreateLibrarySave(input: {
  userId: string | null;
  body: unknown;
  store: LibrarySavesAsyncStore;
}): Promise<LibrarySavesApiResult> {
  if (!input.userId) {
    return unauthorizedResult();
  }

  const parsed = parseLibrarySaveRequestBody(input.body);

  if (!parsed.ok) {
    return invalidRequestResult();
  }

  try {
    const result = await createLibrarySaveAsync(input.store, {
      userId: input.userId,
      practiceId: parsed.practiceId,
    });

    return {
      status: result.created ? 201 : 200,
      body: {
        saved: true,
        created: result.created,
        practiceId: parsed.practiceId,
      },
    };
  } catch (error) {
    return mapStoreError(error);
  }
}

export async function handleDeleteLibrarySave(input: {
  userId: string | null;
  body: unknown;
  store: LibrarySavesAsyncStore;
}): Promise<LibrarySavesApiResult> {
  if (!input.userId) {
    return unauthorizedResult();
  }

  const parsed = parseLibrarySaveRequestBody(input.body);

  if (!parsed.ok) {
    return invalidRequestResult();
  }

  try {
    const result = await deleteLibrarySaveAsync(input.store, {
      userId: input.userId,
      practiceId: parsed.practiceId,
    });

    return {
      status: 200,
      body: {
        saved: false,
        deleted: result.deleted,
        practiceId: parsed.practiceId,
      },
    };
  } catch (error) {
    return mapStoreError(error);
  }
}

export async function handleListLibrarySaves(input: {
  userId: string | null;
  practiceIdsQuery: string | null;
  store: LibrarySavesAsyncStore;
}): Promise<LibrarySavesApiResult> {
  if (!input.userId) {
    return unauthorizedResult();
  }

  const parsed = parseLibrarySavePracticeIdsQuery(input.practiceIdsQuery);

  if (!parsed.ok) {
    return invalidRequestResult();
  }

  try {
    const savedIds = await listSavedPracticeIds(input.store, {
      userId: input.userId,
      practiceIds: parsed.practiceIds,
    });

    return {
      status: 200,
      body: { savedIds },
    };
  } catch (error) {
    return mapStoreError(error);
  }
}
