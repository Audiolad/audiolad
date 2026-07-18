"use client";

import { useCallback, useRef, useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { fetchListenSessionPayload } from "@/lib/playlists/fetch-listen-session";

type UseProductContentsPlaybackOptions = {
  authorSlug: string;
  productSlug: string;
  enabled: boolean;
};

function buildPlaybackErrorMessage(reason: string): string {
  if (reason === "unavailable" || reason === "forbidden") {
    return "Для прослушивания нужен доступ к продукту.";
  }

  if (reason === "no_audio") {
    return "Аудиоматериал пока недоступен.";
  }

  return "Не удалось запустить прослушивание. Попробуйте ещё раз.";
}

export function useProductContentsPlayback({
  authorSlug,
  productSlug,
  enabled,
}: UseProductContentsPlaybackOptions) {
  const { session, loadSession, clearPlaylistQueue } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const requestLockRef = useRef(false);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const playTrack = useCallback(
    async (trackId: string) => {
      if (!enabled || requestLockRef.current) {
        return;
      }

      requestLockRef.current = true;
      setLoadingTrackId(trackId);
      setErrorMessage(null);

      try {
        const isSameProduct =
          session?.authorSlug === authorSlug &&
          session?.productSlug === productSlug;

        if (isSameProduct && engine && session) {
          clearPlaylistQueue();
          const trackIndex = session.tracks.findIndex(
            (track) => track.id === trackId,
          );

          if (trackIndex >= 0) {
            await engine.handlePlayTrackAtIndex(trackIndex);
            return;
          }
        }

        const loaded = await fetchListenSessionPayload(authorSlug, productSlug);

        if (!loaded.ok) {
          setErrorMessage(buildPlaybackErrorMessage(loaded.reason));
          return;
        }

        clearPlaylistQueue();
        loadSession({
          ...loaded.session,
          initialTrackId: trackId,
          requestAutoplay: true,
          suppressListenUrlSync: true,
        });
      } finally {
        requestLockRef.current = false;
        setLoadingTrackId(null);
      }
    },
    [
      authorSlug,
      clearPlaylistQueue,
      enabled,
      engine,
      loadSession,
      productSlug,
      session,
    ],
  );

  const isActiveProduct =
    session?.authorSlug === authorSlug && session?.productSlug === productSlug;

  return {
    playTrack,
    loadingTrackId,
    errorMessage,
    clearErrorMessage: () => setErrorMessage(null),
    activeTrackId: isActiveProduct ? (engine?.currentTrack?.id ?? null) : null,
    enabled,
  };
}
