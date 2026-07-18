import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AVATAR_MAX_BYTES,
  AVATAR_OUTPUT_SIZE,
} from "@/lib/images/avatar-constants";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";

export const USER_AVATARS_BUCKET =
  process.env.USER_AVATARS_BUCKET?.trim() || "user-avatars";

export const USER_AVATAR_MAX_BYTES = AVATAR_MAX_BYTES;
export const USER_AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const USER_AVATAR_OUTPUT_SIZE = AVATAR_OUTPUT_SIZE;
export const USER_AVATAR_WEBP_QUALITY = 90;
export const USER_AVATAR_MAX_INPUT_PIXELS = 25_000_000;

export const USER_AVATAR_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const UUID_RE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const AVATAR_PATH_RE = new RegExp(`^(${UUID_RE})\\/(${UUID_RE})\\.webp$`, "i");

export function buildUserAvatarStoragePath(
  userId: string,
  fileId = randomUUID(),
): string {
  return `${userId}/${fileId}.webp`;
}

export function isValidUserAvatarPath(
  avatarPath: string | null | undefined,
  expectedUserId?: string,
): boolean {
  if (typeof avatarPath !== "string") {
    return false;
  }

  const trimmed = avatarPath.trim();

  if (!trimmed || trimmed !== avatarPath) {
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

  const match = AVATAR_PATH_RE.exec(trimmed);

  if (!match) {
    return false;
  }

  const [, userId] = match;

  if (expectedUserId && userId.toLowerCase() !== expectedUserId.toLowerCase()) {
    return false;
  }

  return true;
}

export function assertUserAvatarPathForOwner(
  avatarPath: string | null | undefined,
  userId: string,
): avatarPath is string {
  return isValidUserAvatarPath(avatarPath, userId);
}

export async function createUserAvatarSignedUrl(
  storageClient: SupabaseClient,
  avatarPath: string | null | undefined,
  options?: {
    userId?: string;
    expiresIn?: number;
    cacheBuster?: string | number;
  },
): Promise<string | null> {
  if (!avatarPath || !avatarPath.trim()) {
    return null;
  }

  if (!isValidUserAvatarPath(avatarPath, options?.userId)) {
    console.error("user_avatar_invalid_path");
    return null;
  }

  const expiresIn =
    options?.expiresIn ?? USER_AVATAR_SIGNED_URL_TTL_SECONDS;

  const { data, error } = await storageClient.storage
    .from(USER_AVATARS_BUCKET)
    .createSignedUrl(avatarPath.trim(), expiresIn);

  if (error || !data?.signedUrl) {
    console.error(
      "user_avatar_signed_url_error",
      error?.message ?? "missing_signed_url",
    );
    return null;
  }

  const normalized = normalizeStorageSignedUrl(data.signedUrl);

  if (!normalized) {
    return null;
  }

  if (options?.cacheBuster !== undefined) {
    const url = new URL(normalized);
    url.searchParams.set("v", String(options.cacheBuster));
    return url.toString();
  }

  return normalized;
}

export async function removeUserAvatarObject(
  storageClient: SupabaseClient,
  avatarPath: string,
  expectedUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!assertUserAvatarPathForOwner(avatarPath, expectedUserId)) {
    return { ok: false, error: "invalid_path" };
  }

  const { error } = await storageClient.storage
    .from(USER_AVATARS_BUCKET)
    .remove([avatarPath.trim()]);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export function appendAvatarCacheBuster(
  avatarUrl: string | null | undefined,
  cacheBuster: string | number,
): string | null {
  if (!avatarUrl) {
    return null;
  }

  try {
    const url = new URL(avatarUrl);
    url.searchParams.set("v", String(cacheBuster));
    return url.toString();
  } catch {
    return avatarUrl;
  }
}
