/**
 * playlist_saves domain.
 *
 * Save = bookmark of a playlist. Separate from library_saves (product / Аудиотека).
 * Save is not listen entitlement and does not grant access to playlist items.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const PLAYLIST_SAVES_TABLE = "playlist_saves";
export const PLAYLIST_SAVES_LOOKUP_MAX_IDS = 50;

export type PlaylistSave = {
  userId: string;
  playlistId: string;
  createdAt: string;
};

export type PlaylistSaveRow = {
  user_id: string;
  playlist_id: string;
  created_at: string;
};

export type PlaylistSaveWriteInput = {
  userId: string;
  playlistId: string;
  createdAt?: string;
};

export type PlaylistSavesStore = {
  insert(save: PlaylistSave): "created" | "exists";
  delete(userId: string, playlistId: string): boolean;
  has(userId: string, playlistId: string): boolean;
  get(userId: string, playlistId: string): PlaylistSave | null;
  listForUser(userId: string): PlaylistSave[];
};

export type PlaylistSavesAsyncStore = {
  insert(save: PlaylistSave): Promise<"created" | "exists">;
  delete(userId: string, playlistId: string): Promise<boolean>;
  has(userId: string, playlistId: string): Promise<boolean>;
  get(userId: string, playlistId: string): Promise<PlaylistSave | null>;
  listForUser(userId: string): Promise<PlaylistSave[]>;
  listSavedPlaylistIds(userId: string, playlistIds: string[]): Promise<string[]>;
};

export type PlaylistSavesStoreErrorCode = "invalid_request" | "internal_error";

export class PlaylistSavesStoreError extends Error {
  readonly code: PlaylistSavesStoreErrorCode;

  constructor(code: PlaylistSavesStoreErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PlaylistSavesStoreError";
    this.code = code;
  }
}

function assertId(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}_required`);
  }
}

export function playlistSaveKey(userId: string, playlistId: string): string {
  return `${userId}::${playlistId}`;
}

export function toPlaylistSaveRow(save: PlaylistSave): PlaylistSaveRow {
  return {
    user_id: save.userId,
    playlist_id: save.playlistId,
    created_at: save.createdAt,
  };
}

export function fromPlaylistSaveRow(row: PlaylistSaveRow): PlaylistSave {
  return {
    userId: row.user_id,
    playlistId: row.playlist_id,
    createdAt: row.created_at,
  };
}

export function createMemoryPlaylistSavesStore(
  initial: PlaylistSave[] = [],
): PlaylistSavesStore {
  const rows = new Map<string, PlaylistSave>();

  for (const save of initial) {
    rows.set(playlistSaveKey(save.userId, save.playlistId), save);
  }

  return {
    insert(save) {
      const key = playlistSaveKey(save.userId, save.playlistId);
      if (rows.has(key)) {
        return "exists";
      }

      rows.set(key, save);
      return "created";
    },
    delete(userId, playlistId) {
      return rows.delete(playlistSaveKey(userId, playlistId));
    },
    has(userId, playlistId) {
      return rows.has(playlistSaveKey(userId, playlistId));
    },
    get(userId, playlistId) {
      return rows.get(playlistSaveKey(userId, playlistId)) ?? null;
    },
    listForUser(userId) {
      return [...rows.values()].filter((save) => save.userId === userId);
    },
  };
}

export function createPlaylistSave(
  store: PlaylistSavesStore,
  input: PlaylistSaveWriteInput,
): { created: boolean; save: PlaylistSave } {
  assertId(input.userId, "user_id");
  assertId(input.playlistId, "playlist_id");

  const existing = store.get(input.userId, input.playlistId);

  if (existing) {
    return { created: false, save: existing };
  }

  const save: PlaylistSave = {
    userId: input.userId,
    playlistId: input.playlistId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  const result = store.insert(save);

  if (result === "exists") {
    return {
      created: false,
      save: store.get(input.userId, input.playlistId) ?? save,
    };
  }

  return { created: true, save };
}

export function deletePlaylistSave(
  store: PlaylistSavesStore,
  input: { userId: string; playlistId: string },
): { deleted: boolean } {
  assertId(input.userId, "user_id");
  assertId(input.playlistId, "playlist_id");

  return { deleted: store.delete(input.userId, input.playlistId) };
}

export function hasPlaylistSave(
  store: PlaylistSavesStore,
  input: { userId: string; playlistId: string },
): boolean {
  assertId(input.userId, "user_id");
  assertId(input.playlistId, "playlist_id");

  return store.has(input.userId, input.playlistId);
}

export function asAsyncPlaylistSavesStore(
  store: PlaylistSavesStore,
): PlaylistSavesAsyncStore {
  return {
    insert: async (save) => store.insert(save),
    delete: async (userId, playlistId) => store.delete(userId, playlistId),
    has: async (userId, playlistId) => store.has(userId, playlistId),
    get: async (userId, playlistId) => store.get(userId, playlistId),
    listForUser: async (userId) => store.listForUser(userId),
    async listSavedPlaylistIds(userId, playlistIds) {
      if (playlistIds.length === 0) {
        return [];
      }

      const wanted = new Set(playlistIds);
      return store
        .listForUser(userId)
        .filter((save) => wanted.has(save.playlistId))
        .map((save) => save.playlistId);
    },
  };
}

export async function createPlaylistSaveAsync(
  store: PlaylistSavesAsyncStore,
  input: PlaylistSaveWriteInput,
): Promise<{ created: boolean; save: PlaylistSave }> {
  assertId(input.userId, "user_id");
  assertId(input.playlistId, "playlist_id");

  const existing = await store.get(input.userId, input.playlistId);

  if (existing) {
    return { created: false, save: existing };
  }

  const save: PlaylistSave = {
    userId: input.userId,
    playlistId: input.playlistId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  const result = await store.insert(save);

  if (result === "exists") {
    return {
      created: false,
      save: (await store.get(input.userId, input.playlistId)) ?? save,
    };
  }

  return { created: true, save };
}

export async function deletePlaylistSaveAsync(
  store: PlaylistSavesAsyncStore,
  input: { userId: string; playlistId: string },
): Promise<{ deleted: boolean }> {
  assertId(input.userId, "user_id");
  assertId(input.playlistId, "playlist_id");

  return { deleted: await store.delete(input.userId, input.playlistId) };
}

export async function hasPlaylistSaveAsync(
  store: PlaylistSavesAsyncStore,
  input: { userId: string; playlistId: string },
): Promise<boolean> {
  assertId(input.userId, "user_id");
  assertId(input.playlistId, "playlist_id");

  return store.has(input.userId, input.playlistId);
}

export async function listSavedPlaylistIds(
  store: PlaylistSavesAsyncStore,
  input: { userId: string; playlistIds: string[] },
): Promise<string[]> {
  assertId(input.userId, "user_id");

  if (input.playlistIds.length === 0) {
    return [];
  }

  return store.listSavedPlaylistIds(input.userId, input.playlistIds);
}

type PlaylistSavesQueryError = { code?: string; message?: string } | null;

function isUniqueViolation(error: PlaylistSavesQueryError): boolean {
  return error?.code === "23505";
}

function isForeignKeyViolation(error: PlaylistSavesQueryError): boolean {
  return error?.code === "23503";
}

function throwStoreError(error: PlaylistSavesQueryError): never {
  if (isForeignKeyViolation(error)) {
    throw new PlaylistSavesStoreError("invalid_request", error?.message);
  }

  throw new PlaylistSavesStoreError("internal_error", error?.message);
}

function isPlaylistSaveRow(value: unknown): value is PlaylistSaveRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as PlaylistSaveRow;

  return (
    typeof row.user_id === "string" &&
    typeof row.playlist_id === "string" &&
    typeof row.created_at === "string"
  );
}

export function createSupabasePlaylistSavesStore(
  supabase: SupabaseClient,
): PlaylistSavesAsyncStore {
  const table = () => supabase.from(PLAYLIST_SAVES_TABLE);

  return {
    async insert(save) {
      const { error } = await table()
        .insert(toPlaylistSaveRow(save))
        .select("user_id, playlist_id, created_at")
        .maybeSingle();

      if (isUniqueViolation(error)) {
        return "exists";
      }

      if (error) {
        throwStoreError(error);
      }

      return "created";
    },
    async delete(userId, playlistId) {
      const { data, error } = await table()
        .delete()
        .eq("user_id", userId)
        .eq("playlist_id", playlistId)
        .select("playlist_id");

      if (error) {
        throwStoreError(error);
      }

      return Array.isArray(data) && data.length > 0;
    },
    async has(userId, playlistId) {
      return (await this.get(userId, playlistId)) !== null;
    },
    async get(userId, playlistId) {
      const { data, error } = await table()
        .select("user_id, playlist_id, created_at")
        .eq("user_id", userId)
        .eq("playlist_id", playlistId)
        .maybeSingle();

      if (error) {
        throwStoreError(error);
      }

      return isPlaylistSaveRow(data) ? fromPlaylistSaveRow(data) : null;
    },
    async listForUser(userId) {
      const { data, error } = await table()
        .select("user_id, playlist_id, created_at")
        .eq("user_id", userId);

      if (error) {
        throwStoreError(error);
      }

      return (data ?? []).filter(isPlaylistSaveRow).map(fromPlaylistSaveRow);
    },
    async listSavedPlaylistIds(userId, playlistIds) {
      if (playlistIds.length === 0) {
        return [];
      }

      const { data, error } = await table()
        .select("playlist_id")
        .eq("user_id", userId)
        .in("playlist_id", playlistIds);

      if (error) {
        throwStoreError(error);
      }

      return (data ?? [])
        .map((row) =>
          typeof row?.playlist_id === "string" ? row.playlist_id : null,
        )
        .filter((id): id is string => id !== null);
    },
  };
}
