"use client";

import { useCallback, useState, type MouseEvent, type ReactNode } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { fetchCatalogPlaySession } from "@/lib/catalog/fetch-catalog-play-session";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import { PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

type HomeProductPlayButtonProps = {
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  className: string;
  children: ReactNode;
  ariaLabel?: string;
};

/**
 * Home Play: stay on / and load GlobalAudioPlayer.
 * Preview/full come from /api/catalog/play — not implemented here.
 */
export default function HomeProductPlayButton({
  practiceId,
  authorSlug,
  productSlug,
  className,
  children,
  ariaLabel,
}: HomeProductPlayButtonProps) {
  const { session, loadSession, prepareSharedAudioGesture, clearPlaylistQueue } =
    useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const [isStarting, setIsStarting] = useState(false);

  const isActive = Boolean(
    session &&
      isCatalogGlobalPlayerSession(session) &&
      (session.practiceId === practiceId ||
        (session.authorSlug === authorSlug &&
          session.productSlug === productSlug)),
  );
  const isPlaying = Boolean(isActive && engine?.isPlaying);

  const handleClick = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!authorSlug || !productSlug) {
        return;
      }

      prepareSharedAudioGesture();

      if (isActive && engine) {
        clearPlaylistQueue();
        await engine.handlePlayPause();
        return;
      }

      if (isStarting) {
        return;
      }

      setIsStarting(true);

      try {
        const loaded = await fetchCatalogPlaySession(authorSlug, productSlug);

        if (!loaded.ok) {
          return;
        }

        clearPlaylistQueue();
        loadSession({
          ...loaded.session,
          sourceType: "catalog",
          entrySurface: "home",
          requestAutoplay: true,
          suppressListenUrlSync: true,
        });
      } finally {
        setIsStarting(false);
      }
    },
    [
      authorSlug,
      clearPlaylistQueue,
      engine,
      isActive,
      isStarting,
      loadSession,
      prepareSharedAudioGesture,
      productSlug,
    ],
  );

  return (
    <button
      type="button"
      data-home-product-play
      data-home-product-play-active={isPlaying ? "true" : "false"}
      aria-label={ariaLabel ?? (isPlaying ? "Пауза" : PLAY_ACTION_LABEL)}
      aria-busy={isStarting}
      disabled={!authorSlug || !productSlug || isStarting}
      className={className}
      onClick={(event) => {
        void handleClick(event);
      }}
    >
      {children}
    </button>
  );
}
