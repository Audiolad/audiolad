"use client";

import type { MouseEvent } from "react";

import { usePlaylistCatalogPlayback } from "@/lib/playlists/use-playlist-catalog-playback";
import { PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

type PlaylistPlayButtonProps = {
  slug: string;
  title: string;
};

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

export default function PlaylistPlayButton({ slug, title }: PlaylistPlayButtonProps) {
  const { state, busy, error, onPress } = usePlaylistCatalogPlayback({
    slug,
    title,
  });
  const isPlaying = state === "playing";

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onPress();
  }

  return (
    <>
      <button
        type="button"
        data-playlist-catalog-play-button
        data-playlist-catalog-play-state={state}
        aria-label={isPlaying ? "Пауза" : PLAY_ACTION_LABEL}
        aria-busy={busy}
        disabled={busy}
        onClick={handleClick}
        className={`absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full shadow-[0_4px_12px_rgba(36,19,63,0.28)] before:absolute before:-inset-1 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-70 ${
          isPlaying
            ? "bg-[#7042c5] text-white"
            : "bg-white/95 text-[#4b2f86]"
        }`}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      {error ? (
        <span className="sr-only" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
