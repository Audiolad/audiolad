/**
 * library_saves domain.
 *
 * Save = bookmark into Аудиотека.
 * Save is not listen entitlement and does not grant access.
 */

export const LIBRARY_SAVES_TABLE = "library_saves";

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
