"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { fetchListenSessionPayload } from "@/lib/playlists/fetch-listen-session";
import type { LoadSessionInput } from "@/lib/listen/global-player-types";
import { readGuestPracticeProgress } from "@/lib/promo/guest-progress";

const GESTURE_HINT_MARKERS = [
  "Нажмите Play",
  "Нажмите ещё раз",
] as const;

export function buildPromoPlaybackErrorMessage(reason: string): string {
  if (reason === "unavailable" || reason === "forbidden") {
    return "Для прослушивания нужен доступ к продукту.";
  }

  if (reason === "no_audio") {
    return "Аудиоматериал пока недоступен.";
  }

  if (reason === "not_found") {
    return "Практика недоступна.";
  }

  return "Не удалось начать воспроизведение. Попробуйте ещё раз.";
}

export function hasPromoProductResumeProgress(practiceId: string): boolean {
  const progress = readGuestPracticeProgress(practiceId);

  if (!progress) {
    return false;
  }

  return progress.started && !progress.completed;
}

export function getPromoProductPlayLabel(
  practiceId: string,
  activePracticeId: string | null,
  isLoading: boolean,
  options?: {
    isPlaying?: boolean;
    needsGesturePlay?: boolean;
  },
): string {
  if (isLoading) {
    return "Запуск…";
  }

  if (activePracticeId === practiceId) {
    if (options?.isPlaying) {
      return "Слушаете";
    }

    return "Воспроизвести";
  }

  if (hasPromoProductResumeProgress(practiceId)) {
    return "Продолжить слушать";
  }

  return "Начать слушать";
}

export function isPromoAutoplayBlockedHint(message: string | null | undefined): boolean {
  if (!message) {
    return false;
  }

  return GESTURE_HINT_MARKERS.some((marker) => message.includes(marker));
}

type SessionCacheKey = string;

function sessionCacheKey(authorSlug: string, productSlug: string): SessionCacheKey {
  return `${authorSlug.trim()}::${productSlug.trim()}`;
}

type UsePromoPagePlaybackOptions = {
  authorSlug: string;
  productSlugs?: readonly string[];
  onPlayStarted?: (input: { practiceId: string; trackId: string | null }) => void;
};

export function usePromoPagePlayback({
  authorSlug,
  productSlugs = [],
  onPlayStarted,
}: UsePromoPagePlaybackOptions) {
  const { session, loadSession, clearPlaylistQueue } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const requestLockRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const startedPracticeRef = useRef<string | null>(null);
  const sessionCacheRef = useRef<Map<SessionCacheKey, LoadSessionInput>>(new Map());

  const [fetchingProductId, setFetchingProductId] = useState<string | null>(null);
  const [intentPracticeId, setIntentPracticeId] = useState<string | null>(null);
  const [forceGesturePracticeId, setForceGesturePracticeId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activePracticeId = session?.practiceId ?? null;
  const engineIsPlaying = Boolean(engine?.isPlaying);
  const engineStatusMessage = engine?.statusMessage ?? null;
  const engineIsLoading = Boolean(engine?.isLoading);
  const engineHasSrc = Boolean(engine?.src);

  const needsGesturePlay = Boolean(
    intentPracticeId &&
      activePracticeId === intentPracticeId &&
      !engineIsPlaying &&
      (isPromoAutoplayBlockedHint(engineStatusMessage) ||
        forceGesturePracticeId === intentPracticeId),
  );

  const loadingProductId =
    fetchingProductId ??
    (intentPracticeId &&
    activePracticeId === intentPracticeId &&
    !engineIsPlaying &&
    !needsGesturePlay &&
    (engineIsLoading || !engineHasSrc)
      ? intentPracticeId
      : null);

  useEffect(() => {
    let cancelled = false;

    async function prefetchSessions() {
      for (const productSlug of productSlugs) {
        const key = sessionCacheKey(authorSlug, productSlug);

        if (sessionCacheRef.current.has(key)) {
          continue;
        }

        const loaded = await fetchListenSessionPayload(authorSlug, productSlug);

        if (cancelled || !loaded.ok) {
          continue;
        }

        sessionCacheRef.current.set(key, loaded.session);
      }
    }

    if (productSlugs.length > 0) {
      void prefetchSessions();
    }

    return () => {
      cancelled = true;
    };
  }, [authorSlug, productSlugs]);

  useEffect(() => {
    if (!intentPracticeId || !activePracticeId) {
      return;
    }

    if (activePracticeId !== intentPracticeId) {
      return;
    }

    if (engineIsPlaying || engineIsLoading || !engineHasSrc) {
      return;
    }

    if (isPromoAutoplayBlockedHint(engineStatusMessage)) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setForceGesturePracticeId(intentPracticeId);
    }, 900);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    activePracticeId,
    engineHasSrc,
    engineIsLoading,
    engineIsPlaying,
    engineStatusMessage,
    intentPracticeId,
  ]);

  useEffect(() => {
    if (!engineIsPlaying || !activePracticeId) {
      return;
    }

    if (startedPracticeRef.current === activePracticeId) {
      return;
    }

    startedPracticeRef.current = activePracticeId;
    onPlayStarted?.({
      practiceId: activePracticeId,
      trackId: engine?.currentTrack?.id ?? null,
    });
  }, [activePracticeId, engine?.currentTrack?.id, engineIsPlaying, onPlayStarted]);

  const resumeActiveProduct = useCallback(async () => {
    if (!engine || !session) {
      return false;
    }

    if (engine.isPlaying) {
      return true;
    }

    const trackIndex = Math.max(engine.currentTrackIndex ?? 0, 0);
    setIntentPracticeId(session.practiceId);
    setForceGesturePracticeId(null);
    setErrorMessage(null);

    await engine.handlePlayTrackAtIndex(trackIndex);

    const audio = engine.audioRef.current;

    if (audio && !audio.paused) {
      setForceGesturePracticeId(null);
      return true;
    }

    if (engine.src) {
      setForceGesturePracticeId(session.practiceId);
    }

    return Boolean(engine.src);
  }, [engine, session]);

  const playProduct = useCallback(
    async (productSlug: string, practiceId: string) => {
      const isSameProduct =
        session?.authorSlug === authorSlug &&
        session?.productSlug === productSlug;

      if (isSameProduct && engine && session) {
        clearPlaylistQueue();
        await resumeActiveProduct();
        return;
      }

      if (requestLockRef.current) {
        return;
      }

      const requestGeneration = requestGenerationRef.current + 1;
      requestGenerationRef.current = requestGeneration;
      requestLockRef.current = true;
      setIntentPracticeId(practiceId);
      setForceGesturePracticeId(null);
      setFetchingProductId(practiceId);
      setErrorMessage(null);

      try {
        const cacheKey = sessionCacheKey(authorSlug, productSlug);
        let loadedSession = sessionCacheRef.current.get(cacheKey) ?? null;

        if (!loadedSession) {
          const loaded = await fetchListenSessionPayload(authorSlug, productSlug);

          if (requestGeneration !== requestGenerationRef.current) {
            return;
          }

          if (!loaded.ok) {
            setErrorMessage(buildPromoPlaybackErrorMessage(loaded.reason));
            setIntentPracticeId(null);
            return;
          }

          loadedSession = loaded.session;
          sessionCacheRef.current.set(cacheKey, loadedSession);
        }

        if (requestGeneration !== requestGenerationRef.current) {
          return;
        }

        clearPlaylistQueue();

        const firstTrackId = loadedSession.tracks[0]?.id ?? null;

        loadSession({
          ...loadedSession,
          initialTrackId: firstTrackId,
          requestAutoplay: true,
          suppressListenUrlSync: true,
        });
      } finally {
        if (requestGeneration === requestGenerationRef.current) {
          requestLockRef.current = false;
          setFetchingProductId(null);
        }
      }
    },
    [
      authorSlug,
      clearPlaylistQueue,
      engine,
      loadSession,
      resumeActiveProduct,
      session,
    ],
  );

  return {
    playProduct,
    loadingProductId,
    errorMessage,
    clearErrorMessage: () => setErrorMessage(null),
    activePracticeId,
    isPlaying: engineIsPlaying && activePracticeId !== null,
    needsGesturePlay,
  };
}
