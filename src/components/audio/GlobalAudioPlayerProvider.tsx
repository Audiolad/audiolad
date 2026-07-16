"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { useSequentialPlayer } from "@/components/audio/useSequentialPlayer";
import GlobalMiniPlayer from "@/components/audio/GlobalMiniPlayer";
import PlayerDebugPanel from "@/components/audio/PlayerDebugPanel";
import {
  clearMediaSession,
  syncMediaSessionPlaybackState,
  syncMediaSessionPositionState,
} from "@/lib/audio/playback-recovery";
import type { LoadSessionInput } from "@/lib/listen/global-player-types";
import { isListenPlayerPathname } from "@/lib/navigation/bottom-nav";
import {
  buildSafeListenReplacePath,
  fetchListenSessionPayload,
} from "@/lib/playlists/fetch-listen-session";
import {
  getQueueEntryListenSlugs,
  getQueueEntryPracticeId,
  type PlaylistQueue,
  type PlaylistQueueEntry,
} from "@/lib/playlists/player-queue-types";
import { createClient } from "@/lib/supabase/client";

export const GLOBAL_MINI_PLAYER_HEIGHT_PX = 72;

type PlayerEngineApi = ReturnType<typeof useSequentialPlayer>;

type LoadPlaylistQueueResult =
  | { ok: true; skipMessage: string | null }
  | { ok: false; error: string };

type SessionContextValue = {
  session: LoadSessionInput | null;
  dismissedPracticeId: string | null;
  loadSession: (input: LoadSessionInput) => void;
  stopAndClear: () => void;
  openFullPlayer: () => void;
  showMiniPlayer: boolean;
  activeQueue: PlaylistQueue | null;
  currentQueueEntry: PlaylistQueueEntry | null;
  queueCompleted: boolean;
  loadPlaylistQueue: (queue: PlaylistQueue) => Promise<LoadPlaylistQueueResult>;
  clearPlaylistQueue: () => void;
  restartPlaylistQueue: () => Promise<LoadPlaylistQueueResult>;
  returnToPlaylistSource: () => void;
  isQueueDrivenPractice: (practiceId: string) => boolean;
  /** True while / after internal queue router.replace for this practice. */
  isInternalQueueNavigation: (practiceId: string) => boolean;
  noticeMessage: string | null;
  clearNoticeMessage: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const PlayerEngineContext = createContext<PlayerEngineApi | null>(null);

function GlobalPlayerEngine({
  session,
  sessionGenerationRef,
  stopEngineRef,
  queueHasNext,
  queueHasPrevious,
  onTracksExhausted,
  onRequestPreviousProduct,
  children,
}: {
  session: LoadSessionInput;
  sessionGenerationRef: MutableRefObject<number>;
  stopEngineRef: MutableRefObject<(() => void) | null>;
  queueHasNext: boolean;
  queueHasPrevious: boolean;
  onTracksExhausted: (
    fromPracticeId: string,
  ) => Promise<"advanced" | "completed" | "none">;
  onRequestPreviousProduct: () => Promise<boolean>;
  children: ReactNode;
}) {
  const router = useRouter();
  const recoveryTimerRef = useRef<number | null>(null);

  const handleInitialAutoplayAttempted = useCallback(() => {
    if (!session.requestAutoplay) {
      return;
    }

    const path = buildSafeListenReplacePath(
      session.authorSlug,
      session.productSlug,
    );

    if (!path) {
      return;
    }

    router.replace(path, { scroll: false });
  }, [router, session.authorSlug, session.productSlug, session.requestAutoplay]);

  const registerCleanup = useCallback(
    (cleanup: () => void) => {
      stopEngineRef.current = cleanup;
    },
    [stopEngineRef],
  );

  const engine = useSequentialPlayer({
    authorSlug: session.authorSlug,
    productSlug: session.productSlug,
    practiceId: session.practiceId,
    tracks: session.tracks,
    initialProgress: session.initialProgress,
    requestInitialAutoplay: Boolean(session.requestAutoplay),
    forceStartAtBeginning: Boolean(session.forceStartAtBeginning),
    queueHasNext,
    queueHasPrevious,
    onTracksExhausted,
    onRequestPreviousProduct,
    onInitialAutoplayAttempted: handleInitialAutoplayAttempted,
    getSessionGeneration: () => sessionGenerationRef.current,
    registerCleanup,
  });

  const {
    audioRef,
    src,
    currentTrack,
    isPlaying,
    isRecovering,
    currentTime,
    displayDuration,
    playbackRate,
    recoverPlaybackAfterForeground,
    handleMediaSessionPlay,
    handleMediaSessionPause,
    ...playerControls
  } = engine;

  const playerContextValue = {
    ...playerControls,
    audioRef,
    src,
    currentTrack,
    isPlaying,
    isRecovering,
    currentTime,
    displayDuration,
    playbackRate,
    recoverPlaybackAfterForeground,
    handleMediaSessionPlay,
    handleMediaSessionPause,
  };

  const mediaSessionHandlersRef = useRef({
    play: handleMediaSessionPlay,
    pause: handleMediaSessionPause,
    seekBackward: playerControls.handleSeekOffset,
    seekForward: playerControls.handleSeekOffset,
    previousTrack: playerControls.handlePreviousTrack,
    nextTrack: playerControls.handleNextTrack,
  });

  useEffect(() => {
    mediaSessionHandlersRef.current = {
      play: handleMediaSessionPlay,
      pause: handleMediaSessionPause,
      seekBackward: playerControls.handleSeekOffset,
      seekForward: playerControls.handleSeekOffset,
      previousTrack: playerControls.handlePreviousTrack,
      nextTrack: playerControls.handleNextTrack,
    };
  }, [
    handleMediaSessionPause,
    handleMediaSessionPlay,
    playerControls.handleNextTrack,
    playerControls.handlePreviousTrack,
    playerControls.handleSeekOffset,
  ]);

  useEffect(() => {
    const scheduleRecovery = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (recoveryTimerRef.current !== null) {
        window.clearTimeout(recoveryTimerRef.current);
      }

      recoveryTimerRef.current = window.setTimeout(() => {
        recoveryTimerRef.current = null;

        if (document.visibilityState !== "visible") {
          return;
        }

        void recoverPlaybackAfterForeground();
      }, 350);
    };

    document.addEventListener("visibilitychange", scheduleRecovery);
    window.addEventListener("pageshow", scheduleRecovery);
    window.addEventListener("focus", scheduleRecovery);

    return () => {
      if (recoveryTimerRef.current !== null) {
        window.clearTimeout(recoveryTimerRef.current);
      }

      document.removeEventListener("visibilitychange", scheduleRecovery);
      window.removeEventListener("pageshow", scheduleRecovery);
      window.removeEventListener("focus", scheduleRecovery);
    };
  }, [recoverPlaybackAfterForeground]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.setActionHandler("play", () => {
      void mediaSessionHandlersRef.current.play();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      void mediaSessionHandlersRef.current.pause();
    });
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      mediaSessionHandlersRef.current.seekBackward(-15);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      mediaSessionHandlersRef.current.seekForward(15);
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      void mediaSessionHandlersRef.current.previousTrack();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      void mediaSessionHandlersRef.current.nextTrack();
    });

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const audio = audioRef.current;
    const trackTitle =
      currentTrack?.title?.trim() || session.practiceTitle;
    const artwork = session.coverImageUrl
      ? [
          {
            src: session.coverImageUrl,
            sizes: "512x512",
            type: "image/png",
          },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackTitle,
      artist: session.authorName,
      album: session.practiceTitle,
      artwork,
    });

    syncMediaSessionPlaybackState(isPlaying);
    syncMediaSessionPositionState(
      displayDuration,
      playbackRate,
      audio?.currentTime ?? currentTime,
    );
  }, [
    audioRef,
    currentTime,
    currentTrack?.id,
    currentTrack?.title,
    displayDuration,
    isPlaying,
    playbackRate,
    session.authorName,
    session.coverImageUrl,
    session.practiceTitle,
  ]);

  return (
    <PlayerEngineContext.Provider value={playerContextValue}>
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        playsInline
        className="global-audio-element"
      />
      {children}
      <GlobalMiniPlayer />
      <PlayerDebugPanel />
    </PlayerEngineContext.Provider>
  );
}

export function GlobalAudioPlayerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<LoadSessionInput | null>(null);
  const [dismissedPracticeId, setDismissedPracticeId] = useState<string | null>(
    null,
  );
  const [activeQueue, setActiveQueue] = useState<PlaylistQueue | null>(null);
  const [queueCompleted, setQueueCompleted] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [playbackInstanceId, setPlaybackInstanceId] = useState(0);
  const sessionGenerationRef = useRef(0);
  const stopEngineRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef<LoadSessionInput | null>(null);
  const activeQueueRef = useRef<PlaylistQueue | null>(null);
  const transitionLockRef = useRef(false);
  const queueDrivenPracticeIdsRef = useRef<Set<string>>(new Set());
  /** Practice id targeted by the latest internal queue router.replace. */
  const queueReplaceTargetRef = useRef<string | null>(null);
  /** Practice id that already triggered cross-product advance (ended/Next dedupe). */
  const lastExhaustedPracticeIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    activeQueueRef.current = activeQueue;
  }, [activeQueue]);

  const clearNoticeMessage = useCallback(() => {
    setNoticeMessage(null);
  }, []);

  const clearPlaylistQueue = useCallback(() => {
    setActiveQueue(null);
    activeQueueRef.current = null;
    setQueueCompleted(false);
    queueDrivenPracticeIdsRef.current = new Set();
    queueReplaceTargetRef.current = null;
    lastExhaustedPracticeIdRef.current = null;
  }, []);

  const loadSession = useCallback((input: LoadSessionInput) => {
    setDismissedPracticeId(null);
    sessionGenerationRef.current += 1;

    setSession((current) => {
      if (current?.practiceId === input.practiceId) {
        return {
          ...current,
          ...input,
          requestAutoplay: input.requestAutoplay ?? false,
        };
      }

      return input;
    });
  }, []);

  const stopAndClear = useCallback(() => {
    sessionGenerationRef.current += 1;
    setDismissedPracticeId(sessionRef.current?.practiceId ?? null);
    stopEngineRef.current?.();
    stopEngineRef.current = null;
    clearMediaSession();
    setSession(null);
    clearPlaylistQueue();
    setNoticeMessage(null);
  }, [clearPlaylistQueue]);

  const openFullPlayer = useCallback(() => {
    if (!session) {
      return;
    }

    const path = buildSafeListenReplacePath(
      session.authorSlug,
      session.productSlug,
    );

    if (!path) {
      return;
    }

    router.push(path);
  }, [router, session]);

  const isQueueDrivenPractice = useCallback((practiceId: string) => {
    return queueDrivenPracticeIdsRef.current.has(practiceId);
  }, []);

  const isInternalQueueNavigation = useCallback((practiceId: string) => {
    if (queueReplaceTargetRef.current === practiceId) {
      return true;
    }

    const queue = activeQueueRef.current;
    const current = queue?.entries[queue.currentIndex];
    return Boolean(current && getQueueEntryPracticeId(current) === practiceId);
  }, []);

  const activateEntryAtIndex = useCallback(
    async (
      queue: PlaylistQueue,
      startIndex: number,
      options: {
        autoplay: boolean;
        fromStart: boolean;
        direction?: "forward" | "backward";
      },
    ): Promise<"advanced" | "completed" | "failed"> => {
      if (transitionLockRef.current) {
        return "failed";
      }

      transitionLockRef.current = true;
      const direction = options.direction ?? "forward";

      try {
        let index = startIndex;
        let runtimeSkipped = queue.runtimeSkippedCount;

        while (index >= 0 && index < queue.entries.length) {
          const entry = queue.entries[index];
          const slugs = getQueueEntryListenSlugs(entry);

          if (!slugs || entry.kind !== "product") {
            runtimeSkipped += 1;
            index += direction === "forward" ? 1 : -1;
            continue;
          }

          const loaded = await fetchListenSessionPayload(
            slugs.authorSlug,
            slugs.productSlug,
            { fromStart: options.fromStart },
          );

          if (!loaded.ok) {
            runtimeSkipped += 1;
            index += direction === "forward" ? 1 : -1;
            continue;
          }

          const nextQueue: PlaylistQueue = {
            ...queue,
            currentIndex: index,
            runtimeSkippedCount: runtimeSkipped,
          };

          // Mark internal replace BEFORE state updates so ListenPageClient
          // does not treat router.replace as standalone navigation.
          queueReplaceTargetRef.current = loaded.session.practiceId;

          setActiveQueue(nextQueue);
          activeQueueRef.current = nextQueue;
          setQueueCompleted(false);
          queueDrivenPracticeIdsRef.current = new Set(
            nextQueue.entries.map((item) => getQueueEntryPracticeId(item)),
          );

          // Force engine remount even when practiceId stays the same (restart).
          setPlaybackInstanceId((value) => value + 1);

          loadSession({
            ...loaded.session,
            requestAutoplay: options.autoplay,
            forceStartAtBeginning: options.fromStart,
          });

          const path = buildSafeListenReplacePath(
            loaded.session.authorSlug,
            loaded.session.productSlug,
          );

          if (path) {
            router.replace(path, { scroll: false });
          }

          if (runtimeSkipped > queue.runtimeSkippedCount) {
            setNoticeMessage(
              runtimeSkipped - queue.runtimeSkippedCount === 1 &&
                queue.skippedCount === 0
                ? "Один материал пропущен, потому что сейчас недоступен."
                : "Некоторые материалы пропущены, потому что сейчас недоступны.",
            );
          }

          return "advanced";
        }

        if (direction === "backward") {
          return "failed";
        }

        const finishedQueue: PlaylistQueue = {
          ...queue,
          currentIndex: Math.max(queue.entries.length - 1, 0),
          runtimeSkippedCount: runtimeSkipped,
        };
        setActiveQueue(finishedQueue);
        activeQueueRef.current = finishedQueue;
        setQueueCompleted(true);
        return "completed";
      } finally {
        transitionLockRef.current = false;
      }
    },
    [loadSession, router],
  );

  const loadPlaylistQueue = useCallback(
    async (queue: PlaylistQueue): Promise<LoadPlaylistQueueResult> => {
      if (queue.entries.length === 0) {
        return {
          ok: false,
          error: "Не удалось запустить плейлист. Попробуйте ещё раз.",
        };
      }

      lastExhaustedPracticeIdRef.current = null;

      const skipMessage =
        queue.skippedCount > 0 ? "Некоторые материалы будут пропущены." : null;

      const result = await activateEntryAtIndex(queue, 0, {
        autoplay: true,
        fromStart: false,
      });

      if (result === "failed" || result === "completed") {
        clearPlaylistQueue();
        return {
          ok: false,
          error: "Не удалось запустить плейлист. Попробуйте ещё раз.",
        };
      }

      if (skipMessage) {
        setNoticeMessage(skipMessage);
      }

      return { ok: true, skipMessage };
    },
    [activateEntryAtIndex, clearPlaylistQueue],
  );

  const restartPlaylistQueue = useCallback(async (): Promise<LoadPlaylistQueueResult> => {
    const queue = activeQueueRef.current;

    if (!queue || queue.entries.length === 0) {
      return {
        ok: false,
        error: "Не удалось запустить плейлист. Попробуйте ещё раз.",
      };
    }

    const resetQueue: PlaylistQueue = {
      ...queue,
      currentIndex: 0,
      runtimeSkippedCount: 0,
    };

    lastExhaustedPracticeIdRef.current = null;
    setQueueCompleted(false);

    const result = await activateEntryAtIndex(resetQueue, 0, {
      autoplay: true,
      fromStart: true,
    });

    if (result !== "advanced") {
      return {
        ok: false,
        error: "Не удалось запустить плейлист. Попробуйте ещё раз.",
      };
    }

    return { ok: true, skipMessage: null };
  }, [activateEntryAtIndex]);

  const returnToPlaylistSource = useCallback(() => {
    const queue = activeQueueRef.current;
    const returnHref = queue?.source.returnHref;

    stopAndClear();

    if (
      returnHref &&
      (returnHref.startsWith("/playlists/") || returnHref.startsWith("/p/"))
    ) {
      router.push(returnHref);
    }
  }, [router, stopAndClear]);

  const onTracksExhausted = useCallback(
    async (
      fromPracticeId: string,
    ): Promise<"advanced" | "completed" | "none"> => {
      const queue = activeQueueRef.current;
      const currentSession = sessionRef.current;

      if (!queue || queueCompleted || !currentSession) {
        return "none";
      }

      // Deduplicate ended + manual/MediaSession Next for the same product.
      if (lastExhaustedPracticeIdRef.current === fromPracticeId) {
        return "none";
      }

      if (currentSession.practiceId !== fromPracticeId) {
        return "none";
      }

      const currentEntry = queue.entries[queue.currentIndex];
      if (
        !currentEntry ||
        getQueueEntryPracticeId(currentEntry) !== fromPracticeId
      ) {
        return "none";
      }

      lastExhaustedPracticeIdRef.current = fromPracticeId;

      const result = await activateEntryAtIndex(queue, queue.currentIndex + 1, {
        autoplay: true,
        fromStart: true,
      });

      if (result === "failed") {
        // Allow a later retry if the transition never started.
        lastExhaustedPracticeIdRef.current = null;
        return "none";
      }

      if (result === "advanced") {
        return "advanced";
      }

      if (result === "completed") {
        return "completed";
      }

      return "none";
    },
    [activateEntryAtIndex, queueCompleted],
  );

  const onRequestPreviousProduct = useCallback(async (): Promise<boolean> => {
    const queue = activeQueueRef.current;

    if (!queue || queue.currentIndex <= 0) {
      return false;
    }

    const result = await activateEntryAtIndex(queue, queue.currentIndex - 1, {
      autoplay: true,
      fromStart: true,
      direction: "backward",
    });

    return result === "advanced";
  }, [activateEntryAtIndex]);

  const currentQueueEntry =
    activeQueue && activeQueue.entries[activeQueue.currentIndex]
      ? activeQueue.entries[activeQueue.currentIndex]
      : null;

  const queueHasNext = Boolean(
    activeQueue &&
      !queueCompleted &&
      activeQueue.currentIndex < activeQueue.entries.length - 1,
  );
  const queueHasPrevious = Boolean(
    activeQueue && !queueCompleted && activeQueue.currentIndex > 0,
  );

  const showMiniPlayer = Boolean(
    session &&
      session.tracks.length > 0 &&
      !isListenPlayerPathname(pathname) &&
      !queueCompleted,
  );

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--global-mini-player-height",
      showMiniPlayer ? `${GLOBAL_MINI_PLAYER_HEIGHT_PX}px` : "0px",
    );
  }, [showMiniPlayer]);

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        stopAndClear();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [stopAndClear]);

  const sessionValue = useMemo(
    () => ({
      session,
      dismissedPracticeId,
      loadSession,
      stopAndClear,
      openFullPlayer,
      showMiniPlayer,
      activeQueue,
      currentQueueEntry,
      queueCompleted,
      loadPlaylistQueue,
      clearPlaylistQueue,
      restartPlaylistQueue,
      returnToPlaylistSource,
      isQueueDrivenPractice,
      isInternalQueueNavigation,
      noticeMessage,
      clearNoticeMessage,
    }),
    [
      activeQueue,
      clearNoticeMessage,
      clearPlaylistQueue,
      currentQueueEntry,
      dismissedPracticeId,
      isInternalQueueNavigation,
      isQueueDrivenPractice,
      loadPlaylistQueue,
      loadSession,
      noticeMessage,
      openFullPlayer,
      queueCompleted,
      restartPlaylistQueue,
      returnToPlaylistSource,
      session,
      showMiniPlayer,
      stopAndClear,
    ],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      {session ? (
        <GlobalPlayerEngine
          key={`${session.practiceId}:${playbackInstanceId}`}
          session={session}
          sessionGenerationRef={sessionGenerationRef}
          stopEngineRef={stopEngineRef}
          queueHasNext={queueHasNext}
          queueHasPrevious={queueHasPrevious}
          onTracksExhausted={onTracksExhausted}
          onRequestPreviousProduct={onRequestPreviousProduct}
        >
          {children}
        </GlobalPlayerEngine>
      ) : (
        children
      )}
    </SessionContext.Provider>
  );
}

export function useGlobalAudioPlayer() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error(
      "useGlobalAudioPlayer must be used within GlobalAudioPlayerProvider",
    );
  }

  return context;
}

export function usePlayerEngine() {
  const engine = useContext(PlayerEngineContext);

  if (!engine) {
    throw new Error("usePlayerEngine requires an active global player session");
  }

  return engine;
}

export function useOptionalPlayerEngine() {
  return useContext(PlayerEngineContext);
}

export function useGlobalAudioPlayerSession() {
  const { session } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();

  if (!session || !engine) {
    throw new Error("Global audio player session is not active");
  }

  return { session, engine };
}
