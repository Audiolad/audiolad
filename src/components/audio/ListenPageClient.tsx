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
  } = useGlobalAudioPlayer();

  useEffect(() => {
    if (dismissedPracticeId === practiceId && !autoplay) {
      return;
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
    activeSession?.practiceId,
    authorName,
    authorSlug,
    autoplay,
    coverGradient,
    coverImageUrl,
    coverSymbol,
    dismissedPracticeId,
    format,
    initialProgress,
    isAuthorPreview,
    loadSession,
    practiceId,
    practiceTitle,
    productSlug,
    tracks,
  ]);

  return null;
}
