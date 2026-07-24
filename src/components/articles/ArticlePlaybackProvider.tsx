"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import {
  getPromoProductPlayLabel,
  usePromoPagePlayback,
} from "@/components/promo-pages/usePromoPagePlayback";
import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { useOptionalPlayerEngine } from "@/components/audio/GlobalAudioPlayerProvider";
import { readGuestPracticeProgress } from "@/lib/promo/guest-progress";

export type ArticleAudioPlacement =
  | "top_player"
  | "final_audio"
  | "inline_text";

type ArticlePlaybackContextValue = {
  articleSlug: string;
  topicSlug: string;
  practiceId: string;
  practiceSlug: string;
  authorSlug: string;
  path: string;
  activePracticeId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  needsGesturePlay: boolean;
  errorMessage: string | null;
  playLabel: string;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isActive: boolean;
  hasResumeProgress: boolean;
  isCompleted: boolean;
  play: (placement: ArticleAudioPlacement) => void;
  pause: () => void;
  seekBy: (offsetSeconds: number) => void;
  cycleSpeed: () => void;
  trackEvent: (
    eventName:
      | "article_audio_play"
      | "article_practice_open"
      | "article_practice_save"
      | "article_topic_click"
      | "article_related_practice_click"
      | "article_toc_click"
      | "article_final_audio_click",
    properties?: Record<string, string | number | boolean | null | undefined>,
  ) => void;
};

const ArticlePlaybackContext = createContext<ArticlePlaybackContextValue | null>(
  null,
);

type ArticlePlaybackProviderProps = {
  articleSlug: string;
  topicSlug: string;
  path: string;
  practiceId: string;
  practiceSlug: string;
  authorSlug: string;
  children: ReactNode;
};

export function ArticlePlaybackProvider({
  articleSlug,
  topicSlug,
  path,
  practiceId,
  practiceSlug,
  authorSlug,
  children,
}: ArticlePlaybackProviderProps) {
  const playStartedRef = useRef(false);
  const pendingPlacementRef = useRef<ArticleAudioPlacement>("top_player");
  const engine = useOptionalPlayerEngine();

  const handlePlayStarted = useCallback(() => {
    if (playStartedRef.current) {
      return;
    }

    playStartedRef.current = true;
    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId) {
      return;
    }

    void trackPlatformEvent({
      sessionId,
      event_name: "article_audio_play",
      path,
      practice_id: practiceId,
      properties: {
        article_slug: articleSlug,
        topic_slug: topicSlug,
        practice_slug: practiceSlug,
        placement: pendingPlacementRef.current,
      },
    });
  }, [articleSlug, path, practiceId, practiceSlug, topicSlug]);

  const {
    playProduct,
    loadingProductId,
    errorMessage,
    clearErrorMessage,
    activePracticeId,
    isPlaying,
    needsGesturePlay,
  } = usePromoPagePlayback({
    authorSlug,
    productSlugs: [practiceSlug],
    onPlayStarted: handlePlayStarted,
  });

  const isActive = activePracticeId === practiceId;
  const isLoading = loadingProductId === practiceId;
  const guestProgress = readGuestPracticeProgress(practiceId);
  const hasResumeProgress = Boolean(
    guestProgress?.started && !guestProgress.completed,
  );
  const isCompleted = Boolean(guestProgress?.completed);

  const trackEvent = useCallback(
    (
      eventName:
        | "article_audio_play"
        | "article_practice_open"
        | "article_practice_save"
        | "article_topic_click"
        | "article_related_practice_click"
        | "article_toc_click"
        | "article_final_audio_click",
      properties: Record<
        string,
        string | number | boolean | null | undefined
      > = {},
    ) => {
      const sessionId = getCachedAnalyticsSessionId();

      if (!sessionId) {
        return;
      }

      const cleaned: Record<string, string | number | boolean> = {
        article_slug: articleSlug,
        topic_slug: topicSlug,
        practice_slug: practiceSlug,
      };

      for (const [key, value] of Object.entries(properties)) {
        if (value === null || value === undefined) {
          continue;
        }

        cleaned[key] = value;
      }

      void trackPlatformEvent({
        sessionId,
        event_name: eventName,
        path,
        practice_id: practiceId,
        properties: cleaned,
      });
    },
    [articleSlug, path, practiceId, practiceSlug, topicSlug],
  );

  const play = useCallback(
    (placement: ArticleAudioPlacement) => {
      pendingPlacementRef.current = placement;
      clearErrorMessage();

      if (placement === "final_audio") {
        trackEvent("article_final_audio_click", { placement });
      }

      void playProduct(practiceSlug, practiceId);
    },
    [clearErrorMessage, playProduct, practiceId, practiceSlug, trackEvent],
  );

  const pause = useCallback(() => {
    if (!engine || !isActive) {
      return;
    }

    void engine.handlePlayPause();
  }, [engine, isActive]);

  const seekBy = useCallback(
    (offsetSeconds: number) => {
      if (!engine || !isActive) {
        return;
      }

      engine.handleSeekOffset(offsetSeconds);
    },
    [engine, isActive],
  );

  const cycleSpeed = useCallback(() => {
    if (!engine || !isActive) {
      return;
    }

    engine.handleSpeedChange();
  }, [engine, isActive]);

  const value = useMemo<ArticlePlaybackContextValue>(
    () => ({
      articleSlug,
      topicSlug,
      practiceId,
      practiceSlug,
      authorSlug,
      path,
      activePracticeId,
      isPlaying: isPlaying && isActive,
      isLoading,
      needsGesturePlay: needsGesturePlay && isActive,
      errorMessage,
      playLabel: getPromoProductPlayLabel(
        practiceId,
        activePracticeId,
        isLoading,
        {
          isPlaying: isPlaying && isActive,
          needsGesturePlay: needsGesturePlay && isActive,
        },
      ),
      currentTime: isActive ? (engine?.currentTime ?? 0) : 0,
      duration: isActive ? (engine?.displayDuration ?? 0) : 0,
      playbackRate: isActive ? (engine?.playbackRate ?? 1) : 1,
      isActive,
      hasResumeProgress,
      isCompleted,
      play,
      pause,
      seekBy,
      cycleSpeed,
      trackEvent,
    }),
    [
      activePracticeId,
      articleSlug,
      authorSlug,
      cycleSpeed,
      engine?.currentTime,
      engine?.displayDuration,
      engine?.playbackRate,
      errorMessage,
      hasResumeProgress,
      isActive,
      isCompleted,
      isLoading,
      isPlaying,
      needsGesturePlay,
      path,
      pause,
      play,
      practiceId,
      practiceSlug,
      seekBy,
      topicSlug,
      trackEvent,
    ],
  );

  return (
    <ArticlePlaybackContext.Provider value={value}>
      {children}
    </ArticlePlaybackContext.Provider>
  );
}

export function useArticlePlayback(): ArticlePlaybackContextValue {
  const context = useContext(ArticlePlaybackContext);

  if (!context) {
    throw new Error("useArticlePlayback must be used within ArticlePlaybackProvider");
  }

  return context;
}
