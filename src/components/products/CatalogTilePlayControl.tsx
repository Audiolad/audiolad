"use client";

import { useCallback, useRef, useState, type MouseEvent } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { PauseIcon, PlayIcon } from "@/components/audio/listen-player-shared";
import { fetchListenSessionPayload } from "@/lib/playlists/fetch-listen-session";
import {
  releaseCatalogTilePlayPointerFocus,
  shouldBlurCatalogTilePlayAfterPointerClick,
} from "@/lib/products/catalog-tile-carousel";
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

      // Blur before any loading/disabled render. A focused Play (or focus
      // dumped onto the tabIndex=0 scroller when the button disables)
      // makes the first post-Play pan a no-op — scrollLeft never starts.
      if (shouldBlurCatalogTilePlayAfterPointerClick(event.detail)) {
        releaseCatalogTilePlayPointerFocus(event.currentTarget);
      }

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
      className="relative shrink-0 px-1.5 pb-1 pt-0.5"
      data-catalog-tile-play-layer=""
    >
      <button
        type="button"
        data-catalog-tile-play=""
        aria-label={label}
        aria-busy={loading || undefined}
        onClick={handlePlayClick}
        className={`inline-flex h-9 w-full items-center justify-center gap-1 rounded-[14px] bg-[#7042c5] px-2 text-[12px] font-semibold leading-4 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5]${
          loading ? " cursor-not-allowed opacity-70" : ""
        }`}
      >
        {isPlaying ? (
          <PauseIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <PlayIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span>{isPlaying ? "Пауза" : "Слушать"}</span>
      </button>
      {errorMessage ? (
        <p
          className="absolute inset-x-1.5 bottom-full line-clamp-1 text-[10px] leading-3 text-[#b34f63]"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
