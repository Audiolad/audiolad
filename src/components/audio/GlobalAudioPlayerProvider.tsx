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
import { buildListenPath } from "@/lib/products/paths";
import { createClient } from "@/lib/supabase/client";

export const GLOBAL_MINI_PLAYER_HEIGHT_PX = 72;

type PlayerEngineApi = ReturnType<typeof useSequentialPlayer>;

const SessionContext = createContext<{
  session: LoadSessionInput | null;
  dismissedPracticeId: string | null;
  loadSession: (input: LoadSessionInput) => void;
  stopAndClear: () => void;
  openFullPlayer: () => void;
  showMiniPlayer: boolean;
} | null>(null);

const PlayerEngineContext = createContext<PlayerEngineApi | null>(null);

function GlobalPlayerEngine({
  session,
  sessionGenerationRef,
  stopEngineRef,
  children,
}: {
  session: LoadSessionInput;
  sessionGenerationRef: MutableRefObject<number>;
  stopEngineRef: MutableRefObject<(() => void) | null>;
  children: ReactNode;
}) {
  const router = useRouter();
  const recoveryTimerRef = useRef<number | null>(null);

  const handleInitialAutoplayAttempted = useCallback(() => {
    if (!session.requestAutoplay) {
      return;
    }

    router.replace(buildListenPath(session.authorSlug, session.productSlug), {
      scroll: false,
    });
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
  const sessionGenerationRef = useRef(0);
  const stopEngineRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef<LoadSessionInput | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
  }, []);

  const openFullPlayer = useCallback(() => {
    if (!session) {
      return;
    }

    router.push(buildListenPath(session.authorSlug, session.productSlug));
  }, [router, session]);

  const showMiniPlayer = Boolean(
    session && session.tracks.length > 0 && !isListenPlayerPathname(pathname),
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
    }),
    [
      dismissedPracticeId,
      loadSession,
      openFullPlayer,
      session,
      showMiniPlayer,
      stopAndClear,
    ],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      {session ? (
        <GlobalPlayerEngine
          key={session.practiceId}
          session={session}
          sessionGenerationRef={sessionGenerationRef}
          stopEngineRef={stopEngineRef}
        >
          {children}
          <GlobalMiniPlayer />
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
