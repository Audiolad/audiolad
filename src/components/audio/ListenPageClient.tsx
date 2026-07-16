"use client";

import { useEffect } from "react";

import { useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";
import type { LoadSessionInput } from "@/lib/listen/global-player-types";

type ListenPageClientProps = LoadSessionInput & {
  autoplay?: boolean;
};

export default function ListenPageClient({
  autoplay = false,
  practiceId,
  authorSlug,
  productSlug,
  practiceTitle,
  authorName,
  format,
  tracks,
  initialProgress,
  coverSymbol,
  coverGradient,
  coverImageUrl,
  isAuthorPreview,
}: ListenPageClientProps) {
  const {
    loadSession,
    session: activeSession,
    dismissedPracticeId,
    activeQueue,
    clearPlaylistQueue,
    isInternalQueueNavigation,
    confirmInternalQueueNavigation,
    isQueueDrivenPractice,
  } = useGlobalAudioPlayer();

  useEffect(() => {
    if (dismissedPracticeId === practiceId && !autoplay) {
      return;
    }

    // Internal queue router.replace (from or to page) — keep queue, no reload.
    if (isInternalQueueNavigation(practiceId)) {
      confirmInternalQueueNavigation(practiceId);
      return;
    }

    // Previous queue entry page still mounted after provider already advanced.
    if (
      activeQueue &&
      activeSession?.practiceId &&
      activeSession.practiceId !== practiceId &&
      isQueueDrivenPractice(practiceId)
    ) {
      return;
    }

    // True standalone listen navigation — leave playlist queue mode.
    if (activeQueue) {
      clearPlaylistQueue();
    }

    loadSession({
      practiceId,
      authorSlug,
      productSlug,
      practiceTitle,
      authorName,
      format,
      tracks,
      initialProgress,
      coverSymbol,
      coverGradient,
      coverImageUrl,
      isAuthorPreview,
      requestAutoplay: autoplay && activeSession?.practiceId !== practiceId,
    });
  }, [
    activeQueue,
    activeSession?.practiceId,
    authorName,
    authorSlug,
    autoplay,
    clearPlaylistQueue,
    confirmInternalQueueNavigation,
    coverGradient,
    coverImageUrl,
    coverSymbol,
    dismissedPracticeId,
    format,
    initialProgress,
    isAuthorPreview,
    isInternalQueueNavigation,
    isQueueDrivenPractice,
    loadSession,
    practiceId,
    practiceTitle,
    productSlug,
    tracks,
  ]);

  return null;
}
