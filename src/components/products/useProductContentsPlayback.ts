"use client";

import { useCallback, useRef, useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { fetchListenSessionPayload } from "@/lib/playlists/fetch-listen-session";
import { resolveProductPlaybackClickAction } from "@/lib/products/product-playback-click";

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

  const isActiveProduct =
    !!session &&
    session.sourceType !== "private_audio" &&
    session.authorSlug === authorSlug &&
    session.productSlug === productSlug;

  const activeTrackId = isActiveProduct
    ? (engine?.currentTrack?.id ?? null)
    : null;
  const isPlaying = Boolean(isActiveProduct && engine?.isPlaying);

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
          !!session &&
          session.sourceType !== "private_audio" &&
          session.authorSlug === authorSlug &&
          session.productSlug === productSlug;

        const trackIndex =
          isSameProduct && session
            ? session.tracks.findIndex((track) => track.id === trackId)
            : -1;

        const action = resolveProductPlaybackClickAction({
          enabled,
          isSameProduct: Boolean(isSameProduct && engine),
          trackIndex,
          currentTrackId: engine?.currentTrack?.id ?? null,
          clickedTrackId: trackId,
        });

        if (action.type === "toggle_pause_resume" && engine) {
          clearPlaylistQueue();
          await engine.handlePlayPause();
          return;
        }

        if (action.type === "play_at_index" && engine) {
          clearPlaylistQueue();
          await engine.handlePlayTrackAtIndex(action.index);
          return;
        }

        if (action.type === "noop") {
          return;
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

  return {
    playTrack,
    loadingTrackId,
    errorMessage,
    clearErrorMessage: () => setErrorMessage(null),
    activeTrackId,
    isPlaying,
    enabled,
  };
}
