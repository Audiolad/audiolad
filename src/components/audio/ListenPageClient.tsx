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
  } = useGlobalAudioPlayer();

  useEffect(() => {
    if (dismissedPracticeId === practiceId && !autoplay) {
      return;
    }

    // Internal queue router.replace — keep queue, do not reload/autoplay again.
    if (isInternalQueueNavigation(practiceId)) {
      return;
    }

    // User opened a different listen route — leave playlist queue mode.
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
    coverGradient,
    coverImageUrl,
    coverSymbol,
    dismissedPracticeId,
    format,
    initialProgress,
    isAuthorPreview,
    isInternalQueueNavigation,
    loadSession,
    practiceId,
    practiceTitle,
    productSlug,
    tracks,
  ]);

  return null;
}
