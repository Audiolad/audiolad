"use client";

import { useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import PlaylistItemRow from "@/components/playlists/PlaylistItemRow";
import { buildPublicPlaylistQueue } from "@/lib/playlists/build-playlist-queue";
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
      isThisPlaylistQueue && currentQueueEntry?.practiceId === item.practiceId;

    if (isCurrent && engine) {
      await engine.handlePlayPause();
      return;
    }

    setRowLoadingId(item.practiceId);
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

    const startIndex = built.queue.entries.findIndex(
      (entry) => entry.practiceId === item.practiceId,
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
      className="mt-5 space-y-1.5 pb-[calc(var(--global-mini-player-height,0px)+5.5rem)]"
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
          currentQueueEntry?.practiceId === item.practiceId;
        const isPlayingThis = Boolean(isCurrent && engine?.isPlaying);

        return (
          <PlaylistItemRow
            key={item.practiceId}
            index={index}
            item={{
              practiceId: item.practiceId,
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
              loading: rowLoadingId === item.practiceId,
              disabled: !playable,
              onPlayPause: () => void playFromItem(item),
            }}
          />
        );
      })}
    </section>
  );
}
