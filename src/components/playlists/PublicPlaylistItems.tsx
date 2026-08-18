"use client";

import { useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import PlaylistItemRow from "@/components/playlists/PlaylistItemRow";
import { buildPublicPlaylistQueue } from "@/lib/playlists/build-playlist-queue";
import {
  matchesPlaylistQueueEntry,
  playlistItemKey,
} from "@/lib/playlists/playlist-item-identity";
import type { PublicPlaylistItemView } from "@/lib/playlists/public-detail";
import { isPlayablePublicPlaylistItem } from "@/lib/playlists/public-seo";

type PublicPlaylistItemsProps = {
  playlistSlug: string;
  title: string;
  items: PublicPlaylistItemView[];
};

export default function PublicPlaylistItems({
  playlistSlug,
  title,
  items,
}: PublicPlaylistItemsProps) {
  const { loadPlaylistQueue, currentQueueEntry, activeQueue } =
    useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowLoadingId, setRowLoadingId] = useState<string | null>(null);

  const isThisPlaylistQueue =
    activeQueue?.source.kind === "public_playlist" &&
    activeQueue.source.playlistSlug === playlistSlug;

  async function playFromItem(item: PublicPlaylistItemView) {
    if (rowLoadingId) {
      return;
    }

    const isCurrent =
      isThisPlaylistQueue &&
      currentQueueEntry != null &&
      matchesPlaylistQueueEntry(currentQueueEntry, item);

    if (isCurrent && engine) {
      await engine.handlePlayPause();
      return;
    }

    const rowId = playlistItemKey(item.practiceId, item.audioItemId);
    setRowLoadingId(rowId);
    setRowError(null);

    const built = buildPublicPlaylistQueue({
      playlistSlug,
      title,
      items,
    });

    if (!built.ok) {
      setRowError("Не удалось запустить плейлист. Попробуйте ещё раз.");
      setRowLoadingId(null);
      return;
    }

    const startIndex = built.queue.entries.findIndex((entry) =>
      matchesPlaylistQueueEntry(entry, item),
    );

    const result = await loadPlaylistQueue({
      ...built.queue,
      currentIndex: startIndex >= 0 ? startIndex : 0,
    });

    if (!result.ok) {
      setRowError(result.error);
    }

    setRowLoadingId(null);
  }

  return (
    <section
      className="mt-5 space-y-1.5"
      data-public-playlist-items
    >
      {rowError ? (
        <p className="rounded-[18px] border border-[#f0d0d8] bg-[#fff8f9] px-4 py-3 text-sm text-[#b34f63]" role="alert">
          {rowError}
        </p>
      ) : null}

      {items.map((item, index) => {
        const listenHref =
          item.href && item.href.startsWith("/listen/") ? item.href : null;
        const playable = isPlayablePublicPlaylistItem(item);
        const isCurrent =
          isThisPlaylistQueue &&
          currentQueueEntry != null &&
          matchesPlaylistQueueEntry(currentQueueEntry, item);
        const isPlayingThis = Boolean(isCurrent && engine?.isPlaying);
        const rowId = playlistItemKey(item.practiceId, item.audioItemId);

        return (
          <PlaylistItemRow
            key={rowId}
            index={index}
            item={{
              practiceId: item.practiceId,
              audioItemId: item.audioItemId,
              title: item.title,
              authorName: item.authorName,
              authorSlug: item.authorSlug,
              coverUrl: item.coverUrl,
              coverImage: item.coverImage,
              updatedAt: item.updatedAt,
              formatLabel: item.formatLabel,
              metaLabel: item.metaLabel,
              available: item.available,
              href: item.href,
              listenHref,
            }}
            coverPlayback={{
              isPlaying: isPlayingThis,
              loading: rowLoadingId === rowId,
              disabled: !playable,
              onPlayPause: () => void playFromItem(item),
            }}
          />
        );
      })}
    </section>
  );
}
