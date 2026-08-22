"use client";

import { useCallback, useRef, useState, type MouseEvent } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { PauseIcon, PlayIcon } from "@/components/audio/listen-player-shared";
import { fetchListenSessionPayload } from "@/lib/playlists/fetch-listen-session";
import {
  buildCatalogTilePlaybackErrorMessage,
  isSameCatalogTileSession,
  runCatalogTilePlayClick,
} from "@/lib/products/catalog-tile-playback";

type CatalogTilePlayControlProps = {
  authorSlug: string;
  productSlug: string;
  title: string;
};

export default function CatalogTilePlayControl({
  authorSlug,
  productSlug,
  title,
}: CatalogTilePlayControlProps) {
  const {
    session,
    loadSession,
    clearPlaylistQueue,
    prepareSharedAudioGesture,
  } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const inflightRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSameProduct = isSameCatalogTileSession(
    session,
    authorSlug,
    productSlug,
  );
  const isPlaying = Boolean(isSameProduct && engine?.isPlaying);
  const canTogglePlayback =
    isSameProduct && typeof engine?.handlePlayPause === "function";

  const handlePlayClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (inflightRef.current) {
        return;
      }

      inflightRef.current = true;
      setLoading(true);
      setErrorMessage(null);

      void runCatalogTilePlayClick(
        {
          authorSlug,
          productSlug,
          isLoading: false,
          isSameCatalogProduct: isSameProduct,
          canTogglePlayback,
        },
        {
          fetchSession: fetchListenSessionPayload,
          loadSession,
          prepareSharedAudioGesture,
          handlePlayPause: engine?.handlePlayPause,
          clearPlaylistQueue,
        },
      )
        .then((result) => {
          if (result.status === "error") {
            setErrorMessage(result.errorMessage);
          }
        })
        .catch(() => {
          setErrorMessage(buildCatalogTilePlaybackErrorMessage("error"));
        })
        .finally(() => {
          inflightRef.current = false;
          setLoading(false);
        });
    },
    [
      authorSlug,
      canTogglePlayback,
      clearPlaylistQueue,
      engine?.handlePlayPause,
      isSameProduct,
      loadSession,
      prepareSharedAudioGesture,
      productSlug,
    ],
  );

  const label = loading
    ? `Загрузка «${title}»`
    : isPlaying
      ? `Пауза «${title}»`
      : `Слушать ${title}`;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 aspect-[4/5]"
      data-catalog-tile-play-layer=""
    >
      <button
        type="button"
        data-catalog-tile-play=""
        aria-label={label}
        aria-busy={loading || undefined}
        disabled={loading}
        onClick={handlePlayClick}
        className="pointer-events-auto absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#7042c5] text-white shadow-[0_8px_20px_rgba(96,59,168,0.28)] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        {isPlaying ? (
          <PauseIcon className="h-5 w-5" />
        ) : (
          <PlayIcon className="h-5 w-5" />
        )}
      </button>
      {errorMessage ? (
        <p
          className="pointer-events-none absolute inset-x-2 bottom-[3.25rem] line-clamp-2 rounded-[10px] bg-white/90 px-1.5 py-1 text-[11px] leading-4 text-[#b34f63]"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
