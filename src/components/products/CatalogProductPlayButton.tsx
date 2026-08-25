"use client";

import { useCallback, useState, type MouseEvent } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { fetchCatalogPlaySession } from "@/lib/catalog/fetch-catalog-play-session";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import type { CatalogCardActionTarget } from "@/lib/catalog/dto";
import { parsePracticePublicPath } from "@/lib/products/paths";
import { PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M7 5.5h3.5v13H7V5.5Zm6.5 0H17v13h-3.5V5.5Z" />
    </svg>
  );
}

type CatalogProductPlayButtonProps = {
  product: CatalogCardActionTarget;
};

export default function CatalogProductPlayButton({
  product,
}: CatalogProductPlayButtonProps) {
  const { session, loadSession, prepareSharedAudioGesture, clearPlaylistQueue } =
    useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const [isStarting, setIsStarting] = useState(false);
  const identity = parsePracticePublicPath(product.href);

  const isActive = Boolean(
    session &&
      isCatalogGlobalPlayerSession(session) &&
      (session.practiceId === product.id ||
        (identity &&
          session.authorSlug === identity.authorSlug &&
          session.productSlug === identity.productSlug)),
  );
  const isPlaying = Boolean(isActive && engine?.isPlaying);

  const handleClick = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!identity) {
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
        const loaded = await fetchCatalogPlaySession(
          identity.authorSlug,
          identity.productSlug,
        );

        if (!loaded.ok) {
          return;
        }

        clearPlaylistQueue();
        loadSession({
          ...loaded.session,
          sourceType: "catalog",
          entrySurface: "catalog",
          requestAutoplay: true,
          suppressListenUrlSync: true,
          forceStartAtBeginning: true,
        });
      } finally {
        setIsStarting(false);
      }
    },
    [
      clearPlaylistQueue,
      engine,
      identity,
      isActive,
      isStarting,
      loadSession,
      prepareSharedAudioGesture,
    ],
  );

  return (
    <button
      type="button"
      data-catalog-play-button
      data-catalog-play-active={isPlaying ? "true" : "false"}
      aria-label={isPlaying ? "Пауза" : PLAY_ACTION_LABEL}
      disabled={!identity || isStarting}
      onClick={(event) => {
        void handleClick(event);
      }}
      className={`absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full shadow-[0_4px_12px_rgba(36,19,63,0.28)] before:absolute before:-inset-1 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-70 ${
        isPlaying
          ? "bg-[#7042c5] text-white"
          : "bg-white/95 text-[#4b2f86]"
      }`}
    >
      {isPlaying ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}
