import { isValidPlaylistPublicSlug } from "@/lib/playlists/public-slug";
import {
  PLAYLIST_COLLABORATOR_ROLES,
  PLAYLIST_DESCRIPTION_MAX_LENGTH,
  PLAYLIST_TITLE_MAX_LENGTH,
  PLAYLIST_VISIBILITIES,
  type PlaylistCollaboratorRole,
  type PlaylistVisibility,
} from "@/lib/playlists/types";

const FORBIDDEN_CLIENT_KEYS = new Set([
  "user_id",
  "published_at",
  "created_at",
  "updated_at",
  "id",
  "owner_type",
  "created_by",
  "first_published_at",
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

export const PLAYLIST_DESCRIPTION_TOO_LONG_MESSAGE = `Описание не должно превышать ${PLAYLIST_DESCRIPTION_MAX_LENGTH} символов.`;

export type DescriptionValidationResult =
  | { ok: true; description: string | null }
  | { ok: false; error: "invalid_request"; message?: string };

export function validatePlaylistDescription(
  value: unknown,
): DescriptionValidationResult {
  if (value === null) {
    return { ok: true, description: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  const description = value.trim();

  if (description.length === 0) {
    return { ok: true, description: null };
  }

  if (description.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: "invalid_request",
      message: PLAYLIST_DESCRIPTION_TOO_LONG_MESSAGE,
    };
  }

  return { ok: true, description };
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

export type SlugValidationResult =
  | { ok: true; slug: string }
  | { ok: false; error: "invalid_request" };

export function validatePlaylistSlug(value: unknown): SlugValidationResult {
  if (typeof value !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  const slug = value.trim().toLowerCase();

  if (!isValidPlaylistPublicSlug(slug)) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, slug };
}

export type CreatePlaylistInput =
  | {
      ok: true;
      title: string;
      visibility: PlaylistVisibility;
      isEditorial: boolean;
      description: string | null;
      slug?: string;
      directionId?: string;
    }
  | { ok: false; error: "invalid_request"; message?: string };

export function parseCreatePlaylistBody(body: unknown): CreatePlaylistInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  if (hasForbiddenClientKeys(parsed)) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set([
    "title",
    "visibility",
    "is_editorial",
    "description",
    "slug",
    "direction_id",
  ]);

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

  let description: string | null = null;

  if ("description" in parsed) {
    const descriptionResult = validatePlaylistDescription(parsed.description);

    if (!descriptionResult.ok) {
      return descriptionResult;
    }

    description = descriptionResult.description;
  }

  let slug: string | undefined;

  if ("slug" in parsed) {
    const slugResult = validatePlaylistSlug(parsed.slug);

    if (!slugResult.ok) {
      return slugResult;
    }

    slug = slugResult.slug;
  }

  let directionId: string | undefined;

  if ("direction_id" in parsed) {
    if (typeof parsed.direction_id !== "string" || !isUuid(parsed.direction_id)) {
      return { ok: false, error: "invalid_request" };
    }

    directionId = parsed.direction_id;
  }

  if (isEditorial && !directionId) {
    return { ok: false, error: "invalid_request" };
  }

  if (!isEditorial && directionId) {
    return { ok: false, error: "invalid_request" };
  }

  return {
    ok: true,
    title: titleResult.title,
    visibility: visibilityResult.visibility,
    isEditorial,
    description,
    slug,
    directionId,
  };
}

export type PatchPlaylistInput =
  | {
      ok: true;
      title?: string;
      visibility?: PlaylistVisibility;
      isEditorial?: boolean;
      description?: string | null;
      slug?: string;
      directionId?: string;
    }
  | { ok: false; error: "invalid_request"; message?: string };

export function parsePatchPlaylistBody(body: unknown): PatchPlaylistInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  if (hasForbiddenClientKeys(parsed)) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set([
    "title",
    "visibility",
    "is_editorial",
    "description",
    "slug",
    "direction_id",
  ]);
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
    description?: string | null;
    slug?: string;
    directionId?: string;
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

  if ("description" in parsed) {
    const descriptionResult = validatePlaylistDescription(parsed.description);

    if (!descriptionResult.ok) {
      return descriptionResult;
    }

    result.description = descriptionResult.description;
  }

  if ("slug" in parsed) {
    const slugResult = validatePlaylistSlug(parsed.slug);

    if (!slugResult.ok) {
      return slugResult;
    }

    result.slug = slugResult.slug;
  }

  if ("direction_id" in parsed) {
    if (typeof parsed.direction_id !== "string" || !isUuid(parsed.direction_id)) {
      return { ok: false, error: "invalid_request" };
    }

    result.directionId = parsed.direction_id;
  }

  if (
    result.title === undefined &&
    result.visibility === undefined &&
    result.isEditorial === undefined &&
    result.description === undefined &&
    result.slug === undefined &&
    result.directionId === undefined
  ) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, ...result };
}

export type EditorialPlaylistItemInput = {
  practiceId: string;
  audioItemId: string | null;
};

export type EditorialPracticesPostInput =
  | { ok: true; items: EditorialPlaylistItemInput[] }
  | { ok: false; error: "invalid_request" };

function parseEditorialItemValue(
  value: unknown,
): EditorialPlaylistItemInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const allowedKeys = new Set(["practiceId", "audioItemId"]);

  for (const key of Object.keys(row)) {
    if (!allowedKeys.has(key)) {
      return null;
    }
  }

  if (typeof row.practiceId !== "string" || !isUuid(row.practiceId)) {
    return null;
  }

  if (row.audioItemId == null) {
    return { practiceId: row.practiceId, audioItemId: null };
  }

  if (typeof row.audioItemId !== "string" || !isUuid(row.audioItemId)) {
    return null;
  }

  return { practiceId: row.practiceId, audioItemId: row.audioItemId };
}

function editorialItemIdentity(item: EditorialPlaylistItemInput): string {
  return item.audioItemId
    ? `${item.practiceId}:${item.audioItemId}`
    : item.practiceId;
}

export function parseEditorialPracticesPostBody(
  body: unknown,
): EditorialPracticesPostInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["practiceIds", "items"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  const hasPracticeIds = "practiceIds" in parsed;
  const hasItems = "items" in parsed;

  if (hasPracticeIds === hasItems) {
    return { ok: false, error: "invalid_request" };
  }

  const items: EditorialPlaylistItemInput[] = [];
  const seen = new Set<string>();

  if (hasPracticeIds) {
    if (!Array.isArray(parsed.practiceIds)) {
      return { ok: false, error: "invalid_request" };
    }

    if (parsed.practiceIds.length === 0 || parsed.practiceIds.length > 50) {
      return { ok: false, error: "invalid_request" };
    }

    for (const value of parsed.practiceIds) {
      if (typeof value !== "string" || !isUuid(value)) {
        return { ok: false, error: "invalid_request" };
      }

      if (seen.has(value)) {
        return { ok: false, error: "invalid_request" };
      }

      seen.add(value);
      items.push({ practiceId: value, audioItemId: null });
    }

    return { ok: true, items };
  }

  if (!Array.isArray(parsed.items)) {
    return { ok: false, error: "invalid_request" };
  }

  if (parsed.items.length === 0 || parsed.items.length > 50) {
    return { ok: false, error: "invalid_request" };
  }

  for (const value of parsed.items) {
    const item = parseEditorialItemValue(value);

    if (!item) {
      return { ok: false, error: "invalid_request" };
    }

    const identity = editorialItemIdentity(item);

    if (seen.has(identity)) {
      return { ok: false, error: "invalid_request" };
    }

    seen.add(identity);
    items.push(item);
  }

  return { ok: true, items };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseOptionalUuidQueryValue(
  value: string | null,
): { ok: true; id: string | null } | { ok: false } {
  if (value == null || value.trim() === "") {
    return { ok: true, id: null };
  }

  if (!isUuid(value)) {
    return { ok: false };
  }

  return { ok: true, id: value };
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
  | {
      ok: true;
      direction: MovePlaylistItemDirection;
      audioItemId: string | null;
      targetPosition: number | null;
    }
  | { ok: false; error: "invalid_request" };

/**
 * POST /api/playlists/[id]/items/[practiceId]/move body:
 * { direction: "up" | "down", audioItemId?: uuid | null, targetPosition?: int }
 * — no unknown keys. targetPosition is the existing playlist_items.position
 * of the drop target; omitted for one-step ↑/↓.
 */
export function parseMovePlaylistItemBody(body: unknown): MovePlaylistItemInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["direction", "audioItemId", "targetPosition"]);

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

  let targetPosition: number | null = null;

  if ("targetPosition" in parsed && parsed.targetPosition != null) {
    if (
      typeof parsed.targetPosition !== "number" ||
      !Number.isInteger(parsed.targetPosition) ||
      parsed.targetPosition < 1 ||
      parsed.targetPosition > 2147483647
    ) {
      return { ok: false, error: "invalid_request" };
    }

    targetPosition = parsed.targetPosition;
  }

  if (!("audioItemId" in parsed) || parsed.audioItemId == null) {
    return { ok: true, direction, audioItemId: null, targetPosition };
  }

  if (typeof parsed.audioItemId !== "string" || !isUuid(parsed.audioItemId)) {
    return { ok: false, error: "invalid_request" };
  }

  return {
    ok: true,
    direction,
    audioItemId: parsed.audioItemId,
    targetPosition,
  };
}

export type CollaboratorMutationInput =
  | { ok: true; userId: string; role: PlaylistCollaboratorRole }
  | { ok: false; error: "invalid_request" };

export function parseCollaboratorUpsertBody(
  body: unknown,
): CollaboratorMutationInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["user_id", "role"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  if (typeof parsed.user_id !== "string" || !isUuid(parsed.user_id)) {
    return { ok: false, error: "invalid_request" };
  }

  let role: PlaylistCollaboratorRole = "playlist_admin";

  if ("role" in parsed) {
    if (
      typeof parsed.role !== "string" ||
      !(PLAYLIST_COLLABORATOR_ROLES as readonly string[]).includes(parsed.role)
    ) {
      return { ok: false, error: "invalid_request" };
    }

    role = parsed.role as PlaylistCollaboratorRole;
  }

  return {
    ok: true,
    userId: parsed.user_id,
    role,
  };
}

export type ReplacePlaylistItemInput =
  | { ok: true; practiceId: string; audioItemId: string | null }
  | { ok: false; error: "invalid_request" };

/**
 * POST /api/playlists/[id]/items/[practiceId]/replace body:
 * { practiceId: uuid, audioItemId?: uuid | null } — replacement product or track.
 */
export function parseReplacePlaylistItemBody(
  body: unknown,
): ReplacePlaylistItemInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["practiceId", "audioItemId"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  if (typeof parsed.practiceId !== "string" || !isUuid(parsed.practiceId)) {
    return { ok: false, error: "invalid_request" };
  }

  if (!("audioItemId" in parsed) || parsed.audioItemId == null) {
    return { ok: true, practiceId: parsed.practiceId, audioItemId: null };
  }

  if (typeof parsed.audioItemId !== "string" || !isUuid(parsed.audioItemId)) {
    return { ok: false, error: "invalid_request" };
  }

  return {
    ok: true,
    practiceId: parsed.practiceId,
    audioItemId: parsed.audioItemId,
  };
}

export type CollaboratorDeleteInput =
  | { ok: true; userId: string }
  | { ok: false; error: "invalid_request" };

export function parseCollaboratorDeleteBody(
  body: unknown,
): CollaboratorDeleteInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["user_id"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  if (typeof parsed.user_id !== "string" || !isUuid(parsed.user_id)) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, userId: parsed.user_id };
}

export type DirectionMutationInput =
  | { ok: true; name: string; slug: string }
  | { ok: false; error: "invalid_request" };

export type DirectionPatchInput =
  | { ok: true; name?: string; slug?: string }
  | { ok: false; error: "invalid_request" };

export function parseCreateDirectionBody(body: unknown): DirectionMutationInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["name", "slug"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  const nameResult = validatePlaylistTitle(parsed.name);

  if (!nameResult.ok) {
    return nameResult;
  }

  const slugResult = validatePlaylistSlug(parsed.slug);

  if (!slugResult.ok) {
    return slugResult;
  }

  return { ok: true, name: nameResult.title, slug: slugResult.slug };
}

export function parsePatchDirectionBody(body: unknown): DirectionPatchInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["name", "slug"]);
  const keys = Object.keys(parsed);

  if (keys.length === 0) {
    return { ok: false, error: "invalid_request" };
  }

  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  const result: { name?: string; slug?: string } = {};

  if ("name" in parsed) {
    const nameResult = validatePlaylistTitle(parsed.name);

    if (!nameResult.ok) {
      return nameResult;
    }

    result.name = nameResult.title;
  }

  if ("slug" in parsed) {
    const slugResult = validatePlaylistSlug(parsed.slug);

    if (!slugResult.ok) {
      return slugResult;
    }

    result.slug = slugResult.slug;
  }

  if (result.name === undefined && result.slug === undefined) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, ...result };
}

export type DirectionMemberInput =
  | { ok: true; userId: string }
  | { ok: false; error: "invalid_request" };

export function parseDirectionMemberBody(body: unknown): DirectionMemberInput {
  const parsed = parseJsonObject(body);

  if (!parsed) {
    return { ok: false, error: "invalid_request" };
  }

  const allowedKeys = new Set(["user_id"]);

  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: "invalid_request" };
    }
  }

  if (typeof parsed.user_id !== "string" || !isUuid(parsed.user_id)) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, userId: parsed.user_id };
}
