import type { PlaylistAccessRow } from "@/lib/playlists/playlist-access";
import {
  PLAYLIST_TOPIC_LIMIT,
  parsePlaylistTopicKeysInput,
  setPlaylistTopics,
  type SetPlaylistTopicsResult,
} from "@/lib/playlists/playlist-topics";

export type PlaylistTopicsRequestBody = {
  topicKeys?: unknown;
};

export type SetPlaylistTopicsApiResult =
  | { status: 200; body: { topicKeys: string[]; topicCount: number } }
  | { status: 401; body: { error: "unauthorized" } }
  | { status: 403; body: { error: "forbidden" } }
  | { status: 404; body: { error: "not_found" } }
  | { status: 400; body: { error: string; message?: string } }
  | { status: 500; body: { error: "internal_error" } };

export type PlaylistTopicsApiDeps = {
  loadPlaylist: (playlistId: string) => Promise<{
    playlist: PlaylistAccessRow | null;
    error: string | null;
  }>;
  canEditEditorial: (
    userId: string,
    playlist: PlaylistAccessRow,
  ) => Promise<boolean>;
  resolveActiveTopicIds: (keys: string[]) => Promise<Map<string, string>>;
  replaceTopics: (
    playlistId: string,
    keys: string[],
  ) => Promise<
    | { ok: true; result: SetPlaylistTopicsResult }
    | { ok: false; status: number; code: string; message: string }
  >;
};

export function parsePlaylistTopicsRequestBody(
  body: unknown,
):
  | { ok: true; keys: string[] }
  | { ok: false; code: "invalid_request" | "topic_limit_exceeded" } {
  if (!body || typeof body !== "object" || !("topicKeys" in body)) {
    return { ok: false, code: "invalid_request" };
  }

  return parsePlaylistTopicKeysInput((body as PlaylistTopicsRequestBody).topicKeys);
}

export async function handleSetPlaylistTopics(input: {
  userId: string | null;
  playlistId: string;
  body: unknown;
  deps: PlaylistTopicsApiDeps;
}): Promise<SetPlaylistTopicsApiResult> {
  if (!input.userId) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const { playlist, error } = await input.deps.loadPlaylist(input.playlistId);

  if (error) {
    return { status: 500, body: { error: "internal_error" } };
  }

  if (!playlist) {
    return { status: 404, body: { error: "not_found" } };
  }

  const canEdit = await input.deps.canEditEditorial(input.userId, playlist);

  if (!canEdit) {
    return { status: 403, body: { error: "forbidden" } };
  }

  const parsed = parsePlaylistTopicsRequestBody(input.body);

  if (!parsed.ok) {
    return {
      status: 400,
      body: {
        error: parsed.code,
        message:
          parsed.code === "topic_limit_exceeded"
            ? `Можно выбрать не более ${PLAYLIST_TOPIC_LIMIT} тем.`
            : "Некорректный запрос.",
      },
    };
  }

  if (parsed.keys.length > 0) {
    const activeIds = await input.deps.resolveActiveTopicIds(parsed.keys);

    if (activeIds.size !== parsed.keys.length) {
      return {
        status: 400,
        body: {
          error: "topic_not_found",
          message: "Выбранная тема недоступна.",
        },
      };
    }
  }

  const replaced = await input.deps.replaceTopics(input.playlistId, parsed.keys);

  if (!replaced.ok) {
    if (replaced.status === 403) {
      return { status: 403, body: { error: "forbidden" } };
    }

    if (replaced.status === 404) {
      return { status: 404, body: { error: "not_found" } };
    }

    if (replaced.status === 401) {
      return { status: 401, body: { error: "unauthorized" } };
    }

    if (replaced.status === 400) {
      return {
        status: 400,
        body: {
          error: replaced.code,
          message: replaced.message,
        },
      };
    }

    return { status: 500, body: { error: "internal_error" } };
  }

  return {
    status: 200,
    body: {
      topicKeys: replaced.result.topic_keys,
      topicCount: replaced.result.topic_count,
    },
  };
}

export { setPlaylistTopics };
