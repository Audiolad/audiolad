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
import {
  clearDesktopPlayerLastSession,
  mergeDesktopPlaybackIntoSession,
  readDesktopPlayerLastSession,
  writeDesktopPlayerLastSession,
} from "@/lib/listen/desktop-player-persistence";
import { isListenPlayerPathname } from "@/lib/navigation/bottom-nav";
import {
  guestProgressToListenEntries,
  readGuestPracticeProgress,
} from "@/lib/promo/guest-progress";
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

export type DesktopPlayerRestoreState = "pending" | "restoring" | "ready";

type SessionContextValue = {
  session: LoadSessionInput | null;
  dismissedPracticeId: string | null;
  loadSession: (input: LoadSessionInput) => void;
  stopAndClear: () => void;
  openFullPlayer: () => void;
  showMiniPlayer: boolean;
  desktopPlayerRestoreState: DesktopPlayerRestoreState;
  activeQueue: PlaylistQueue | null;
  currentQueueEntry: PlaylistQueueEntry | null;
  queueCompleted: boolean;
  loadPlaylistQueue: (queue: PlaylistQueue) => Promise<LoadPlaylistQueueResult>;
  clearPlaylistQueue: () => void;
  restartPlaylistQueue: () => Promise<LoadPlaylistQueueResult>;
  returnToPlaylistSource: () => void;
  isQueueDrivenPractice: (practiceId: string) => boolean;
  /**
   * True while pending internal queue navigation involves this practice
   * (from or to), or when it is the settled current queue entry.
   */
  isInternalQueueNavigation: (practiceId: string) => boolean;
  /** Clears pending token after the target listen page confirms. */
  confirmInternalQueueNavigation: (practiceId: string) => void;
  noticeMessage: string | null;
  clearNoticeMessage: () => void;
};

type PendingQueueNavigation = {
  token: number;
  fromPracticeId: string | null;
  targetPracticeId: string;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const PlayerEngineContext = createContext<PlayerEngineApi | null>(null);

function GlobalPlayerEngine({
  session,
  sessionGeneration,
  sessionGenerationRef,
  stopEngineRef,
  persistentAudioRef,
  queueHasNext,
  queueHasPrevious,
  skipAutoplayUrlSync,
  onTracksExhausted,
  onRequestPreviousProduct,
  children,
}: {
  session: LoadSessionInput;
  sessionGeneration: number;
  sessionGenerationRef: MutableRefObject<number>;
  stopEngineRef: MutableRefObject<(() => void) | null>;
  persistentAudioRef: MutableRefObject<HTMLAudioElement | null>;
  queueHasNext: boolean;
  queueHasPrevious: boolean;
  /** Queue path already called router.replace — avoid a duplicate replace. */
  skipAutoplayUrlSync: boolean;
  onTracksExhausted: (
    fromPracticeId: string,
  ) => Promise<"advanced" | "completed" | "none">;
  onRequestPreviousProduct: () => Promise<boolean>;
  children: ReactNode;
}) {
  const router = useRouter();
  const recoveryTimerRef = useRef<number | null>(null);

  const handleInitialAutoplayAttempted = useCallback(() => {
    if (!session.requestAutoplay || skipAutoplayUrlSync) {
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
  }, [
    router,
    session.authorSlug,
    session.productSlug,
    session.requestAutoplay,
    skipAutoplayUrlSync,
  ]);

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
    sessionGeneration,
    registerCleanup,
    guestProgressMode: Boolean(session.guestProgressMode),
    guestProgressMeta: session.guestProgressMeta,
    audioRef: persistentAudioRef,
  });

  const {
    audioRef,
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
    src: engine.src,
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
    const trackId = currentTrack?.id;

    if (!trackId) {
      return;
    }

    const persistPlaybackSnapshot = () => {
      writeDesktopPlayerLastSession({
        practiceId: session.practiceId,
        authorSlug: session.authorSlug,
        productSlug: session.productSlug,
        audioItemId: trackId,
        positionSeconds: audioRef.current?.currentTime ?? currentTime,
      });
    };

    if (!isPlaying) {
      persistPlaybackSnapshot();
      return;
    }

    const intervalId = window.setInterval(persistPlaybackSnapshot, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    audioRef,
    currentTime,
    currentTrack?.id,
    isPlaying,
    session.authorSlug,
    session.practiceId,
    session.productSlug,
  ]);

  useEffect(() => {
    const handlePageHide = () => {
      const trackId = currentTrack?.id;

      if (!trackId) {
        return;
      }

      writeDesktopPlayerLastSession({
        practiceId: session.practiceId,
        authorSlug: session.authorSlug,
        productSlug: session.productSlug,
        audioItemId: trackId,
        positionSeconds: audioRef.current?.currentTime ?? currentTime,
      });
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [
    audioRef,
    currentTime,
    currentTrack?.id,
    session.authorSlug,
    session.practiceId,
    session.productSlug,
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
    const activeCoverUrl =
      currentTrack?.coverImageUrl ?? session.coverImageUrl;
    const artwork = activeCoverUrl
      ? [
          {
            src: activeCoverUrl,
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
    currentTrack?.coverImageUrl,
    displayDuration,
    isPlaying,
    playbackRate,
    session.authorName,
    session.coverImageUrl,
    session.practiceTitle,
  ]);

  return (
    <PlayerEngineContext.Provider value={playerContextValue}>
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
  const [desktopPlayerRestoreState, setDesktopPlayerRestoreState] =
    useState<DesktopPlayerRestoreState>("pending");
  const [playbackInstanceId, setPlaybackInstanceId] = useState(0);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const sessionGenerationRef = useRef(0);
  const stopEngineRef = useRef<(() => void) | null>(null);
  /** Survives engine remounts so iOS keeps the unlocked media element. */
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<LoadSessionInput | null>(null);
  const activeQueueRef = useRef<PlaylistQueue | null>(null);
  const transitionLockRef = useRef(false);
  const queueDrivenPracticeIdsRef = useRef<Set<string>>(new Set());
  /** Explicit from→to token for internal queue navigation (not URL timing). */
  const pendingQueueNavigationRef = useRef<PendingQueueNavigation | null>(null);
  const pendingQueueNavigationTokenRef = useRef(0);
  /** Practice id that already triggered cross-product advance (ended/Next dedupe). */
  const lastExhaustedPracticeIdRef = useRef<string | null>(null);
  const pendingNavSafetyTimerRef = useRef<number | null>(null);
  const desktopPlayerRestoreAttemptedRef = useRef(false);

  const clearPendingQueueNavigation = useCallback(() => {
    pendingQueueNavigationRef.current = null;
    if (pendingNavSafetyTimerRef.current !== null) {
      window.clearTimeout(pendingNavSafetyTimerRef.current);
      pendingNavSafetyTimerRef.current = null;
    }
  }, []);

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
    clearPendingQueueNavigation();
    lastExhaustedPracticeIdRef.current = null;
  }, [clearPendingQueueNavigation]);

  const loadSession = useCallback((input: LoadSessionInput) => {
    setDismissedPracticeId(null);

    const requestAutoplay = input.requestAutoplay ?? false;
    const current = sessionRef.current;
    let shouldBumpGeneration = true;
    let shouldBumpPlaybackInstance = true;

    if (current?.practiceId === input.practiceId) {
      shouldBumpPlaybackInstance =
        requestAutoplay && !current.requestAutoplay;
      shouldBumpGeneration = shouldBumpPlaybackInstance;
    }

    if (shouldBumpGeneration) {
      sessionGenerationRef.current += 1;
      setSessionGeneration(sessionGenerationRef.current);
    }

    setSession((previous) => {
      if (previous?.practiceId === input.practiceId) {
        if (shouldBumpPlaybackInstance) {
          setPlaybackInstanceId((value) => value + 1);
        }

        return {
          ...previous,
          ...input,
          requestAutoplay,
        };
      }

      setPlaybackInstanceId((value) => value + 1);
      return input;
    });
  }, []);

  const stopAndClear = useCallback(() => {
    sessionGenerationRef.current += 1;
    setSessionGeneration(sessionGenerationRef.current);
    setDismissedPracticeId(sessionRef.current?.practiceId ?? null);
    stopEngineRef.current?.();
    stopEngineRef.current = null;
    clearMediaSession();
    clearDesktopPlayerLastSession();
    setSession(null);
    clearPlaylistQueue();
    setNoticeMessage(null);
  }, [clearPlaylistQueue]);

  const mergeGuestProgressIntoSession = useCallback(
    (input: LoadSessionInput): LoadSessionInput => {
      const withDesktopPlayback = mergeDesktopPlaybackIntoSession(
        input,
        readDesktopPlayerLastSession(),
      );

      const guestProgress = readGuestPracticeProgress(withDesktopPlayback.practiceId);

      if (!guestProgress) {
        return withDesktopPlayback;
      }

      const guestEntries = guestProgressToListenEntries(guestProgress);

      if (guestEntries.length === 0) {
        return withDesktopPlayback;
      }

      if (withDesktopPlayback.initialProgress.length === 0) {
        return {
          ...withDesktopPlayback,
          initialProgress: guestEntries,
          guestProgressMode: true,
          guestProgressMeta: {
            practiceSlug: guestProgress.practiceSlug,
            source: guestProgress.source,
            campaign: guestProgress.campaign,
          },
        };
      }

      const merged = new Map(
        withDesktopPlayback.initialProgress.map((entry) => [entry.audioItemId, entry]),
      );

      for (const entry of guestEntries) {
        merged.set(entry.audioItemId, entry);
      }

      return {
        ...withDesktopPlayback,
        initialProgress: [...merged.values()],
        guestProgressMode: true,
        guestProgressMeta: {
          practiceSlug: guestProgress.practiceSlug,
          source: guestProgress.source,
          campaign: guestProgress.campaign,
        },
      };
    },
    [],
  );

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
    const pending = pendingQueueNavigationRef.current;
    if (
      pending &&
      (practiceId === pending.targetPracticeId ||
        practiceId === pending.fromPracticeId)
    ) {
      return true;
    }

    const queue = activeQueueRef.current;
    const current = queue?.entries[queue.currentIndex];
    return Boolean(current && getQueueEntryPracticeId(current) === practiceId);
  }, []);

  const confirmInternalQueueNavigation = useCallback((practiceId: string) => {
    const pending = pendingQueueNavigationRef.current;
    if (pending && pending.targetPracticeId === practiceId) {
      clearPendingQueueNavigation();
    }
  }, [clearPendingQueueNavigation]);

  const beginPendingQueueNavigation = useCallback(
    (fromPracticeId: string | null, targetPracticeId: string) => {
      pendingQueueNavigationTokenRef.current += 1;
      const token = pendingQueueNavigationTokenRef.current;
      pendingQueueNavigationRef.current = {
        token,
        fromPracticeId,
        targetPracticeId,
      };

      if (pendingNavSafetyTimerRef.current !== null) {
        window.clearTimeout(pendingNavSafetyTimerRef.current);
      }

      // Never leave the token stuck after a failed/hung transition.
      pendingNavSafetyTimerRef.current = window.setTimeout(() => {
        const current = pendingQueueNavigationRef.current;
        if (current?.token === token) {
          pendingQueueNavigationRef.current = null;
        }
        pendingNavSafetyTimerRef.current = null;
      }, 15_000);
    },
    [],
  );

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

          const fromPracticeId =
            sessionRef.current?.practiceId ??
            (queue.entries[queue.currentIndex]
              ? getQueueEntryPracticeId(queue.entries[queue.currentIndex])
              : null);

          // Mark pending from→to BEFORE state/URL updates so the still-mounted
          // previous ListenPageClient does not clear the queue.
          beginPendingQueueNavigation(
            fromPracticeId,
            loaded.session.practiceId,
          );

          setActiveQueue(nextQueue);
          activeQueueRef.current = nextQueue;
          setQueueCompleted(false);
          queueDrivenPracticeIdsRef.current = new Set(
            nextQueue.entries.map((item) => getQueueEntryPracticeId(item)),
          );

          // Remount engine state for the new product; <audio> stays persistent.
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

          // Returning to a previously exhausted product must allow a new exhaust.
          if (
            lastExhaustedPracticeIdRef.current === loaded.session.practiceId
          ) {
            lastExhaustedPracticeIdRef.current = null;
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
    [beginPendingQueueNavigation, loadSession, router],
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
    if (!session) {
      return;
    }

    writeDesktopPlayerLastSession({
      practiceId: session.practiceId,
      authorSlug: session.authorSlug,
      productSlug: session.productSlug,
    });
  }, [session]);

  useEffect(() => {
    if (session || desktopPlayerRestoreAttemptedRef.current) {
      return;
    }

    desktopPlayerRestoreAttemptedRef.current = true;
    let cancelled = false;

    async function restoreDesktopPlayerSession() {
      setDesktopPlayerRestoreState("restoring");

      const restoreSession = (payload: LoadSessionInput) => {
        if (cancelled) {
          return;
        }

        loadSession(
          mergeGuestProgressIntoSession({
            ...payload,
            requestAutoplay: false,
          }),
        );
        setDesktopPlayerRestoreState("ready");
      };

      const persisted = readDesktopPlayerLastSession();

      if (persisted) {
        const loaded = await fetchListenSessionPayload(
          persisted.authorSlug,
          persisted.productSlug,
        );

        if (loaded.ok) {
          restoreSession(loaded.session);
          return;
        }
      }

      try {
        const response = await fetch("/api/listen/resume-session", {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });

        if (response.ok) {
          const data = (await response.json()) as {
            ok?: boolean;
            session?: LoadSessionInput;
          };

          if (data.ok && data.session) {
            restoreSession(data.session);
            return;
          }
        }
      } catch {
        // Fall through to empty desktop bar.
      }

      if (!cancelled) {
        clearDesktopPlayerLastSession();
        setDesktopPlayerRestoreState("ready");
      }
    }

    void restoreDesktopPlayerSession();

    return () => {
      cancelled = true;
    };
  }, [loadSession, mergeGuestProgressIntoSession, session]);

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
      desktopPlayerRestoreState,
      activeQueue,
      currentQueueEntry,
      queueCompleted,
      loadPlaylistQueue,
      clearPlaylistQueue,
      restartPlaylistQueue,
      returnToPlaylistSource,
      isQueueDrivenPractice,
      isInternalQueueNavigation,
      confirmInternalQueueNavigation,
      noticeMessage,
      clearNoticeMessage,
    }),
    [
      activeQueue,
      clearNoticeMessage,
      clearPlaylistQueue,
      confirmInternalQueueNavigation,
      currentQueueEntry,
      desktopPlayerRestoreState,
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
      {/* Persistent media element — must not remount across queue products (iOS). */}
      <audio
        ref={persistentAudioRef}
        preload="metadata"
        playsInline
        className="global-audio-element"
      />
      {session ? (
        <GlobalPlayerEngine
          key={`${session.practiceId}:${playbackInstanceId}`}
          session={session}
          sessionGeneration={sessionGeneration}
          sessionGenerationRef={sessionGenerationRef}
          stopEngineRef={stopEngineRef}
          persistentAudioRef={persistentAudioRef}
          queueHasNext={queueHasNext}
          queueHasPrevious={queueHasPrevious}
          skipAutoplayUrlSync={Boolean(activeQueue)}
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
