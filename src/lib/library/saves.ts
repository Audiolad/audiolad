/**
 * library_saves domain.
 *
 * Save = bookmark into Аудиотека.
 * Save is not listen entitlement and does not grant access.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const LIBRARY_SAVES_TABLE = "library_saves";
export const LIBRARY_SAVES_LOOKUP_MAX_IDS = 50;

export type LibrarySave = {
  userId: string;
  practiceId: string;
  createdAt: string;
};

export type LibrarySaveRow = {
  user_id: string;
  practice_id: string;
  created_at: string;
};

export type LibrarySaveWriteInput = {
  userId: string;
  practiceId: string;
  createdAt?: string;
};

export type LibrarySavesStore = {
  insert(save: LibrarySave): "created" | "exists";
  delete(userId: string, practiceId: string): boolean;
  has(userId: string, practiceId: string): boolean;
  get(userId: string, practiceId: string): LibrarySave | null;
  listForUser(userId: string): LibrarySave[];
};

export type LibrarySavesAsyncStore = {
  insert(save: LibrarySave): Promise<"created" | "exists">;
  delete(userId: string, practiceId: string): Promise<boolean>;
  has(userId: string, practiceId: string): Promise<boolean>;
  get(userId: string, practiceId: string): Promise<LibrarySave | null>;
  listForUser(userId: string): Promise<LibrarySave[]>;
  listSavedPracticeIds(userId: string, practiceIds: string[]): Promise<string[]>;
};

export type LibrarySavesStoreErrorCode = "invalid_request" | "internal_error";

export class LibrarySavesStoreError extends Error {
  readonly code: LibrarySavesStoreErrorCode;

  constructor(code: LibrarySavesStoreErrorCode, message?: string) {
    super(message ?? code);
    this.name = "LibrarySavesStoreError";
    this.code = code;
  }
}

function assertId(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}_required`);
  }
}

export function librarySaveKey(userId: string, practiceId: string): string {
  return `${userId}::${practiceId}`;
}

export function toLibrarySaveRow(save: LibrarySave): LibrarySaveRow {
  return {
    user_id: save.userId,
    practice_id: save.practiceId,
    created_at: save.createdAt,
  };
}

export function fromLibrarySaveRow(row: LibrarySaveRow): LibrarySave {
  return {
    userId: row.user_id,
    practiceId: row.practice_id,
    createdAt: row.created_at,
  };
}

export function createMemoryLibrarySavesStore(
  initial: LibrarySave[] = [],
): LibrarySavesStore {
  const rows = new Map<string, LibrarySave>();

  for (const save of initial) {
    rows.set(librarySaveKey(save.userId, save.practiceId), save);
  }

  return {
    insert(save) {
      const key = librarySaveKey(save.userId, save.practiceId);
      if (rows.has(key)) {
        return "exists";
      }

      rows.set(key, save);
      return "created";
    },
    delete(userId, practiceId) {
      return rows.delete(librarySaveKey(userId, practiceId));
    },
    has(userId, practiceId) {
      return rows.has(librarySaveKey(userId, practiceId));
    },
    get(userId, practiceId) {
      return rows.get(librarySaveKey(userId, practiceId)) ?? null;
    },
    listForUser(userId) {
      return [...rows.values()].filter((save) => save.userId === userId);
    },
  };
}

export function createLibrarySave(
  store: LibrarySavesStore,
  input: LibrarySaveWriteInput,
): { created: boolean; save: LibrarySave } {
  assertId(input.userId, "user_id");
  assertId(input.practiceId, "practice_id");

  const existing = store.get(input.userId, input.practiceId);

  if (existing) {
    return { created: false, save: existing };
  }

  const save: LibrarySave = {
    userId: input.userId,
    practiceId: input.practiceId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  const result = store.insert(save);

  if (result === "exists") {
    return {
      created: false,
      save: store.get(input.userId, input.practiceId) ?? save,
    };
  }

  return { created: true, save };
}

export function deleteLibrarySave(
  store: LibrarySavesStore,
  input: { userId: string; practiceId: string },
): { deleted: boolean } {
  assertId(input.userId, "user_id");
  assertId(input.practiceId, "practice_id");

  return { deleted: store.delete(input.userId, input.practiceId) };
}

export function hasLibrarySave(
  store: LibrarySavesStore,
  input: { userId: string; practiceId: string },
): boolean {
  assertId(input.userId, "user_id");
  assertId(input.practiceId, "practice_id");

  return store.has(input.userId, input.practiceId);
}

export function asAsyncLibrarySavesStore(
  store: LibrarySavesStore,
): LibrarySavesAsyncStore {
  return {
    insert: async (save) => store.insert(save),
    delete: async (userId, practiceId) => store.delete(userId, practiceId),
    has: async (userId, practiceId) => store.has(userId, practiceId),
    get: async (userId, practiceId) => store.get(userId, practiceId),
    listForUser: async (userId) => store.listForUser(userId),
    async listSavedPracticeIds(userId, practiceIds) {
      if (practiceIds.length === 0) {
        return [];
      }

      const wanted = new Set(practiceIds);
      return store
        .listForUser(userId)
        .filter((save) => wanted.has(save.practiceId))
        .map((save) => save.practiceId);
    },
  };
}

export async function createLibrarySaveAsync(
  store: LibrarySavesAsyncStore,
  input: LibrarySaveWriteInput,
): Promise<{ created: boolean; save: LibrarySave }> {
  assertId(input.userId, "user_id");
  assertId(input.practiceId, "practice_id");

  const existing = await store.get(input.userId, input.practiceId);

  if (existing) {
    return { created: false, save: existing };
  }

  const save: LibrarySave = {
    userId: input.userId,
    practiceId: input.practiceId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  const result = await store.insert(save);

  if (result === "exists") {
    return {
      created: false,
      save: (await store.get(input.userId, input.practiceId)) ?? save,
    };
  }

  return { created: true, save };
}

export async function deleteLibrarySaveAsync(
  store: LibrarySavesAsyncStore,
  input: { userId: string; practiceId: string },
): Promise<{ deleted: boolean }> {
  assertId(input.userId, "user_id");
  assertId(input.practiceId, "practice_id");

  return { deleted: await store.delete(input.userId, input.practiceId) };
}

export async function hasLibrarySaveAsync(
  store: LibrarySavesAsyncStore,
  input: { userId: string; practiceId: string },
): Promise<boolean> {
  assertId(input.userId, "user_id");
  assertId(input.practiceId, "practice_id");

  return store.has(input.userId, input.practiceId);
}

export async function listSavedPracticeIds(
  store: LibrarySavesAsyncStore,
  input: { userId: string; practiceIds: string[] },
): Promise<string[]> {
  assertId(input.userId, "user_id");

  if (input.practiceIds.length === 0) {
    return [];
  }

  return store.listSavedPracticeIds(input.userId, input.practiceIds);
}

type LibrarySavesQueryError = { code?: string; message?: string } | null;

function isUniqueViolation(error: LibrarySavesQueryError): boolean {
  return error?.code === "23505";
}

function isForeignKeyViolation(error: LibrarySavesQueryError): boolean {
  return error?.code === "23503";
}

function throwStoreError(error: LibrarySavesQueryError): never {
  if (isForeignKeyViolation(error)) {
    throw new LibrarySavesStoreError("invalid_request", error?.message);
  }

  throw new LibrarySavesStoreError("internal_error", error?.message);
}

function isLibrarySaveRow(value: unknown): value is LibrarySaveRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as LibrarySaveRow;

  return (
    typeof row.user_id === "string" &&
    typeof row.practice_id === "string" &&
    typeof row.created_at === "string"
  );
}

export function createSupabaseLibrarySavesStore(
  supabase: SupabaseClient,
): LibrarySavesAsyncStore {
  const table = () => supabase.from(LIBRARY_SAVES_TABLE);

  return {
    async insert(save) {
      const { error } = await table()
        .insert(toLibrarySaveRow(save))
        .select("user_id, practice_id, created_at")
        .maybeSingle();

      if (isUniqueViolation(error)) {
        return "exists";
      }

      if (error) {
        throwStoreError(error);
      }

      return "created";
    },
    async delete(userId, practiceId) {
      const { data, error } = await table()
        .delete()
        .eq("user_id", userId)
        .eq("practice_id", practiceId)
        .select("practice_id");

      if (error) {
        throwStoreError(error);
      }

      return Array.isArray(data) && data.length > 0;
    },
    async has(userId, practiceId) {
      return (await this.get(userId, practiceId)) !== null;
    },
    async get(userId, practiceId) {
      const { data, error } = await table()
        .select("user_id, practice_id, created_at")
        .eq("user_id", userId)
        .eq("practice_id", practiceId)
        .maybeSingle();

      if (error) {
        throwStoreError(error);
      }

      return isLibrarySaveRow(data) ? fromLibrarySaveRow(data) : null;
    },
    async listForUser(userId) {
      const { data, error } = await table()
        .select("user_id, practice_id, created_at")
        .eq("user_id", userId);

      if (error) {
        throwStoreError(error);
      }

      return (data ?? []).filter(isLibrarySaveRow).map(fromLibrarySaveRow);
    },
    async listSavedPracticeIds(userId, practiceIds) {
      if (practiceIds.length === 0) {
        return [];
      }

      const { data, error } = await table()
        .select("practice_id")
        .eq("user_id", userId)
        .in("practice_id", practiceIds);

      if (error) {
        throwStoreError(error);
      }

      return (data ?? [])
        .map((row) =>
          typeof row?.practice_id === "string" ? row.practice_id : null,
        )
        .filter((id): id is string => id !== null);
    },
  };
}
