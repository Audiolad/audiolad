"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { fetchListenSessionPayload } from "@/lib/playlists/fetch-listen-session";
import type { LoadSessionInput } from "@/lib/listen/global-player-types";
import { resolveProductPlaybackClickAction } from "@/lib/products/product-playback-click";
import { GESTURE_HINT_PLAY_MARKER } from "@/lib/ui/action-labels";

type UseProductContentsPlaybackOptions = {
  authorSlug: string;
  productSlug: string;
  enabled: boolean;
};

const GESTURE_HINT_MARKERS = [
  GESTURE_HINT_PLAY_MARKER,
  "Нажмите Play",
  "Нажмите ещё раз",
] as const;

function buildPlaybackErrorMessage(reason: string): string {
  if (reason === "unavailable" || reason === "forbidden") {
    return "Для прослушивания нужен доступ к продукту.";
  }

  if (reason === "no_audio") {
    return "Аудиоматериал пока недоступен.";
  }

  return "Не удалось запустить прослушивание. Попробуйте ещё раз.";
}

export function isProductAutoplayBlockedHint(
  message: string | null | undefined,
): boolean {
  if (!message) {
    return false;
  }

  return GESTURE_HINT_MARKERS.some((marker) => message.includes(marker));
}

function sessionCacheKey(authorSlug: string, productSlug: string): string {
  return `${authorSlug.trim()}::${productSlug.trim()}`;
}

export function useProductContentsPlayback({
  authorSlug,
  productSlug,
  enabled,
}: UseProductContentsPlaybackOptions) {
  const { session, loadSession, clearPlaylistQueue } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const requestLockRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const sessionCacheRef = useRef<Map<string, LoadSessionInput>>(new Map());
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [intentTrackId, setIntentTrackId] = useState<string | null>(null);
  const [forceGestureTrackId, setForceGestureTrackId] = useState<string | null>(
    null,
  );

  const isActiveProduct =
    !!session &&
    session.sourceType !== "private_audio" &&
    session.authorSlug === authorSlug &&
    session.productSlug === productSlug;

  const activeTrackId = isActiveProduct
    ? (engine?.currentTrack?.id ?? null)
    : null;
  const isPlaying = Boolean(isActiveProduct && engine?.isPlaying);
  const engineStatusMessage = engine?.statusMessage ?? null;
  const engineIsLoading = Boolean(engine?.isLoading);
  const engineHasSrc = Boolean(engine?.src);

  const needsGesturePlay = Boolean(
    enabled &&
      isActiveProduct &&
      intentTrackId &&
      activeTrackId === intentTrackId &&
      !isPlaying &&
      (isProductAutoplayBlockedHint(engineStatusMessage) ||
        forceGestureTrackId === intentTrackId),
  );

  // Prefetch listen session so the first tap can avoid a cold network round-trip
  // before loadSession (helps keep the mobile play intent warm).
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    const key = sessionCacheKey(authorSlug, productSlug);

    async function prefetch() {
      if (sessionCacheRef.current.has(key)) {
        return;
      }

      const loaded = await fetchListenSessionPayload(authorSlug, productSlug);

      if (cancelled || !loaded.ok) {
        return;
      }

      sessionCacheRef.current.set(key, loaded.session);
    }

    void prefetch();

    return () => {
      cancelled = true;
    };
  }, [authorSlug, enabled, productSlug]);

  useEffect(() => {
    if (!intentTrackId || !isActiveProduct || !activeTrackId) {
      return;
    }

    if (activeTrackId !== intentTrackId) {
      return;
    }

    if (isPlaying || engineIsLoading || !engineHasSrc) {
      return;
    }

    if (isProductAutoplayBlockedHint(engineStatusMessage)) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setForceGestureTrackId(intentTrackId);
    }, 900);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    activeTrackId,
    engineHasSrc,
    engineIsLoading,
    engineStatusMessage,
    intentTrackId,
    isActiveProduct,
    isPlaying,
  ]);

  const playTrack = useCallback(
    async (trackId: string) => {
      if (!enabled || requestLockRef.current) {
        return;
      }

      const requestGeneration = requestGenerationRef.current + 1;
      requestGenerationRef.current = requestGeneration;
      requestLockRef.current = true;
      setLoadingTrackId(trackId);
      setErrorMessage(null);
      setIntentTrackId(trackId);
      setForceGestureTrackId(null);

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

          const audio = engine.audioRef.current;
          if (audio && !audio.paused) {
            setForceGestureTrackId(null);
          } else if (engine.src) {
            setForceGestureTrackId(trackId);
          }
          return;
        }

        if (action.type === "play_at_index" && engine) {
          clearPlaylistQueue();
          await engine.handlePlayTrackAtIndex(action.index);

          const audio = engine.audioRef.current;
          if (audio && !audio.paused) {
            setForceGestureTrackId(null);
          } else if (engine.src) {
            setForceGestureTrackId(trackId);
          }
          return;
        }

        if (action.type === "noop") {
          return;
        }

        const cacheKey = sessionCacheKey(authorSlug, productSlug);
        let loadedSession = sessionCacheRef.current.get(cacheKey) ?? null;

        if (!loadedSession) {
          const loaded = await fetchListenSessionPayload(authorSlug, productSlug);

          if (requestGeneration !== requestGenerationRef.current) {
            return;
          }

          if (!loaded.ok) {
            setErrorMessage(buildPlaybackErrorMessage(loaded.reason));
            setIntentTrackId(null);
            return;
          }

          loadedSession = loaded.session;
          sessionCacheRef.current.set(cacheKey, loadedSession);
        }

        if (requestGeneration !== requestGenerationRef.current) {
          return;
        }

        clearPlaylistQueue();
        loadSession({
          ...loadedSession,
          initialTrackId: trackId,
          requestAutoplay: true,
          suppressListenUrlSync: true,
        });
      } finally {
        if (requestGeneration === requestGenerationRef.current) {
          requestLockRef.current = false;
          setLoadingTrackId(null);
        }
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
    needsGesturePlay,
    enabled,
  };
}
