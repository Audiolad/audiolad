/**
 * HTTP contract for POST/DELETE /api/playlists/saves.
 *
 * Uses playlist_saves domain. Separate from /api/library/saves.
 */

import {
  PlaylistSavesStoreError,
  createPlaylistSaveAsync,
  deletePlaylistSaveAsync,
  type PlaylistSavesAsyncStore,
} from "@/lib/playlists/playlist-saves";
import { isUuid } from "@/lib/playlists/validation";

export type PlaylistSavesApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "internal_error";

export type PlaylistSavesApiResult = {
  status: number;
  body: Record<string, unknown>;
};

function parseJsonObject(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  return body as Record<string, unknown>;
}

export function parsePlaylistSavePlaylistId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!isUuid(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

export function parsePlaylistSaveRequestBody(
  body: unknown,
): { ok: true; playlistId: string } | { ok: false } {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false };
  }

  const playlistId = parsePlaylistSavePlaylistId(parsed.playlistId);

  if (!playlistId) {
    return { ok: false };
  }

  return { ok: true, playlistId };
}

function unauthorizedResult(): PlaylistSavesApiResult {
  return { status: 401, body: { error: "unauthorized" } };
}

function invalidRequestResult(): PlaylistSavesApiResult {
  return { status: 400, body: { error: "invalid_request" } };
}

function internalErrorResult(): PlaylistSavesApiResult {
  return { status: 500, body: { error: "internal_error" } };
}

function mapStoreError(error: unknown): PlaylistSavesApiResult {
  if (error instanceof PlaylistSavesStoreError && error.code === "invalid_request") {
    return invalidRequestResult();
  }

  console.error(
    "playlist_saves_store_error",
    error instanceof Error ? error.message : error,
  );

  return internalErrorResult();
}

export async function handleCreatePlaylistSave(input: {
  userId: string | null;
  body: unknown;
  store: PlaylistSavesAsyncStore;
}): Promise<PlaylistSavesApiResult> {
  if (!input.userId) {
    return unauthorizedResult();
  }

  const parsed = parsePlaylistSaveRequestBody(input.body);

  if (!parsed.ok) {
    return invalidRequestResult();
  }

  try {
    await createPlaylistSaveAsync(input.store, {
      userId: input.userId,
      playlistId: parsed.playlistId,
    });

    return {
      status: 200,
      body: {
        saved: true,
        playlistId: parsed.playlistId,
      },
    };
  } catch (error) {
    return mapStoreError(error);
  }
}

export async function handleDeletePlaylistSave(input: {
  userId: string | null;
  body: unknown;
  store: PlaylistSavesAsyncStore;
}): Promise<PlaylistSavesApiResult> {
  if (!input.userId) {
    return unauthorizedResult();
  }

  const parsed = parsePlaylistSaveRequestBody(input.body);

  if (!parsed.ok) {
    return invalidRequestResult();
  }

  try {
    await deletePlaylistSaveAsync(input.store, {
      userId: input.userId,
      playlistId: parsed.playlistId,
    });

    return {
      status: 200,
      body: {
        saved: false,
        playlistId: parsed.playlistId,
      },
    };
  } catch (error) {
    return mapStoreError(error);
  }
}
