import type { PlaylistQueueEntry } from "@/lib/playlists/player-queue-types";

export type PlaylistItemIdentity = {
  practiceId: string;
  audioItemId?: string | null;
};

export function playlistItemKey(
  practiceId: string,
  audioItemId?: string | null,
): string {
  return audioItemId ? `${practiceId}:${audioItemId}` : practiceId;
}

export function playlistItemQuery(
  audioItemId?: string | null,
): string {
  return audioItemId
    ? `?audioItemId=${encodeURIComponent(audioItemId)}`
    : "";
}

export function matchesPlaylistQueueEntry(
  entry: PlaylistQueueEntry,
  item: PlaylistItemIdentity,
): boolean {
  if (entry.practiceId !== item.practiceId) {
    return false;
  }

  if (entry.kind === "audio_item") {
    return entry.audioItemId === item.audioItemId;
  }

  return !item.audioItemId;
}

export function queueEntryIdentityKey(entry: PlaylistQueueEntry): string {
  return playlistItemKey(
    entry.practiceId,
    entry.kind === "audio_item" ? entry.audioItemId : null,
  );
}
