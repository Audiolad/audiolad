"use client";

import type { MouseEvent } from "react";

import { usePlaylistCatalogSave } from "@/lib/playlists/use-playlist-catalog-save";

type PlaylistSaveButtonProps = {
  playlistId: string;
  saved: boolean;
  isAuthenticated: boolean;
  signInReturnPath: string;
  onViewerSavedChange?: (saved: boolean) => void;
};

export default function PlaylistSaveButton({
  playlistId,
  saved,
  isAuthenticated,
  signInReturnPath,
  onViewerSavedChange,
}: PlaylistSaveButtonProps) {
  const { isSaved, isPending, errorMessage, handleClick } = usePlaylistCatalogSave({
    playlistId,
    saved,
    isAuthenticated,
    signInReturnPath,
    onViewerSavedChange,
  });

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    handleClick();
  }

  return (
    <>
      <button
        type="button"
        data-playlist-catalog-heart-button
        data-playlist-catalog-heart-saved={isSaved ? "true" : "false"}
        aria-label={isSaved ? "Убрать" : "Сохранить"}
        aria-pressed={isSaved}
        aria-busy={isPending}
        onClick={onClick}
        className={`absolute top-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[18px] leading-none shadow-[0_4px_12px_rgba(36,19,63,0.28)] before:absolute before:-inset-1 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
          isSaved ? "text-[#7042c5]" : "text-[#4b2f86]"
        }`}
      >
        <span aria-hidden="true">{isSaved ? "♥" : "♡"}</span>
      </button>
      {errorMessage ? (
        <span className="sr-only" role="status" aria-live="polite">
          {errorMessage}
        </span>
      ) : null}
    </>
  );
}
