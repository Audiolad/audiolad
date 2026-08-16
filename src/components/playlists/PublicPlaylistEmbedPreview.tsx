"use client";

import Link from "next/link";
import { useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import AuthorLink from "@/components/authors/AuthorLink";
import PlayAllButton from "@/components/playlists/PlayAllButton";
import { buildPublicPlaylistQueue } from "@/lib/playlists/build-playlist-queue";
import type { PlaylistQueueNavigationPolicy } from "@/lib/playlists/player-queue-types";
import type {
  PublicPlaylistItemView,
  PublicPlaylistView,
} from "@/lib/playlists/public-detail";
import { isPlayablePublicPlaylistItem } from "@/lib/playlists/public-seo";
import { buildPublicPlaylistPath } from "@/lib/playlists/public-url";
import {
  formatListenPreviewExpandLabel,
  getListenPreviewExpandCount,
  getListenPreviewItems,
} from "@/lib/seo/listens/preview";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M7 5.5h3.5v13H7V5.5Zm6.5 0H17v13h-3.5V5.5Z" />
    </svg>
  );
}

type PublicPlaylistEmbedPreviewProps = {
  playlist: PublicPlaylistView;
  sourcePath: string;
  navigationPolicy: PlaylistQueueNavigationPolicy;
};

export default function PublicPlaylistEmbedPreview({
  playlist,
  sourcePath,
  navigationPolicy,
}: PublicPlaylistEmbedPreviewProps) {
  const previewItems = getListenPreviewItems(playlist.items);
  const expandCount = getListenPreviewExpandCount(previewItems.length);
  const [expanded, setExpanded] = useState(false);
  const { loadPlaylistQueue, currentQueueEntry } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowLoadingId, setRowLoadingId] = useState<string | null>(null);

  async function playFromItem(item: PublicPlaylistItemView) {
    if (rowLoadingId) {
      return;
    }

    const isCurrent = currentQueueEntry?.practiceId === item.practiceId;

    if (isCurrent && engine) {
      await engine.handlePlayPause();
      return;
    }

    setRowLoadingId(item.practiceId);
    setRowError(null);

    const built = buildPublicPlaylistQueue({
      playlistSlug: playlist.playlist.slug,
      title: playlist.playlist.title,
      items: playlist.items,
      returnHref: sourcePath,
      navigationPolicy,
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
    <div data-public-playlist-embed-preview>
      <PlayAllButton
        variant="public"
        playlistSlug={playlist.playlist.slug}
        title={playlist.playlist.title}
        items={playlist.items}
        returnHref={sourcePath}
        navigationPolicy={navigationPolicy}
      />

      {rowError ? (
        <p className="mt-2 text-sm text-[#b34f63]" role="alert">
          {rowError}
        </p>
      ) : null}

      <ol
        className="mt-4 space-y-1.5"
        data-preview-collapsed={expanded ? "false" : "true"}
      >
        {previewItems.map((item, index) => {
          const playable = isPlayablePublicPlaylistItem(item);
          const isCurrent = currentQueueEntry?.practiceId === item.practiceId;
          const isPlayingThis = Boolean(isCurrent && engine?.isPlaying);
          const isExtra = index >= 5;
          const titleHref = item.productHref;
          const extraHiddenClass =
            isExtra && !expanded
              ? "max-[390px]:hidden"
              : "";

          return (
            <li
              key={`${item.practiceId}:${item.position}`}
              value={item.position}
              data-listen-preview-item
              data-preview-extra={isExtra ? "true" : "false"}
              data-position={item.position}
              className={extraHiddenClass}
            >
              <article className="flex min-h-[76px] min-w-0 items-center gap-2 rounded-[16px] border border-[#eadff8] bg-white px-2 py-1.5 sm:gap-3 sm:px-3">
                <span
                  className="hidden w-5 shrink-0 text-center text-[11px] font-medium text-[#8f82ad] sm:block"
                  aria-hidden
                >
                  {index + 1}
                </span>

                {playable ? (
                  <button
                    type="button"
                    disabled={rowLoadingId === item.practiceId}
                    onClick={() => void playFromItem(item)}
                    aria-label={
                      isPlayingThis
                        ? `Пауза: ${item.title}`
                        : `Слушать ${item.title}`
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                  >
                    {isPlayingThis ? <PauseIcon /> : <PlayIcon />}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-label={`Слушать ${item.title} — недоступно`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white opacity-40"
                  >
                    <PlayIcon />
                  </button>
                )}

                <div className="min-w-0 flex-1 py-0.5">
                  {titleHref ? (
                    <Link
                      href={titleHref}
                      className="line-clamp-2 text-[14px] font-semibold leading-[1.25] text-[#25135c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <p className="line-clamp-2 text-[14px] font-semibold leading-[1.25] text-[#25135c]">
                      {item.title}
                    </p>
                  )}
                  {item.authorName ? (
                    <AuthorLink
                      authorSlug={item.authorSlug}
                      authorName={item.authorName}
                      className="mt-0.5 block truncate text-[12px] leading-4 text-[#5c4f82]"
                    />
                  ) : null}
                  {item.durationLabel ? (
                    <p className="mt-0.5 truncate text-[11px] leading-4 text-[#7d70a2]">
                      {item.durationLabel}
                    </p>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      {expandCount > 0 && !expanded ? (
        <button
          type="button"
          className="mt-3 hidden min-h-11 w-full rounded-full border border-[#d9c9f3] bg-white px-4 text-sm font-medium text-[#7042c5] max-[390px]:inline-flex max-[390px]:items-center max-[390px]:justify-center"
          onClick={() => setExpanded(true)}
        >
          {formatListenPreviewExpandLabel(expandCount)}
        </button>
      ) : null}

      <p className="mt-4">
        <Link
          href={buildPublicPlaylistPath(playlist.playlist.slug)}
          className="inline-flex min-h-11 items-center font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Открыть весь плейлист
        </Link>
      </p>
    </div>
  );
}
