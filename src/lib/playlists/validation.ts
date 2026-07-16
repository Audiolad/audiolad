import {
  PLAYLIST_TITLE_MAX_LENGTH,
  PLAYLIST_VISIBILITIES,
  type PlaylistVisibility,
} from "@/lib/playlists/types";

const FORBIDDEN_CLIENT_KEYS = new Set([
  "user_id",
  "slug",
  "published_at",
  "created_at",
  "updated_at",
  "id",
]);

export type ParsedJsonObject = Record<string, unknown>;

export function parseJsonObject(body: unknown): ParsedJsonObject | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  return body as ParsedJsonObject;
}

export function hasForbiddenClientKeys(body: ParsedJsonObject): boolean {
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_CLIENT_KEYS.has(key)) {
      return true;
    }
  }

  return false;
}

export type TitleValidationResult =
  | { ok: true; title: string }
  | { ok: false; error: "invalid_request" };

export function validatePlaylistTitle(value: unknown): TitleValidationResult {
  if (typeof value !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  const title = value.trim();

  if (title.length < 1 || title.length > PLAYLIST_TITLE_MAX_LENGTH) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, title };
}

export type VisibilityValidationResult =
  | { ok: true; visibility: PlaylistVisibility }
  | { ok: false; error: "invalid_request" };

export function validatePlaylistVisibility(
  value: unknown,
): VisibilityValidationResult {
  if (typeof value !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  if (
    !(PLAYLIST_VISIBILITIES as readonly string[]).includes(value)
  ) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, visibility: value as PlaylistVisibility };
}

export type CreatePlaylistInput =
  | {
      ok: true;
      title: string;
      visibility: PlaylistVisibility;
      isEditorial: boolean;
    }
  | { ok: false; error: "invalid_request" };

export function parseCreatePlaylistBody(body: unknown): CreatePlaylistInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  if (hasForbiddenClientKeys(parsed)) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["title", "visibility", "is_editorial"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  if (!("title" in parsed)) {
    return { ok: false, error: "invalid_request" };
  }

  const titleResult = validatePlaylistTitle(parsed.title);

  if (!titleResult.ok) {
    return titleResult;
  }

  const visibilityValue =
    "visibility" in parsed ? parsed.visibility : "private";
  const visibilityResult = validatePlaylistVisibility(visibilityValue);

  if (!visibilityResult.ok) {
    return visibilityResult;
  }

  const isEditorial =
    "is_editorial" in parsed && parsed.is_editorial === true;

  if (isEditorial && visibilityResult.visibility !== "public") {
    return { ok: false, error: "invalid_request" };
  }

  return {
    ok: true,
    title: titleResult.title,
    visibility: visibilityResult.visibility,
    isEditorial,
  };
}

export type PatchPlaylistInput =
  | {
      ok: true;
      title?: string;
      visibility?: PlaylistVisibility;
      isEditorial?: boolean;
    }
  | { ok: false; error: "invalid_request" };

export function parsePatchPlaylistBody(body: unknown): PatchPlaylistInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  if (hasForbiddenClientKeys(parsed)) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["title", "visibility", "is_editorial"]);
  const keys = Object.keys(parsed);

  if (keys.length === 0) {
    return { ok: false, error: "invalid_request" };
  }

  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  const result: {
    title?: string;
    visibility?: PlaylistVisibility;
    isEditorial?: boolean;
  } = {};

  if ("title" in parsed) {
    const titleResult = validatePlaylistTitle(parsed.title);

    if (!titleResult.ok) {
      return titleResult;
    }

    result.title = titleResult.title;
  }

  if ("visibility" in parsed) {
    const visibilityResult = validatePlaylistVisibility(parsed.visibility);

    if (!visibilityResult.ok) {
      return visibilityResult;
    }

    result.visibility = visibilityResult.visibility;
  }

  if ("is_editorial" in parsed) {
    if (typeof parsed.is_editorial !== "boolean") {
      return { ok: false, error: "invalid_request" };
    }

    result.isEditorial = parsed.is_editorial;
  }

  if (
    result.isEditorial === true &&
    result.visibility === "private"
  ) {
    return { ok: false, error: "invalid_request" };
  }

  if (
    result.title === undefined &&
    result.visibility === undefined &&
    result.isEditorial === undefined
  ) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, ...result };
}

export type EditorialPracticesPostInput =
  | { ok: true; practiceIds: string[] }
  | { ok: false; error: "invalid_request" };

export function parseEditorialPracticesPostBody(
  body: unknown,
): EditorialPracticesPostInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["practiceIds"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  if (!("practiceIds" in parsed) || !Array.isArray(parsed.practiceIds)) {
    return { ok: false, error: "invalid_request" };
  }

  if (parsed.practiceIds.length === 0 || parsed.practiceIds.length > 50) {
    return { ok: false, error: "invalid_request" };
  }

  const practiceIds: string[] = [];
  const seen = new Set<string>();

  for (const value of parsed.practiceIds) {
    if (typeof value !== "string" || !isUuid(value)) {
      return { ok: false, error: "invalid_request" };
    }

    if (seen.has(value)) {
      return { ok: false, error: "invalid_request" };
    }

    seen.add(value);
    practiceIds.push(value);
  }

  return { ok: true, practiceIds };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export type MembershipPutInput =
  | {
      ok: true;
      practiceId: string;
      playlistIds: string[];
    }
  | { ok: false; error: "invalid_request" };

/**
 * PUT /api/playlists/membership body:
 * { practiceId: uuid, playlistIds: uuid[] } — unique, max 50, no unknown keys.
 */
export function parseMembershipPutBody(body: unknown): MembershipPutInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["practiceId", "playlistIds"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  if (!("practiceId" in parsed) || !("playlistIds" in parsed)) {
    return { ok: false, error: "invalid_request" };
  }

  if (typeof parsed.practiceId !== "string" || !isUuid(parsed.practiceId)) {
    return { ok: false, error: "invalid_request" };
  }

  if (!Array.isArray(parsed.playlistIds)) {
    return { ok: false, error: "invalid_request" };
  }

  if (parsed.playlistIds.length > 50) {
    return { ok: false, error: "invalid_request" };
  }

  const playlistIds: string[] = [];
  const seen = new Set<string>();

  for (const value of parsed.playlistIds) {
    if (typeof value !== "string" || !isUuid(value)) {
      return { ok: false, error: "invalid_request" };
    }

    if (seen.has(value)) {
      return { ok: false, error: "invalid_request" };
    }

    seen.add(value);
    playlistIds.push(value);
  }

  return {
    ok: true,
    practiceId: parsed.practiceId,
    playlistIds,
  };
}

export type MovePlaylistItemDirection = "up" | "down";

export type MovePlaylistItemInput =
  | { ok: true; direction: MovePlaylistItemDirection }
  | { ok: false; error: "invalid_request" };

/**
 * POST /api/playlists/[id]/items/[practiceId]/move body:
 * { direction: "up" | "down" } — no unknown keys.
 */
export function parseMovePlaylistItemBody(body: unknown): MovePlaylistItemInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["direction"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  if (!("direction" in parsed) || typeof parsed.direction !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  const direction = parsed.direction.trim().toLowerCase();

  if (direction !== "up" && direction !== "down") {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, direction };
}
