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
      className="mt-5 min-w-0 space-y-3
        [&_.playlist-item-row]:relative [&_.playlist-item-row]:max-h-none [&_.playlist-item-row]:min-h-[88px] [&_.playlist-item-row]:gap-3 [&_.playlist-item-row]:rounded-[18px] [&_.playlist-item-row]:p-3 [&_.playlist-item-row]:shadow-[0_6px_16px_rgba(91,62,145,0.05)]
        [&_.playlist-item-row>button]:z-10 [&_.playlist-item-row>button]:h-16 [&_.playlist-item-row>button]:w-16
        [&_.playlist-item-row>div>a]:break-words [&_.playlist-item-row>div>a]:[overflow-wrap:anywhere] [&_.playlist-item-row>div>a:not([aria-label])]:line-clamp-none [&_.playlist-item-row>div>a[aria-label]]:whitespace-normal
        [&_.playlist-item-row>div>a:not([aria-label])]:after:absolute [&_.playlist-item-row>div>a:not([aria-label])]:after:inset-0 [&_.playlist-item-row>div>a:not([aria-label])]:after:rounded-[18px] [&_.playlist-item-row>div>a:not([aria-label])]:after:content-['']
        [&_.playlist-item-row>div>a[aria-label]]:relative [&_.playlist-item-row>div>a[aria-label]]:z-10 [&_.playlist-item-row>div>a[aria-label]]:block [&_.playlist-item-row>div>a[aria-label]]:w-fit [&_.playlist-item-row>div>a[aria-label]]:min-w-11 [&_.playlist-item-row>div>a[aria-label]]:max-w-full [&_.playlist-item-row>div>a[aria-label]]:overflow-visible [&_.playlist-item-row>div>a[aria-label]]:after:absolute [&_.playlist-item-row>div>a[aria-label]]:after:inset-x-0 [&_.playlist-item-row>div>a[aria-label]]:after:-top-0.5 [&_.playlist-item-row>div>a[aria-label]]:after:-bottom-3 sm:[&_.playlist-item-row>div>a[aria-label]]:after:top-0 sm:[&_.playlist-item-row>div>a[aria-label]]:after:bottom-0 [&_.playlist-item-row>div>a[aria-label]]:after:content-['']
        [&_.playlist-item-row>div>p.uppercase]:text-[#7d70a2] [&_.playlist-item-row>span]:text-[#7d70a2]"
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
