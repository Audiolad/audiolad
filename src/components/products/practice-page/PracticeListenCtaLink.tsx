"use client";

import { useCallback, useState, type MouseEvent, type ReactNode } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { fetchCatalogPlaySession } from "@/lib/catalog/fetch-catalog-play-session";
import { shouldToggleActiveCatalogPlay } from "@/lib/catalog/should-toggle-active-catalog-play";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import { PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

type PracticeListenCtaLinkProps = {
  authorSlug: string;
  productSlug: string;
  practiceId: string;
  className: string;
  playAriaLabel?: string;
  children: ReactNode;
  playingChildren: ReactNode;
};

/**
 * Product primary Play: stay on /practice and load GlobalAudioPlayer.
 * Catalog session chooses preview (paid, no access) or full (entitled / free).
 */
export default function PracticeListenCtaLink({
  authorSlug,
  productSlug,
  practiceId,
  className,
  playAriaLabel = PLAY_ACTION_LABEL,
  children,
  playingChildren,
}: PracticeListenCtaLinkProps) {
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

      if (
        engine &&
        shouldToggleActiveCatalogPlay({
          sessionMatchesProduct: isActive,
          hasEngine: true,
          isPlaying: Boolean(engine.isPlaying),
          forceStartAtBeginning: Boolean(
            session &&
              isCatalogGlobalPlayerSession(session) &&
              session.forceStartAtBeginning,
          ),
        })
      ) {
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
          entrySurface: "product",
          requestAutoplay: true,
          suppressListenUrlSync: true,
          forceStartAtBeginning: true,
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
      session,
    ],
  );

  return (
    <button
      type="button"
      data-practice-primary-play
      data-practice-primary-play-active={isPlaying ? "true" : "false"}
      aria-label={isPlaying ? "Пауза" : playAriaLabel}
      aria-pressed={isPlaying}
      aria-busy={isStarting}
      disabled={!authorSlug || !productSlug || isStarting}
      className={className}
      onClick={(event) => {
        void handleClick(event);
      }}
    >
      {isPlaying ? playingChildren : children}
    </button>
  );
}
