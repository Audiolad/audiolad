"use client";

import { useCallback, useState, type MouseEvent } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { fetchCatalogPlaySession } from "@/lib/catalog/fetch-catalog-play-session";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
      <path d="M7 5.5h3.5v13H7V5.5Zm6.5 0H17v13h-3.5V5.5Z" />
    </svg>
  );
}

export type LibraryCardPlayVariant = "full" | "preview";

type LibraryCardPlayButtonProps = {
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  title: string;
  label?: string;
  variant?: LibraryCardPlayVariant;
};

const focusRingClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

/**
 * Audioteka Play: stay on /my-practices and load GlobalAudioPlayer.
 * Preview/full come from /api/catalog/play — not implemented here.
 */
export default function LibraryCardPlayButton({
  practiceId,
  authorSlug,
  productSlug,
  title,
  label = "Слушать",
  variant = "preview",
}: LibraryCardPlayButtonProps) {
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
          entrySurface: "library",
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
    ],
  );

  return (
    <button
      type="button"
      data-library-preview-play={variant === "preview" ? "" : undefined}
      data-library-full-play={variant === "full" ? "" : undefined}
      aria-label={isPlaying ? `Пауза «${title}»` : `${label} «${title}»`}
      aria-busy={isStarting}
      disabled={!authorSlug || !productSlug || isStarting}
      onClick={(event) => {
        void handleClick(event);
      }}
      className={`flex items-center gap-2 font-medium text-[#7042c5] ${focusRingClass} disabled:opacity-70`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white">
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </span>
      {label}
    </button>
  );
}
