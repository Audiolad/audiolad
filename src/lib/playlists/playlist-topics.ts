/**
 * Playlist ↔ existing topics dictionary (Stage 4B.1).
 *
 * Uses public.topics + playlist_topics. Does not create a new vocabulary,
 * free-form tags, or direction_id. Writes go through set_playlist_topics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseCatalogTopicKeyList } from "@/lib/catalog/topic-filter";

export const PLAYLIST_TOPICS_TABLE = "playlist_topics";
export const PLAYLIST_TOPIC_LIMIT = 3;
export const SET_PLAYLIST_TOPICS_RPC = "set_playlist_topics";

const PLAYLIST_TOPIC_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type PlaylistTopicAssignment = {
  playlistId: string;
  key: string;
  sortOrder: number;
};

export type SetPlaylistTopicsResult = {
  playlist_id: string;
  topic_keys: string[];
  topic_count: number;
  topic_limit: number;
};

export function parsePlaylistTopicKeysInput(
  value: unknown,
):
  | { ok: true; keys: string[] }
  | { ok: false; code: "invalid_request" | "topic_limit_exceeded" } {
  if (!Array.isArray(value) || !value.every((key) => typeof key === "string")) {
    return { ok: false, code: "invalid_request" };
  }

  const keys: string[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    const key = raw.trim().toLowerCase();

    if (!key) {
      continue;
    }

    if (!PLAYLIST_TOPIC_KEY_PATTERN.test(key) || seen.has(key)) {
      return { ok: false, code: "invalid_request" };
    }

    seen.add(key);
    keys.push(key);
  }

  if (keys.length > PLAYLIST_TOPIC_LIMIT) {
    return { ok: false, code: "topic_limit_exceeded" };
  }

  return { ok: true, keys };
}

export function normalizePlaylistTopicKeys(
  value: string | readonly string[] | null | undefined,
): string[] {
  if (value == null) {
    return parseCatalogTopicKeyList(null);
  }

  if (typeof value === "string") {
    return parseCatalogTopicKeyList(value);
  }

  return parseCatalogTopicKeyList(value.join(","));
}

export function mapPlaylistTopicKeys(
  rows: ReadonlyArray<{
    key?: string | null;
    title?: string | null;
    slug?: string | null;
  }>,
): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const row of rows) {
    const key = row.key?.trim().toLowerCase();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    keys.push(key);
  }

  return keys;
}

function topicJoinRow(
  value: unknown,
): { key?: string; sort_order?: number; is_active?: boolean } | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = Array.isArray(value) ? value[0] : value;

  if (typeof row !== "object" || row === null) {
    return null;
  }

  return row as { key?: string; sort_order?: number; is_active?: boolean };
}

export async function getActiveTopicIdsByKeys(
  supabase: SupabaseClient,
  topicKeys: readonly string[] | string | null | undefined,
): Promise<Map<string, string>> {
  const keys = normalizePlaylistTopicKeys(topicKeys);
  const byKey = new Map<string, string>();

  if (keys.length === 0) {
    return byKey;
  }

  const { data, error } = await supabase
    .from("topics")
    .select("id, key")
    .eq("is_active", true)
    .in("key", keys);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    const id = typeof row?.id === "string" ? row.id : "";
    const key = typeof row?.key === "string" ? row.key.trim().toLowerCase() : "";

    if (!id || !key) {
      continue;
    }

    byKey.set(key, id);
  }

  return byKey;
}

export async function listListedPlaylistIdsForTopicKeys(
  supabase: SupabaseClient,
  topicKeys: readonly string[] | string | null | undefined,
): Promise<string[]> {
  const topicIds = [...(await getActiveTopicIdsByKeys(supabase, topicKeys)).values()];

  if (topicIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from(PLAYLIST_TOPICS_TABLE)
    .select("playlist_id")
    .in("topic_id", topicIds);

  if (error) {
    throw new Error(error.message);
  }

  return [
    ...new Set(
      (data ?? [])
        .map((row) => (typeof row?.playlist_id === "string" ? row.playlist_id : ""))
        .filter((id) => id.length > 0),
    ),
  ];
}

export async function getPlaylistTopicKeys(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<string[]> {
  const byId = await listPlaylistTopicKeysByPlaylistIds(supabase, [playlistId]);
  return byId.get(playlistId) ?? [];
}

export async function listPlaylistTopicKeysByPlaylistIds(
  supabase: SupabaseClient,
  playlistIds: readonly string[],
): Promise<Map<string, string[]>> {
  const keysByPlaylistId = new Map<string, string[]>();

  if (playlistIds.length === 0) {
    return keysByPlaylistId;
  }

  const { data, error } = await supabase
    .from(PLAYLIST_TOPICS_TABLE)
    .select("playlist_id, topics!inner(key, sort_order, is_active)")
    .in("playlist_id", [...playlistIds]);

  if (error) {
    throw new Error(error.message);
  }

  const assignments: PlaylistTopicAssignment[] = [];

  for (const row of data ?? []) {
    const playlistId =
      typeof row?.playlist_id === "string" ? row.playlist_id : "";
    const topic = topicJoinRow(row?.topics);

    if (!playlistId || topic?.is_active !== true || !topic.key) {
      continue;
    }

    assignments.push({
      playlistId,
      key: topic.key.trim().toLowerCase(),
      sortOrder: typeof topic.sort_order === "number" ? topic.sort_order : 0,
    });
  }

  assignments.sort((left, right) => {
    if (left.playlistId !== right.playlistId) {
      return left.playlistId.localeCompare(right.playlistId);
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.key.localeCompare(right.key);
  });

  for (const playlistId of playlistIds) {
    keysByPlaylistId.set(
      playlistId,
      mapPlaylistTopicKeys(
        assignments.filter((item) => item.playlistId === playlistId),
      ),
    );
  }

  return keysByPlaylistId;
}

export type SetPlaylistTopicsResponse =
  | { ok: true; result: SetPlaylistTopicsResult }
  | { ok: false; status: number; code: string; message: string };

function mapPlaylistTopicRpcError(message: string): {
  status: number;
  code: string;
  message: string;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, code: "unauthorized", message: "Требуется авторизация." };
  }

  if (normalized.includes("forbidden")) {
    return {
      status: 403,
      code: "forbidden",
      message: "Недостаточно прав для изменения тем плейлиста.",
    };
  }

  if (normalized.includes("playlist_not_found")) {
    return { status: 404, code: "not_found", message: "Плейлист не найден." };
  }

  if (normalized.includes("topic_not_found")) {
    return {
      status: 400,
      code: "topic_not_found",
      message: "Выбранная тема недоступна.",
    };
  }

  if (normalized.includes("topic_limit_exceeded")) {
    return {
      status: 400,
      code: "topic_limit_exceeded",
      message: "Можно выбрать не более 3 тем.",
    };
  }

  if (
    normalized.includes("duplicate_topic_keys") ||
    normalized.includes("invalid_request") ||
    normalized.includes("playlist_id_required")
  ) {
    return { status: 400, code: "invalid_request", message: "Некорректный запрос." };
  }

  return {
    status: 500,
    code: "topic_sync_failed",
    message: "Не удалось сохранить темы плейлиста.",
  };
}

export async function setPlaylistTopics(
  supabase: SupabaseClient,
  playlistId: string,
  topicKeys: string[],
): Promise<SetPlaylistTopicsResponse> {
  const { data, error } = await supabase.rpc(SET_PLAYLIST_TOPICS_RPC, {
    p_playlist_id: playlistId,
    p_topic_keys: topicKeys,
  });

  if (error) {
    const mapped = mapPlaylistTopicRpcError(error.message);
    return {
      ok: false,
      status: mapped.status,
      code: mapped.code,
      message: mapped.message,
    };
  }

  if (!isSetPlaylistTopicsResult(data)) {
    return {
      ok: false,
      status: 500,
      code: "topic_sync_failed",
      message: "Не удалось сохранить темы плейлиста.",
    };
  }

  return {
    ok: true,
    result: {
      playlist_id: data.playlist_id,
      topic_keys: data.topic_keys,
      topic_count: data.topic_count,
      topic_limit: data.topic_limit,
    },
  };
}

export function isSetPlaylistTopicsResult(
  value: unknown,
): value is SetPlaylistTopicsResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as SetPlaylistTopicsResult;

  return (
    typeof row.playlist_id === "string" &&
    Array.isArray(row.topic_keys) &&
    row.topic_keys.every((key) => typeof key === "string") &&
    typeof row.topic_count === "number" &&
    typeof row.topic_limit === "number"
  );
}
