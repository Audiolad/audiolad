"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import {
  calculateProgramProgressPercent,
  isTrackCompleted,
  resolveInitialPlayback,
} from "@/lib/listen/progress";
import type { ListenProgressEntry, ListenTrack } from "@/lib/listen/types";

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const;
const PROGRESS_SAVE_INTERVAL_MS = 12_000;
const PREVIOUS_TRACK_THRESHOLD_SECONDS = 3;

type PendingSavePayload = {
  audioItemId: string;
  positionSeconds: number;
  completed: boolean;
};

function drainPendingSave(
  pendingRef: { current: PendingSavePayload | null },
  saver: (
    audioItemId: string,
    positionSeconds: number,
    completed: boolean,
    options?: { force?: boolean },
  ) => void,
) {
  const next = pendingRef.current;

  if (!next) {
    return;
  }

  pendingRef.current = null;
  saver(next.audioItemId, next.positionSeconds, next.completed, { force: true });
}

import { buildListenApiBase } from "@/lib/products/paths";
import {
  buildGuestProgressPayload,
  clearGuestPracticeProgress,
  saveGuestPracticeProgress,
} from "@/lib/promo/guest-progress";
import {
  shouldSkipIntervalProgressSave,
} from "@/lib/promo/progress-interval";
import {
  syncMediaSessionPlaybackState,
  verifyRealPlayback,
  waitForPlayingEvent,
} from "@/lib/audio/playback-recovery";
import { logPlayerDebug } from "@/lib/audio/player-debug";

type TracksExhaustedResult = "advanced" | "completed" | "none";

type UseSequentialPlayerOptions = {
  authorSlug: string;
  productSlug: string;
  practiceId: string;
  tracks: ListenTrack[];
  initialProgress: ListenProgressEntry[];
  requestInitialAutoplay?: boolean;
  forceStartAtBeginning?: boolean;
  initialTrackId?: string | null;
  /** When true, Next stays enabled on the last track (queue will advance). */
  queueHasNext?: boolean;
  /** When true, Previous can leave the first track for the prior queue entry. */
  queueHasPrevious?: boolean;
  onInitialAutoplayAttempted?: () => void;
  /**
   * Called when the last track ends or Next is pressed on the last track.
   * Receives the practiceId that exhausted so duplicate ended/Next cannot advance twice.
   */
  onTracksExhausted?: (
    fromPracticeId: string,
  ) => Promise<TracksExhaustedResult>;
  /** Called when Previous is pressed on the first track (after restart threshold). */
  onRequestPreviousProduct?: () => Promise<boolean>;
  getSessionGeneration?: () => number;
  /** Reactive session generation — retriggers signed URL load when session is refreshed. */
  sessionGeneration?: number;
  registerCleanup?: (cleanup: () => void) => void;
  guestProgressMode?: boolean;
  guestProgressMeta?: {
    practiceSlug: string;
    source?: string | null;
    campaign?: string | null;
  };
  /**
   * Shared <audio> element owned by GlobalAudioPlayerProvider so engine remounts
   * do not recreate the media element (required for iOS autoplay unlock).
   */
  audioRef: MutableRefObject<HTMLAudioElement | null>;
};

type SwitchTrackOptions = {
  autoPlay?: boolean;
  startPosition?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useSequentialPlayer({
  authorSlug,
  productSlug,
  practiceId,
  tracks,
  initialProgress,
  requestInitialAutoplay = false,
  forceStartAtBeginning = false,
  initialTrackId = null,
  queueHasNext = false,
  queueHasPrevious = false,
  onInitialAutoplayAttempted,
  onTracksExhausted,
  onRequestPreviousProduct,
  getSessionGeneration,
  sessionGeneration = 0,
  registerCleanup,
  guestProgressMode = false,
  guestProgressMeta,
  audioRef,
}: UseSequentialPlayerOptions) {
  const urlRequestRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<PendingSavePayload | null>(null);
  const lastSaveAtRef = useRef(0);
  const progressRef = useRef<ListenProgressEntry[]>(initialProgress);
  const wasPlayingBeforeSwitchRef = useRef(false);
  const initialAutoplayPendingRef = useRef(requestInitialAutoplay);
  const initialAutoplayAttemptedRef = useRef(false);
  const userWantsPlaybackRef = useRef(false);
  const userInitiatedPauseRef = useRef(false);
  const lastRecoveryAttemptRef = useRef(0);
  const recoveryUrlAttemptedRef = useRef(false);
  const recoveryPromiseRef = useRef<Promise<boolean> | null>(null);
  const recoveryAttemptIdRef = useRef(0);
  const resumePositionRef = useRef(0);
  const isPlayingRef = useRef(false);
  const getSessionGenerationRef = useRef(getSessionGeneration);
  const onTracksExhaustedRef = useRef(onTracksExhausted);
  const onRequestPreviousProductRef = useRef(onRequestPreviousProduct);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const currentTrackRef = useRef<ListenTrack | null>(null);
  const guestProgressModeRef = useRef(guestProgressMode);
  const guestProgressMetaRef = useRef(guestProgressMeta);
  const practiceIdRef = useRef(practiceId);
  const lastIntervalSavedPositionRef = useRef(-1);
  const flushProgressRef = useRef<() => Promise<void>>(async () => {});
  const loadSignedUrlRef = useRef<(audioItemId: string) => Promise<void>>(
    async () => {},
  );

  const PREPARE_AUDIO_MESSAGE = "Подготавливаем аудио…";
  const PREPARE_AUDIO_ERROR = "Не удалось подготовить аудио.";

  useEffect(() => {
    getSessionGenerationRef.current = getSessionGeneration;
  }, [getSessionGeneration]);

  useEffect(() => {
    onTracksExhaustedRef.current = onTracksExhausted;
  }, [onTracksExhausted]);

  useEffect(() => {
    onRequestPreviousProductRef.current = onRequestPreviousProduct;
  }, [onRequestPreviousProduct]);

  const initialPlayback = useMemo(() => {
    if (forceStartAtBeginning) {
      return {
        trackIndex: 0,
        positionSeconds: 0,
        allCompleted: false,
      };
    }

    if (initialTrackId) {
      const selectedIndex = tracks.findIndex((track) => track.id === initialTrackId);

      if (selectedIndex >= 0) {
        return {
          trackIndex: selectedIndex,
          positionSeconds: 0,
          allCompleted: false,
        };
      }
    }

    return resolveInitialPlayback(tracks, initialProgress);
  }, [forceStartAtBeginning, initialProgress, initialTrackId, tracks]);

  const [currentTrackIndex, setCurrentTrackIndex] = useState(
    initialPlayback.trackIndex,
  );
  const [src, setSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUrlLoading, setIsUrlLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [playbackRateIndex, setPlaybackRateIndex] = useState(1);
  const [statusMessage, setStatusMessage] = useState("Подготавливаем аудио…");
  const [autoplayHint, setAutoplayHint] = useState<string | null>(null);
  const [progress, setProgress] = useState<ListenProgressEntry[]>(
    initialProgress,
  );
  const [programCompleted, setProgramCompleted] = useState(
    initialPlayback.allCompleted,
  );
  const [pendingStartPosition, setPendingStartPosition] = useState(
    initialPlayback.positionSeconds,
  );

  const isMultiTrack = tracks.length > 1;
  const currentTrack = tracks[currentTrackIndex] ?? null;

  const debugSnapshot = useCallback(
    (source: string, event: string) => {
      logPlayerDebug(source, event, {
        audio: audioRef.current,
        isPlaying: isPlayingRef.current,
        isRecovering,
        userWantsPlayback: userWantsPlaybackRef.current,
        sessionGeneration: getSessionGenerationRef.current?.() ?? 0,
      });
    },
    [isRecovering],
  );

  const setPlayingState = useCallback((next: boolean) => {
    isPlayingRef.current = next;
    setIsPlaying(next);
    syncMediaSessionPlaybackState(next);
  }, []);

  useEffect(() => {
    if (requestInitialAutoplay && !initialAutoplayAttemptedRef.current) {
      initialAutoplayPendingRef.current = true;
    }
  }, [requestInitialAutoplay]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    guestProgressModeRef.current = guestProgressMode;
  }, [guestProgressMode]);

  useEffect(() => {
    guestProgressMetaRef.current = guestProgressMeta;
  }, [guestProgressMeta]);

  useEffect(() => {
    practiceIdRef.current = practiceId;
  }, [practiceId]);

  useEffect(() => {
    lastIntervalSavedPositionRef.current = -1;
  }, [currentTrack?.id, practiceId]);

  const updateProgressEntry = useCallback(
    (audioItemId: string, positionSeconds: number, completed: boolean) => {
      setProgress((current) => {
        const next = [...current];
        const index = next.findIndex((entry) => entry.audioItemId === audioItemId);

        if (index >= 0) {
          next[index] = { audioItemId, positionSeconds, completed };
        } else {
          next.push({ audioItemId, positionSeconds, completed });
        }

        return next;
      });
    },
    [],
  );

  const listenApiBase = buildListenApiBase(authorSlug, productSlug);
  const listenApiBaseRef = useRef(listenApiBase);
  const saveProgressRef = useRef<
    (
      audioItemId: string,
      positionSeconds: number,
      completed: boolean,
      options?: { force?: boolean },
    ) => Promise<void>
  >(async () => {});

  useEffect(() => {
    listenApiBaseRef.current = listenApiBase;
  }, [listenApiBase]);

  const saveProgress = useCallback(
    async (
      audioItemId: string,
      positionSeconds: number,
      completed: boolean,
      options?: { force?: boolean },
    ) => {
      if (audioItemId.startsWith("legacy-")) {
        return;
      }

      updateProgressEntry(audioItemId, positionSeconds, completed);

      if (guestProgressMode && guestProgressMeta) {
        const track = tracks.find((item) => item.id === audioItemId);

        saveGuestPracticeProgress(
          buildGuestProgressPayload({
            practiceId,
            practiceSlug: guestProgressMeta.practiceSlug,
            trackId: audioItemId,
            positionSeconds,
            durationSeconds: track?.durationSeconds ?? null,
            started: positionSeconds > 0 || completed,
            completed,
            source: guestProgressMeta.source,
            campaign: guestProgressMeta.campaign,
          }),
          options,
        );
        return;
      }

      pendingSaveRef.current = {
        audioItemId,
        positionSeconds,
        completed,
      };

      const now = Date.now();

      if (
        !options?.force &&
        now - lastSaveAtRef.current < PROGRESS_SAVE_INTERVAL_MS
      ) {
        return;
      }

      if (saveInFlightRef.current) {
        return;
      }

      const payload = pendingSaveRef.current;
      pendingSaveRef.current = null;
      saveInFlightRef.current = true;

      try {
        const response = await fetch(`${listenApiBaseRef.current}/progress`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_item_id: payload.audioItemId,
            position_seconds: Math.floor(payload.positionSeconds),
            completed: payload.completed,
          }),
        });

        if (!response.ok) {
          setProgressError("Не удалось сохранить прогресс прослушивания.");
          return;
        }

        lastSaveAtRef.current = Date.now();
        setProgressError(null);
      } catch {
        setProgressError("Не удалось сохранить прогресс прослушивания.");
      } finally {
        saveInFlightRef.current = false;
        drainPendingSave(pendingSaveRef, (...args) => {
          void saveProgressRef.current(...args);
        });
      }
    },
    [guestProgressMeta, guestProgressMode, practiceId, tracks, updateProgressEntry],
  );

  useEffect(() => {
    saveProgressRef.current = saveProgress;
  }, [saveProgress]);

  const flushProgress = useCallback(async () => {
    const track = currentTrackRef.current;

    if (!track) {
      return;
    }

    const audio = audioRef.current;
    const position = audio?.currentTime ?? currentTimeRef.current;
    const trackDuration =
      durationRef.current > 0 ? durationRef.current : track.durationSeconds;

    await saveProgress(
      track.id,
      position,
      isTrackCompleted(
        trackDuration,
        position,
        progressRef.current.find((entry) => entry.audioItemId === track.id)
          ?.completed ?? false,
      ),
      { force: true },
    );

    lastIntervalSavedPositionRef.current = position;
  }, [saveProgress]);

  useEffect(() => {
    flushProgressRef.current = flushProgress;
  }, [flushProgress]);

  const loadSignedUrl = useCallback(
    async (audioItemId: string) => {
      const requestId = urlRequestRef.current + 1;
      const capturedGeneration = getSessionGenerationRef.current?.() ?? 0;
      urlRequestRef.current = requestId;

      const isStale = () =>
        requestId !== urlRequestRef.current ||
        capturedGeneration !== (getSessionGenerationRef.current?.() ?? 0);

      setIsUrlLoading(true);
      setUrlError(null);
      setStatusMessage(PREPARE_AUDIO_MESSAGE);

      let settled = false;

      try {
        const response = await fetch(
          `${listenApiBase}/audio/${audioItemId}`,
        );

        if (isStale()) {
          return;
        }

        const payload = (await response.json()) as {
          url?: string;
          error?: string;
        };

        if (isStale()) {
          return;
        }

        if (!response.ok || !payload.url) {
          if (response.status === 403) {
            setUrlError("Доступ к прослушиванию не открыт.");
          } else if (response.status === 404) {
            setUrlError("Аудиофайл не найден.");
          } else {
            setUrlError(PREPARE_AUDIO_ERROR);
          }

          setSrc(null);
          setIsLoading(false);
          settled = true;
          return;
        }

        setSrc(payload.url);
        settled = true;
      } catch {
        if (isStale()) {
          return;
        }

        setUrlError(PREPARE_AUDIO_ERROR);
        setSrc(null);
        setIsLoading(false);
        settled = true;
      } finally {
        if (isStale()) {
          if (requestId === urlRequestRef.current) {
            void loadSignedUrlRef.current(audioItemId);
          }
          return;
        }

        if (settled) {
          setIsUrlLoading(false);
        }
      }
    },
    [listenApiBase],
  );

  useEffect(() => {
    loadSignedUrlRef.current = loadSignedUrl;
  }, [loadSignedUrl]);

  const switchToTrack = useCallback(
    async (nextIndex: number, options?: SwitchTrackOptions) => {
      if (nextIndex < 0 || nextIndex >= tracks.length) {
        return;
      }

      const previousTrack = tracks[currentTrackIndex];

      if (previousTrack) {
        const previousPosition =
          audioRef.current?.currentTime ?? currentTimeRef.current;

        await saveProgress(
          previousTrack.id,
          previousPosition,
          isTrackCompleted(
            previousTrack.durationSeconds,
            previousPosition,
            progressRef.current.find(
              (entry) => entry.audioItemId === previousTrack.id,
            )?.completed ?? false,
          ),
          { force: true },
        );
      }

      wasPlayingBeforeSwitchRef.current = options?.autoPlay ?? isPlaying;
      setCurrentTrackIndex(nextIndex);
      setPendingStartPosition(options?.startPosition ?? 0);
      setCurrentTime(options?.startPosition ?? 0);
      setDuration(0);
      setPlayerError(null);
      setProgramCompleted(false);
      setIsLoading(true);

      const nextTrack = tracks[nextIndex];
      await loadSignedUrl(nextTrack.id);
    },
    [currentTrackIndex, isPlaying, loadSignedUrl, saveProgress, tracks],
  );

  useEffect(() => {
    if (!currentTrack?.id) {
      return;
    }

    const trackId = currentTrack.id;

    queueMicrotask(() => {
      void loadSignedUrl(trackId);
    });
  }, [currentTrack?.id, sessionGeneration, loadSignedUrl]);

  const applySrcToAudioElement = useCallback(() => {
    const audio = audioRef.current;

    if (!audio || !src) {
      return false;
    }

    // Imperative src — required when <audio> lives outside this component.
    if (audio.getAttribute("src") !== src) {
      audio.src = src;
    }

    audio.load();
    setIsLoading(true);
    setStatusMessage(PREPARE_AUDIO_MESSAGE);
    return true;
  }, [audioRef, src]);

  useEffect(() => {
    if (!src) {
      return;
    }

    if (applySrcToAudioElement()) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30;

    const tryApply = () => {
      if (cancelled) {
        return;
      }

      if (applySrcToAudioElement()) {
        return;
      }

      attempts += 1;

      if (attempts < maxAttempts) {
        requestAnimationFrame(tryApply);
        return;
      }

      setUrlError(PREPARE_AUDIO_ERROR);
      setIsUrlLoading(false);
      setIsLoading(false);
      setStatusMessage("");
    };

    requestAnimationFrame(tryApply);

    return () => {
      cancelled = true;
    };
  }, [applySrcToAudioElement, src]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const applyStartPosition = () => {
      if (pendingStartPosition <= 0) {
        return;
      }

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = clamp(pendingStartPosition, 0, audio.duration);
        setCurrentTime(audio.currentTime);
        setPendingStartPosition(0);
      }
    };

    const updateDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        setIsLoading(false);
        setStatusMessage("");
        applyStartPosition();
      }
    };

    const handleTimeUpdate = () => {
      currentTimeRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);
    };

    const handlePlay = () => {
      setPlayerError(null);
      setStatusMessage("");
    };

    const handlePlaying = () => {
      setPlayingState(true);
      setIsRecovering(false);
      setPlayerError(null);
      setStatusMessage("");
      setAutoplayHint(null);
      recoveryUrlAttemptedRef.current = false;
      debugSnapshot("audio-event", "playing");
    };

    const handlePause = () => {
      setPlayingState(false);
      debugSnapshot("audio-event", "pause");
    };

    const handleWaiting = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setStatusMessage("Загрузка…");
      }

      debugSnapshot("audio-event", "waiting");
    };

    const handleCanPlay = () => {
      setIsLoading(false);

      if (!playerError) {
        setStatusMessage("");
      }

      applyStartPosition();

      if (wasPlayingBeforeSwitchRef.current) {
        wasPlayingBeforeSwitchRef.current = false;
        void audio.play().catch(() => {
          setPlayerError("Нажмите ещё раз, чтобы начать прослушивание.");
        });
        return;
      }

      if (
        initialAutoplayPendingRef.current &&
        !initialAutoplayAttemptedRef.current
      ) {
        initialAutoplayPendingRef.current = false;
        initialAutoplayAttemptedRef.current = true;
        onInitialAutoplayAttempted?.();
        userWantsPlaybackRef.current = true;

        void audio.play().catch((error: unknown) => {
          const name =
            error && typeof error === "object" && "name" in error
              ? String((error as { name?: string }).name)
              : "unknown";
          debugSnapshot("autoplay", `blocked:${name}`);
          userWantsPlaybackRef.current = false;
          setAutoplayHint("Нажмите Play, чтобы начать прослушивание");
        });
      }
    };

    const handleStalled = () => {
      setPlayingState(false);
      debugSnapshot("audio-event", "stalled");
    };

    const handleEnded = async () => {
      if (!currentTrack) {
        return;
      }

      setPlayingState(false);
      setCurrentTime(audio.duration || 0);

      await saveProgress(currentTrack.id, audio.duration || 0, true, {
        force: true,
      });

      if (currentTrackIndex < tracks.length - 1) {
        await switchToTrack(currentTrackIndex + 1, {
          autoPlay: true,
          startPosition: 0,
        });
        return;
      }

      if (onTracksExhaustedRef.current) {
        const result = await onTracksExhaustedRef.current(practiceId);

        if (result === "advanced" || result === "completed") {
          userWantsPlaybackRef.current = result === "advanced";
          return;
        }
      }

      userWantsPlaybackRef.current = false;
      setProgramCompleted(true);
    };

    const handleError = () => {
      setPlayingState(false);
      setIsRecovering(false);

      if (!userInitiatedPauseRef.current) {
        // Keep user intent — they may want to retry after foreground recovery.
      }

      setIsLoading(false);

      const mediaError = audio.error;

      if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setPlayerError("Формат аудио не поддерживается на этом устройстве.");
      } else {
        setPlayerError(
          "Не удалось загрузить аудио. Проверьте соединение и попробуйте ещё раз.",
        );
      }

      setStatusMessage("");
    };

    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audio.playbackRate = PLAYBACK_RATES[playbackRateIndex];

    return () => {
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [
    currentTrack,
    currentTrackIndex,
    playbackRateIndex,
    pendingStartPosition,
    playerError,
    practiceId,
    switchToTrack,
    tracks.length,
    saveProgress,
    src,
    onInitialAutoplayAttempted,
    debugSnapshot,
    setPlayingState,
  ]);

  useEffect(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.playbackRate = PLAYBACK_RATES[playbackRateIndex];
    }
  }, [playbackRateIndex]);

  const runIntervalProgressSave = useCallback(() => {
    const track = currentTrackRef.current;

    if (!track || !practiceIdRef.current) {
      return;
    }

    const audio = audioRef.current;
    const position = audio?.currentTime ?? currentTimeRef.current;
    const trackDuration =
      durationRef.current > 0
        ? durationRef.current
        : track.durationSeconds ?? null;

    if (
      shouldSkipIntervalProgressSave(
        {
          practiceId: practiceIdRef.current,
          trackId: track.id,
          positionSeconds: position,
          durationSeconds: trackDuration,
          isPlaying: isPlayingRef.current,
        },
        lastIntervalSavedPositionRef.current,
      )
    ) {
      return;
    }

    void saveProgressRef.current(
      track.id,
      position,
      isTrackCompleted(
        trackDuration,
        position,
        progressRef.current.find((entry) => entry.audioItemId === track.id)
          ?.completed ?? false,
      ),
    );

    lastIntervalSavedPositionRef.current = position;
  }, []);

  useEffect(() => {
    if (!isPlaying || !currentTrack?.id) {
      return;
    }

    const intervalId = window.setInterval(() => {
      runIntervalProgressSave();
    }, PROGRESS_SAVE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentTrack?.id, isPlaying, practiceId, runIntervalProgressSave]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushProgressRef.current();
      }
    };

    const handlePageHide = () => {
      void flushProgressRef.current();
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  const hasValidDuration = Number.isFinite(duration) && duration > 0;
  const displayDuration = hasValidDuration
    ? duration
    : currentTrack?.durationSeconds && currentTrack.durationSeconds > 0
      ? currentTrack.durationSeconds
      : 0;

  const programProgressPercent = useMemo(() => {
    if (!isMultiTrack || !currentTrack) {
      return 0;
    }

    return calculateProgramProgressPercent(
      tracks.map((track) => ({
        id: track.id,
        durationSeconds: track.durationSeconds,
      })),
      progress,
      currentTrack.id,
      currentTime,
    );
  }, [currentTime, currentTrack, isMultiTrack, progress, tracks]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;

    if (!audio || !src) {
      return;
    }

    if (audio.ended) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }

    if (!audio.paused) {
      userWantsPlaybackRef.current = false;
      userInitiatedPauseRef.current = true;
      audio.pause();
      userInitiatedPauseRef.current = false;
      await flushProgress();
      return;
    }

    userWantsPlaybackRef.current = true;
    recoveryUrlAttemptedRef.current = false;

    try {
      await audio.play();
      setPlayerError(null);
      setAutoplayHint(null);
    } catch {
      userWantsPlaybackRef.current = false;
      setPlayingState(false);
      setPlayerError("Нажмите ещё раз, чтобы начать прослушивание.");
    }
  };

  const handleSeekOffset = (offsetSeconds: number) => {
    const audio = audioRef.current;

    if (!audio || !hasValidDuration) {
      return;
    }

    const nextTime = clamp(audio.currentTime + offsetSeconds, 0, duration);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleRangeChange = (value: number) => {
    const audio = audioRef.current;

    if (!audio || !hasValidDuration) {
      return;
    }

    audio.currentTime = value;
    setCurrentTime(value);
  };

  const handlePreviousTrack = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.currentTime > PREVIOUS_TRACK_THRESHOLD_SECONDS) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    if (currentTrackIndex > 0) {
      await switchToTrack(currentTrackIndex - 1, {
        autoPlay: isPlaying,
        startPosition: 0,
      });
      return;
    }

    if (onRequestPreviousProductRef.current) {
      const moved = await onRequestPreviousProductRef.current();

      if (moved) {
        return;
      }
    }

    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const handleNextTrack = async () => {
    if (currentTrackIndex < tracks.length - 1) {
      await switchToTrack(currentTrackIndex + 1, {
        autoPlay: isPlaying,
        startPosition: 0,
      });
      return;
    }

    if (onTracksExhaustedRef.current) {
      await onTracksExhaustedRef.current(practiceId);
    }
  };

  const handleSelectTrack = async (index: number) => {
    if (index === currentTrackIndex) {
      return;
    }

    await switchToTrack(index, {
      autoPlay: isPlaying,
      startPosition: 0,
    });
  };

  const handlePlayTrackAtIndex = async (index: number) => {
    if (index < 0 || index >= tracks.length) {
      return;
    }

    if (index === currentTrackIndex) {
      const audio = audioRef.current;

      if (audio?.paused && src) {
        userWantsPlaybackRef.current = true;

        try {
          await audio.play();
        } catch {
          setAutoplayHint("Нажмите Play, чтобы начать прослушивание");
        }
      }

      return;
    }

    await switchToTrack(index, {
      autoPlay: true,
      startPosition: 0,
    });
  };

  const handleRetry = () => {
    if (!currentTrack) {
      return;
    }

    setPlayerError(null);
    setUrlError(null);
    setIsLoading(true);
    setIsUrlLoading(true);
    setStatusMessage(PREPARE_AUDIO_MESSAGE);
    setPendingStartPosition(currentTime);
    void loadSignedUrl(currentTrack.id);
  };

  const handleSpeedChange = () => {
    setPlaybackRateIndex((current) => (current + 1) % PLAYBACK_RATES.length);
  };

  const restartPlaybackFromBeginning = useCallback(
    async (options: { autoPlay: boolean }) => {
      userInitiatedPauseRef.current = false;
      userWantsPlaybackRef.current = options.autoPlay;
      setProgressError(null);
      setProgramCompleted(false);
      setProgress([]);
      progressRef.current = [];
      lastIntervalSavedPositionRef.current = -1;

      if (currentTrackIndex !== 0) {
        await switchToTrack(0, {
          autoPlay: options.autoPlay,
          startPosition: 0,
        });
        return;
      }

      const track = currentTrackRef.current;

      if (!track) {
        return;
      }

      setPendingStartPosition(0);
      setCurrentTime(0);

      const audio = audioRef.current;

      if (audio && src) {
        audio.currentTime = 0;

        if (options.autoPlay) {
          try {
            await audio.play();
          } catch {
            userWantsPlaybackRef.current = false;
            setAutoplayHint("Нажмите Play, чтобы начать прослушивание");
          }
        }
      } else {
        await switchToTrack(0, {
          autoPlay: options.autoPlay,
          startPosition: 0,
        });
        return;
      }

      await saveProgress(track.id, 0, false, { force: true });
    },
    [currentTrackIndex, saveProgress, src, switchToTrack],
  );

  const handleStartOver = async () => {
    try {
      if (guestProgressModeRef.current) {
        clearGuestPracticeProgress(practiceIdRef.current);
      } else {
        const response = await fetch(`${listenApiBase}/progress`, {
          method: "DELETE",
        });

        if (!response.ok) {
          setProgressError("Не удалось сбросить прогресс.");
          return;
        }
      }

      await restartPlaybackFromBeginning({ autoPlay: true });
    } catch {
      setProgressError("Не удалось сбросить прогресс.");
    }
  };

  const isTrackDone = useCallback(
    (trackId: string, trackDuration: number | null) => {
      const entry = progress.find((item) => item.audioItemId === trackId);
      return entry
        ? isTrackCompleted(trackDuration, entry.positionSeconds, entry.completed)
        : false;
    },
    [progress],
  );

  const performStopAndClear = useCallback(() => {
    recoveryAttemptIdRef.current += 1;
    recoveryPromiseRef.current = null;
    lastRecoveryAttemptRef.current = 0;
    recoveryUrlAttemptedRef.current = false;
    userWantsPlaybackRef.current = false;
    initialAutoplayPendingRef.current = false;
    wasPlayingBeforeSwitchRef.current = false;
    urlRequestRef.current += 1;

    void flushProgress();

    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setSrc(null);
    setPlayingState(false);
    setIsRecovering(false);
    setIsLoading(false);
    setIsUrlLoading(false);
    setPlayerError(null);
    setUrlError(null);
    setAutoplayHint(null);
    setStatusMessage("");
    debugSnapshot("stop-and-clear", "cleared");
  }, [debugSnapshot, flushProgress, setPlayingState]);

  useEffect(() => {
    registerCleanup?.(performStopAndClear);

    return () => {
      registerCleanup?.(() => {});
    };
  }, [performStopAndClear, registerCleanup]);

  const recoverPlaybackWhenVisible = useCallback(async (): Promise<boolean> => {
    if (document.visibilityState !== "visible") {
      return false;
    }

    if (!userWantsPlaybackRef.current) {
      return false;
    }

    if (recoveryPromiseRef.current) {
      return recoveryPromiseRef.current;
    }

    const attemptId = recoveryAttemptIdRef.current + 1;
    recoveryAttemptIdRef.current = attemptId;
    const generationAtStart = getSessionGenerationRef.current?.() ?? 0;

    const run = async (): Promise<boolean> => {
      const audio = audioRef.current;

      if (
        !audio?.src ||
        audio.ended ||
        attemptId !== recoveryAttemptIdRef.current ||
        generationAtStart !== (getSessionGenerationRef.current?.() ?? 0)
      ) {
        return false;
      }

      const now = Date.now();

      if (now - lastRecoveryAttemptRef.current < 1200) {
        return false;
      }

      lastRecoveryAttemptRef.current = now;
      setIsRecovering(true);
      debugSnapshot("foreground-recovery", "start");

      try {
        if (audio.muted) {
          audio.muted = false;
        }

        if (audio.volume === 0) {
          audio.volume = 1;
        }

        resumePositionRef.current = audio.currentTime;
        setCurrentTime(audio.currentTime);

        if (!audio.paused) {
          const alreadyPlaying = await verifyRealPlayback(audio, 600);

          if (alreadyPlaying) {
            debugSnapshot("foreground-recovery", "already-playing");
            return true;
          }

          audio.pause();
          setPlayingState(false);
        }

        try {
          await audio.play();
          const gotPlaying = await waitForPlayingEvent(audio, 2500);

          if (gotPlaying || (await verifyRealPlayback(audio, 600))) {
            debugSnapshot("foreground-recovery", "play-ok");
            return true;
          }

          if (!audio.paused) {
            audio.pause();
          }

          setPlayingState(false);
        } catch {
          setPlayingState(false);
        }

        if (
          recoveryUrlAttemptedRef.current ||
          !currentTrack ||
          generationAtStart !== (getSessionGenerationRef.current?.() ?? 0)
        ) {
          setAutoplayHint("Нажмите Play, чтобы продолжить воспроизведение.");
          syncMediaSessionPlaybackState(false);
          debugSnapshot("foreground-recovery", "failed-no-retry");
          return false;
        }

        recoveryUrlAttemptedRef.current = true;
        const position = resumePositionRef.current;
        const rate = audio.playbackRate;

        audio.pause();
        setPlayingState(false);
        setPendingStartPosition(position);
        debugSnapshot("foreground-recovery", "refresh-signed-url");

        await loadSignedUrl(currentTrack.id);

        if (
          attemptId !== recoveryAttemptIdRef.current ||
          generationAtStart !== (getSessionGenerationRef.current?.() ?? 0)
        ) {
          return false;
        }

        const refreshedAudio = audioRef.current;

        if (!refreshedAudio?.src) {
          setAutoplayHint("Нажмите Play, чтобы продолжить воспроизведение.");
          return false;
        }

        refreshedAudio.playbackRate = rate;

        await new Promise<void>((resolve) => {
          const timeoutId = window.setTimeout(resolve, 4000);

          const applyAndPlay = async () => {
            if (
              position > 0 &&
              Number.isFinite(refreshedAudio.duration) &&
              refreshedAudio.duration > 0
            ) {
              refreshedAudio.currentTime = clamp(
                position,
                0,
                refreshedAudio.duration,
              );
              setCurrentTime(refreshedAudio.currentTime);
              setPendingStartPosition(0);
            }

            try {
              await refreshedAudio.play();
              const ok =
                (await waitForPlayingEvent(refreshedAudio, 3000)) ||
                (await verifyRealPlayback(refreshedAudio, 600));

              if (!ok && !refreshedAudio.paused) {
                refreshedAudio.pause();
                setPlayingState(false);
              }

              window.clearTimeout(timeoutId);
              resolve();
            } catch {
              setPlayingState(false);
              window.clearTimeout(timeoutId);
              resolve();
            }
          };

          if (
            refreshedAudio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
          ) {
            void applyAndPlay();
            return;
          }

          refreshedAudio.addEventListener(
            "canplay",
            () => {
              void applyAndPlay();
            },
            { once: true },
          );
        });

        const success = isPlayingRef.current;

        if (!success) {
          setAutoplayHint("Нажмите Play, чтобы продолжить воспроизведение.");
          syncMediaSessionPlaybackState(false);
        }

        debugSnapshot("foreground-recovery", success ? "url-refresh-ok" : "url-refresh-failed");
        return success;
      } finally {
        setIsRecovering(false);
      }
    };

    const promise = run();
    recoveryPromiseRef.current = promise;

    try {
      return await promise;
    } finally {
      if (recoveryPromiseRef.current === promise) {
        recoveryPromiseRef.current = null;
      }
    }
  }, [currentTrack, debugSnapshot, loadSignedUrl, setPlayingState]);

  const handleMediaSessionPlay = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio?.src || audio.ended) {
      syncMediaSessionPlaybackState(false);
      debugSnapshot("media-session", "play-no-src");
      return;
    }

    userWantsPlaybackRef.current = true;
    debugSnapshot("media-session", "play-requested");

    if (document.visibilityState === "visible") {
      await recoverPlaybackWhenVisible();
      return;
    }

    if (!audio.paused) {
      const alreadyPlaying = await verifyRealPlayback(audio, 500);

      if (alreadyPlaying) {
        debugSnapshot("media-session", "play-already-active");
        return;
      }

      audio.pause();
      setPlayingState(false);
    }

    setIsRecovering(true);

    try {
      await audio.play();
      const gotPlaying = await waitForPlayingEvent(audio, 2000);

      if (!gotPlaying) {
        if (!audio.paused) {
          audio.pause();
        }

        setPlayingState(false);
        syncMediaSessionPlaybackState(false);
        debugSnapshot("media-session", "play-hidden-failed");
      } else {
        debugSnapshot("media-session", "play-hidden-ok");
      }
    } catch {
      setPlayingState(false);
      syncMediaSessionPlaybackState(false);
      debugSnapshot("media-session", "play-hidden-error");
    } finally {
      setIsRecovering(false);
    }
  }, [debugSnapshot, recoverPlaybackWhenVisible, setPlayingState]);

  const handleMediaSessionPause = useCallback(async () => {
    recoveryAttemptIdRef.current += 1;
    recoveryPromiseRef.current = null;
    userWantsPlaybackRef.current = false;
    setIsRecovering(false);

    const audio = audioRef.current;

    if (!audio) {
      syncMediaSessionPlaybackState(false);
      return;
    }

    resumePositionRef.current = audio.currentTime;

    if (!audio.paused) {
      userInitiatedPauseRef.current = true;
      audio.pause();
      userInitiatedPauseRef.current = false;
      await flushProgress();
    }

    setPlayingState(false);
    debugSnapshot("media-session", "pause");
  }, [debugSnapshot, flushProgress, setPlayingState]);

  const recoverPlaybackAfterForeground = useCallback(async () => {
    if (!userWantsPlaybackRef.current) {
      return;
    }

    const audio = audioRef.current;

    if (!audio?.src || audio.ended) {
      return;
    }

    if (isPlayingRef.current) {
      const ok = await verifyRealPlayback(audio, 600);

      if (ok) {
        return;
      }

      if (!audio.paused) {
        audio.pause();
      }

      setPlayingState(false);
    }

    await recoverPlaybackWhenVisible();
  }, [recoverPlaybackWhenVisible, setPlayingState]);

  return {
    audioRef,
    src,
    isMultiTrack,
    currentTrack,
    currentTrackIndex,
    tracks,
    isPlaying,
    isRecovering,
    isLoading: isLoading || isUrlLoading || isRecovering,
    hasValidDuration,
    displayDuration,
    currentTime,
    playerError: playerError ?? urlError,
    progressError,
    playbackRate: PLAYBACK_RATES[playbackRateIndex],
    statusMessage: autoplayHint ?? statusMessage,
    programProgressPercent,
    programCompleted,
    isPreviousTrackDisabled:
      currentTrackIndex === 0 &&
      currentTime <= PREVIOUS_TRACK_THRESHOLD_SECONDS &&
      !queueHasPrevious,
    isNextTrackDisabled:
      currentTrackIndex >= tracks.length - 1 && !queueHasNext,
    handlePlayPause,
    handleSeekOffset,
    handleRangeChange,
    handlePreviousTrack,
    handleNextTrack,
    handleSelectTrack,
    handlePlayTrackAtIndex,
    handleRetry,
    handleSpeedChange,
    handleStartOver,
    isTrackDone,
    practiceId,
    recoverPlaybackAfterForeground,
    performStopAndClear,
    handleMediaSessionPlay,
    handleMediaSessionPause,
    userWantsPlaybackRef,
  };
}

export { PLAYBACK_RATES };
