"use client";

import { useCallback, useRef, useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { fetchListenSessionPayload } from "@/lib/playlists/fetch-listen-session";
import { readGuestPracticeProgress } from "@/lib/promo/guest-progress";

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
): string {
  if (isLoading) {
    return "Запуск…";
  }

  if (activePracticeId === practiceId) {
    return "Слушаете";
  }

  if (hasPromoProductResumeProgress(practiceId)) {
    return "Продолжить слушать";
  }

  return "Начать слушать";
}

type UsePromoPagePlaybackOptions = {
  authorSlug: string;
};

export function usePromoPagePlayback({ authorSlug }: UsePromoPagePlaybackOptions) {
  const { session, loadSession, clearPlaylistQueue } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const requestLockRef = useRef(false);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const playProduct = useCallback(
    async (productSlug: string, practiceId: string) => {
      if (requestLockRef.current) {
        return;
      }

      requestLockRef.current = true;
      setLoadingProductId(practiceId);
      setErrorMessage(null);

      try {
        const isSameProduct =
          session?.authorSlug === authorSlug &&
          session?.productSlug === productSlug;

        if (isSameProduct && engine && session) {
          clearPlaylistQueue();
          const trackIndex = Math.max(engine.currentTrackIndex ?? 0, 0);
          await engine.handlePlayTrackAtIndex(trackIndex);
          return;
        }

        const loaded = await fetchListenSessionPayload(authorSlug, productSlug);

        if (!loaded.ok) {
          setErrorMessage(buildPromoPlaybackErrorMessage(loaded.reason));
          return;
        }

        clearPlaylistQueue();

        const firstTrackId = loaded.session.tracks[0]?.id ?? null;

        loadSession({
          ...loaded.session,
          initialTrackId: firstTrackId,
          requestAutoplay: true,
          suppressListenUrlSync: true,
        });
      } finally {
        requestLockRef.current = false;
        setLoadingProductId(null);
      }
    },
    [
      authorSlug,
      clearPlaylistQueue,
      engine,
      loadSession,
      session,
    ],
  );

  return {
    playProduct,
    loadingProductId,
    errorMessage,
    clearErrorMessage: () => setErrorMessage(null),
    activePracticeId: session?.practiceId ?? null,
  };
}
