import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";

export const PLAYLIST_COVERS_BUCKET =
  process.env.PLAYLIST_COVERS_BUCKET?.trim() || "playlist-covers";

export const PLAYLIST_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const PLAYLIST_COVER_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const PLAYLIST_COVER_OUTPUT_SIZE = 1200;
export const PLAYLIST_COVER_WEBP_QUALITY = 85;
/** ~5000×5000; rejects decompression bombs before heavy decode work. */
export const PLAYLIST_COVER_MAX_INPUT_PIXELS = 25_000_000;

export const PLAYLIST_COVER_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const UUID_RE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const COVER_PATH_RE = new RegExp(
  `^(${UUID_RE})\\/(${UUID_RE})\\/(${UUID_RE})\\.webp$`,
  "i",
);

export function buildPlaylistCoverStoragePath(
  userId: string,
  playlistId: string,
  fileId = randomUUID(),
): string {
  return `${userId}/${playlistId}/${fileId}.webp`;
}

/**
 * Strict object-path contract for playlist covers:
 * `{user_id}/{playlist_id}/{uuid}.webp`
 */
export function isValidPlaylistCoverPath(
  coverPath: string | null | undefined,
  expectedUserId?: string,
  expectedPlaylistId?: string,
): boolean {
  if (typeof coverPath !== "string") {
    return false;
  }

  const trimmed = coverPath.trim();

  if (!trimmed || trimmed !== coverPath) {
    // Reject leading/trailing whitespace and empty.
    return false;
  }

  if (
    trimmed.includes("..") ||
    trimmed.includes("//") ||
    trimmed.startsWith("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) {
    return false;
  }

  const match = COVER_PATH_RE.exec(trimmed);

  if (!match) {
    return false;
  }

  const [, userId, playlistId] = match;

  if (expectedUserId && userId.toLowerCase() !== expectedUserId.toLowerCase()) {
    return false;
  }

  if (
    expectedPlaylistId &&
    playlistId.toLowerCase() !== expectedPlaylistId.toLowerCase()
  ) {
    return false;
  }

  return true;
}

export function assertPlaylistCoverPathForOwner(
  coverPath: string | null | undefined,
  userId: string,
  playlistId: string,
): coverPath is string {
  return isValidPlaylistCoverPath(coverPath, userId, playlistId);
}

export function parsePlaylistCoverPath(coverPath: string): {
  userId: string;
  playlistId: string;
  fileName: string;
} | null {
  if (!isValidPlaylistCoverPath(coverPath)) {
    return null;
  }

  const match = COVER_PATH_RE.exec(coverPath.trim());

  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    playlistId: match[2],
    fileName: `${match[3]}.webp`,
  };
}

export type ReplacePlaylistCoverStatus =
  | "ok"
  | "not_found"
  | "conflict"
  | "unauthorized";

export type ReplacePlaylistCoverResult = {
  status: ReplacePlaylistCoverStatus;
  previous_path: string | null;
  cover_path: string | null;
  cover_updated_at: string | null;
  updated_at: string | null;
};

export async function replacePlaylistCoverPathCas(
  supabase: SupabaseClient,
  playlistId: string,
  expectedOldPath: string | null,
  newPath: string | null,
): Promise<
  | { ok: true; result: ReplacePlaylistCoverResult }
  | { ok: false; error: string }
> {
  if (newPath !== null && !isValidPlaylistCoverPath(newPath)) {
    return { ok: false, error: "invalid_new_path" };
  }

  if (
    expectedOldPath !== null &&
    !isValidPlaylistCoverPath(expectedOldPath)
  ) {
    return { ok: false, error: "invalid_expected_path" };
  }

  const { data, error } = await supabase.rpc("replace_playlist_cover_path", {
    p_playlist_id: playlistId,
    p_expected_old_path: expectedOldPath,
    p_new_path: newPath,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== "object") {
    return { ok: false, error: "empty_rpc_result" };
  }

  const status = String(
    (row as { status?: string }).status ?? "",
  ) as ReplacePlaylistCoverStatus;

  if (
    status !== "ok" &&
    status !== "not_found" &&
    status !== "conflict" &&
    status !== "unauthorized"
  ) {
    return { ok: false, error: "unexpected_rpc_status" };
  }

  return {
    ok: true,
    result: {
      status,
      previous_path:
        ((row as { previous_path?: string | null }).previous_path as
          | string
          | null) ?? null,
      cover_path:
        ((row as { cover_path?: string | null }).cover_path as string | null) ??
        null,
      cover_updated_at:
        ((row as { cover_updated_at?: string | null }).cover_updated_at as
          | string
          | null) ?? null,
      updated_at:
        ((row as { updated_at?: string | null }).updated_at as string | null) ??
        null,
    },
  };
}

export async function createPlaylistCoverSignedUrl(
  storageClient: SupabaseClient,
  coverPath: string | null | undefined,
  options?: {
    userId?: string;
    playlistId?: string;
    expiresIn?: number;
  },
): Promise<string | null> {
  if (!coverPath || !coverPath.trim()) {
    return null;
  }

  if (
    !isValidPlaylistCoverPath(
      coverPath,
      options?.userId,
      options?.playlistId,
    )
  ) {
    console.error("playlist_cover_invalid_path");
    return null;
  }

  const expiresIn =
    options?.expiresIn ?? PLAYLIST_COVER_SIGNED_URL_TTL_SECONDS;

  const { data, error } = await storageClient.storage
    .from(PLAYLIST_COVERS_BUCKET)
    .createSignedUrl(coverPath.trim(), expiresIn);

  if (error || !data?.signedUrl) {
    console.error(
      "playlist_cover_signed_url_error",
      error?.message ?? "missing_signed_url",
    );
    return null;
  }

  return normalizeStorageSignedUrl(data.signedUrl);
}

export async function createPlaylistCoverSignedUrlsBatch(
  storageClient: SupabaseClient,
  coverPaths: string[],
  options?: {
    userId?: string;
    expiresIn?: number;
  },
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const unique = Array.from(
    new Set(
      coverPaths
        .map((path) => path.trim())
        .filter((path) => path.length > 0),
    ),
  );

  const validPaths: string[] = [];

  for (const path of unique) {
    if (!isValidPlaylistCoverPath(path, options?.userId)) {
      console.error("playlist_cover_invalid_path_batch");
      result.set(path, null);
      continue;
    }

    validPaths.push(path);
  }

  if (validPaths.length === 0) {
    return result;
  }

  const expiresIn =
    options?.expiresIn ?? PLAYLIST_COVER_SIGNED_URL_TTL_SECONDS;

  const { data, error } = await storageClient.storage
    .from(PLAYLIST_COVERS_BUCKET)
    .createSignedUrls(validPaths, expiresIn);

  if (error) {
    console.error("playlist_cover_signed_urls_batch_error", error.message);

    for (const path of validPaths) {
      result.set(path, null);
    }

    return result;
  }

  for (const entry of data ?? []) {
    const path = entry.path;

    if (!path) {
      continue;
    }

    if (entry.error || !entry.signedUrl) {
      console.error(
        "playlist_cover_signed_url_item_error",
        entry.error ?? "missing_signed_url",
      );
      result.set(path, null);
      continue;
    }

    result.set(path, normalizeStorageSignedUrl(entry.signedUrl));
  }

  for (const path of validPaths) {
    if (!result.has(path)) {
      result.set(path, null);
    }
  }

  return result;
}

export async function removePlaylistCoverObject(
  storageClient: SupabaseClient,
  coverPath: string,
  expectedUserId: string,
  expectedPlaylistId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    !assertPlaylistCoverPathForOwner(
      coverPath,
      expectedUserId,
      expectedPlaylistId,
    )
  ) {
    return { ok: false, error: "invalid_path" };
  }

  const { error } = await storageClient.storage
    .from(PLAYLIST_COVERS_BUCKET)
    .remove([coverPath.trim()]);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
