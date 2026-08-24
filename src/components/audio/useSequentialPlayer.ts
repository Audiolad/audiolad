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
  /** Discriminator: private_audio uses private signed URL + progress APIs. */
  sourceType?: "catalog" | "private_audio";
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
  /** Invoked only after confirmed `playing` for the initial autoplay attempt. */
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
  playbackMode?: "full" | "preview";
  previewStartMs?: number;
  previewEndMs?: number;
  onPreviewEnded?: () => void;
};

type SwitchTrackOptions = {
  autoPlay?: boolean;
  startPosition?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useSequentialPlayer({
  sourceType = "catalog",
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
  playbackMode = "full",
  previewStartMs,
  previewEndMs,
  onPreviewEnded,
}: UseSequentialPlayerOptions) {
  const isPrivateAudio = sourceType === "private_audio";
  const isPreviewMode = playbackMode === "preview";
  const previewStartSeconds =
    isPreviewMode &&
    typeof previewStartMs === "number" &&
    Number.isFinite(previewStartMs) &&
    previewStartMs >= 0
      ? previewStartMs / 1000
      : 0;
  const previewEndSeconds =
    isPreviewMode &&
    typeof previewEndMs === "number" &&
    Number.isFinite(previewEndMs) &&
    previewEndMs > previewStartSeconds * 1000
      ? previewEndMs / 1000
      : 0;
  const hasPreviewWindow = isPreviewMode && previewEndSeconds > previewStartSeconds;
  const urlRequestRef = useRef(0);
  const urlAbortRef = useRef<AbortController | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<PendingSavePayload | null>(null);
  const urlRetryCountRef = useRef(0);
  const lastSaveAtRef = useRef(0);
  const progressRef = useRef<ListenProgressEntry[]>(initialProgress);
  const wasPlayingBeforeSwitchRef = useRef(false);
  const initialAutoplayPendingRef = useRef(requestInitialAutoplay);
  const initialAutoplayAttemptedRef = useRef(false);
  /** True after autoplay play() was issued; URL cleanup runs only on `playing`. */
  const autoplayUrlCleanupPendingRef = useRef(false);
  /** Defer resume seek until after the first successful autoplay `playing`. */
  const deferResumeSeekForInitialAutoplayRef = useRef(false);
  /** Guards foreground recovery from interrupting normal initial buffering. */
  const initialPlaybackBufferingRef = useRef(false);
  const userWantsPlaybackRef = useRef(false);
  const userInitiatedPauseRef = useRef(false);
  const lastRecoveryAttemptRef = useRef(0);
  const recoveryUrlAttemptedRef = useRef(false);
  const recoveryPromiseRef = useRef<Promise<boolean> | null>(null);
  const recoveryAttemptIdRef = useRef(0);
  const resumePositionRef = useRef(0);
  const isPlayingRef = useRef(false);
  const onInitialAutoplayAttemptedRef = useRef(onInitialAutoplayAttempted);
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
    if (hasPreviewWindow) {
      return {
        trackIndex: 0,
        positionSeconds: previewStartSeconds,
        allCompleted: false,
      };
    }

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
  }, [
    forceStartAtBeginning,
    hasPreviewWindow,
    initialProgress,
    initialTrackId,
    previewStartSeconds,
    tracks,
  ]);

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
  const [previewEnded, setPreviewEnded] = useState(false);
  const previewEndedRef = useRef(false);

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
    onInitialAutoplayAttemptedRef.current = onInitialAutoplayAttempted;
  }, [onInitialAutoplayAttempted]);

  useEffect(() => {
    if (requestInitialAutoplay && !initialAutoplayAttemptedRef.current) {
      initialAutoplayPendingRef.current = true;
      if (pendingStartPosition > 0) {
        deferResumeSeekForInitialAutoplayRef.current = true;
      }
    }
  }, [pendingStartPosition, requestInitialAutoplay]);

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

  const listenApiBase = isPrivateAudio
    ? ""
    : buildListenApiBase(authorSlug, productSlug);
  const listenApiBaseRef = useRef(listenApiBase);
  const isPrivateAudioRef = useRef(isPrivateAudio);
  const isPreviewModeRef = useRef(isPreviewMode);
  const previewStartSecondsRef = useRef(previewStartSeconds);
  const previewEndSecondsRef = useRef(previewEndSeconds);
  const hasPreviewWindowRef = useRef(hasPreviewWindow);
  const onPreviewEndedRef = useRef(onPreviewEnded);
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

  useEffect(() => {
    isPrivateAudioRef.current = isPrivateAudio;
  }, [isPrivateAudio]);

  useEffect(() => {
    isPreviewModeRef.current = isPreviewMode;
    previewStartSecondsRef.current = previewStartSeconds;
    previewEndSecondsRef.current = previewEndSeconds;
    hasPreviewWindowRef.current = hasPreviewWindow;
  }, [hasPreviewWindow, isPreviewMode, previewEndSeconds, previewStartSeconds]);

  useEffect(() => {
    onPreviewEndedRef.current = onPreviewEnded;
  }, [onPreviewEnded]);

  const finishPreview = useCallback(() => {
    if (previewEndedRef.current) {
      return;
    }

    previewEndedRef.current = true;
    const audio = audioRef.current;
    const end = previewEndSecondsRef.current;

    if (audio) {
      try {
        audio.pause();
        if (Number.isFinite(end) && end > 0) {
          audio.currentTime = end;
        }
      } catch {
        // Ignore seek errors during teardown.
      }
    }

    setPlayingState(false);
    setCurrentTime(Number.isFinite(end) ? end : currentTimeRef.current);
    setPreviewEnded(true);
    userWantsPlaybackRef.current = false;
    onPreviewEndedRef.current?.();
  }, [audioRef, setPlayingState]);

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

      if (isPreviewModeRef.current) {
        return;
      }

      // Snapshot routing for this flush — never follow a later session switch.
      // Private progress never touches practice_audio_progress / catalog listen APIs.
      const saveAsPrivate = isPrivateAudioRef.current;
      const saveApiBase = listenApiBaseRef.current;
      const saveGeneration = getSessionGenerationRef.current?.() ?? 0;

      updateProgressEntry(audioItemId, positionSeconds, completed);

      if (!saveAsPrivate && guestProgressMode && guestProgressMeta) {
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

      const isSaveStale = () =>
        saveGeneration !== (getSessionGenerationRef.current?.() ?? 0);

      try {
        const track = tracks.find((item) => item.id === payload.audioItemId);
        const response = saveAsPrivate
          ? await fetch(
              `/api/my-library/private-audio/${encodeURIComponent(payload.audioItemId)}/progress`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                  positionSeconds: Math.floor(payload.positionSeconds),
                  durationSeconds: track?.durationSeconds ?? null,
                  completed: payload.completed,
                }),
              },
            )
          : await fetch(`${saveApiBase}/progress`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audio_item_id: payload.audioItemId,
                position_seconds: Math.floor(payload.positionSeconds),
                completed: payload.completed,
              }),
            });

        if (isSaveStale()) {
          return;
        }

        if (!response.ok) {
          // Best-effort: never treat progress failure as a fatal player/nav error.
          setProgressError("Не удалось сохранить прогресс прослушивания.");
          return;
        }

        lastSaveAtRef.current = Date.now();
        setProgressError(null);
      } catch {
        if (isSaveStale()) {
          return;
        }

        setProgressError("Не удалось сохранить прогресс прослушивания.");
      } finally {
        saveInFlightRef.current = false;

        if (!isSaveStale()) {
          drainPendingSave(pendingSaveRef, (...args) => {
            void saveProgressRef.current(...args);
          });
        }
      }
    },
    [
      guestProgressMeta,
      guestProgressMode,
      practiceId,
      tracks,
      updateProgressEntry,
    ],
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

      urlAbortRef.current?.abort();
      const abortController = new AbortController();
      urlAbortRef.current = abortController;

      const fetchAsPrivate = isPrivateAudioRef.current;
      const fetchApiBase = listenApiBaseRef.current;

      const isStale = () =>
        requestId !== urlRequestRef.current ||
        capturedGeneration !== (getSessionGenerationRef.current?.() ?? 0) ||
        abortController.signal.aborted;

      setIsUrlLoading(true);
      setUrlError(null);
      setStatusMessage(PREPARE_AUDIO_MESSAGE);

      let settled = false;

      try {
        const response = fetchAsPrivate
          ? await fetch(
              `/api/my-library/private-audio/${encodeURIComponent(audioItemId)}/audio`,
              {
                credentials: "same-origin",
                cache: "no-store",
                signal: abortController.signal,
              },
            )
          : await fetch(
              `${fetchApiBase}/audio/${audioItemId}${
                isPreviewModeRef.current ? "?preview=1" : ""
              }`,
              {
                signal: abortController.signal,
              },
            );

        if (isStale()) {
          console.info("private_audio_session_switch", {
            stage: "url_fetch_stale_ignored",
            generation: capturedGeneration,
            private: fetchAsPrivate,
          });
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
          console.error("private_audio_session_switch", {
            stage: "url_fetch_failed",
            status: response.status,
            generation: capturedGeneration,
            private: fetchAsPrivate,
            retries: urlRetryCountRef.current,
          });

          if (response.status === 401 || response.status === 403) {
            setUrlError(
              fetchAsPrivate
                ? "Нет доступа к этому аудиоматериалу."
                : "Доступ к прослушиванию не открыт.",
            );
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

        urlRetryCountRef.current = 0;
        setSrc(payload.url);
        settled = true;
      } catch (error) {
        if (
          abortController.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        if (isStale()) {
          return;
        }

        console.error("private_audio_session_switch", {
          stage: "url_fetch_exception",
          generation: capturedGeneration,
          private: fetchAsPrivate,
          error: error instanceof Error ? error.message : "unknown",
        });

        setUrlError(PREPARE_AUDIO_ERROR);
        setSrc(null);
        setIsLoading(false);
        settled = true;
      } finally {
        // Never auto-retry after generation change — that poisoned catalog loads
        // when a private→catalog remount invalidated an in-flight fetch.
        if (isStale()) {
          return;
        }

        if (settled) {
          setIsUrlLoading(false);
        }
      }
    },
    [],
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

    // Shared <audio>: ignore events from a previous session after generation bump
    // (e.g. error/emptied fired by stopAndClear clearing the old private src).
    const handlersGeneration = getSessionGenerationRef.current?.() ?? 0;
    const isHandlerCurrent = () =>
      handlersGeneration === (getSessionGenerationRef.current?.() ?? 0);

    const applyStartPosition = () => {
      if (!isHandlerCurrent()) {
        return;
      }

      if (pendingStartPosition <= 0) {
        return;
      }

      // iOS/WebKit: seeking at HAVE_METADATA before the first autoplay play()
      // often leaves the element stuck in `waiting`. Apply resume after playing.
      if (deferResumeSeekForInitialAutoplayRef.current) {
        return;
      }

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const min = hasPreviewWindowRef.current
          ? previewStartSecondsRef.current
          : 0;
        const max = hasPreviewWindowRef.current
          ? Math.min(previewEndSecondsRef.current, audio.duration)
          : audio.duration;
        audio.currentTime = clamp(pendingStartPosition, min, max);
        setCurrentTime(audio.currentTime);
        setPendingStartPosition(0);
      }
    };

    const updateDuration = () => {
      if (!isHandlerCurrent()) {
        return;
      }

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        setIsLoading(false);
        setStatusMessage("");
        applyStartPosition();
      }
    };

    const handleTimeUpdate = () => {
      if (!isHandlerCurrent()) {
        return;
      }

      currentTimeRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);

      if (
        hasPreviewWindowRef.current &&
        audio.currentTime >= previewEndSecondsRef.current - 0.05
      ) {
        finishPreview();
      }
    };

    const handlePlay = () => {
      if (!isHandlerCurrent()) {
        return;
      }

      setPlayerError(null);
      setStatusMessage("");
    };

    const handlePlaying = () => {
      if (!isHandlerCurrent()) {
        return;
      }

      setPlayingState(true);
      setIsRecovering(false);
      setPlayerError(null);
      setStatusMessage("");
      setAutoplayHint(null);
      recoveryUrlAttemptedRef.current = false;
      initialPlaybackBufferingRef.current = false;

      if (deferResumeSeekForInitialAutoplayRef.current) {
        deferResumeSeekForInitialAutoplayRef.current = false;
        applyStartPosition();
      }

      // Strip ?autoplay=1 only after confirmed playback — not before play().
      if (autoplayUrlCleanupPendingRef.current) {
        autoplayUrlCleanupPendingRef.current = false;
        onInitialAutoplayAttemptedRef.current?.();
      }

      debugSnapshot("audio-event", "playing");
    };

    const handlePause = () => {
      if (!isHandlerCurrent()) {
        return;
      }

      setPlayingState(false);
      debugSnapshot("audio-event", "pause");
    };

    const handleWaiting = () => {
      if (!isHandlerCurrent()) {
        return;
      }

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setStatusMessage("Загрузка…");
      }

      debugSnapshot("audio-event", "waiting");
    };

    const handleCanPlay = () => {
      if (!isHandlerCurrent()) {
        return;
      }

      setIsLoading(false);

      if (!playerError) {
        setStatusMessage("");
      }

      const willInitialAutoplay =
        !wasPlayingBeforeSwitchRef.current &&
        initialAutoplayPendingRef.current &&
        !initialAutoplayAttemptedRef.current;

      if (willInitialAutoplay && pendingStartPosition > 0) {
        deferResumeSeekForInitialAutoplayRef.current = true;
      }

      applyStartPosition();

      if (wasPlayingBeforeSwitchRef.current) {
        wasPlayingBeforeSwitchRef.current = false;
        userWantsPlaybackRef.current = true;
        initialPlaybackBufferingRef.current = true;
        void audio.play().catch(() => {
          if (!isHandlerCurrent()) {
            return;
          }

          initialPlaybackBufferingRef.current = false;
          setPlayerError("Нажмите ещё раз, чтобы начать прослушивание.");
        });
        return;
      }

      if (willInitialAutoplay) {
        initialAutoplayPendingRef.current = false;
        initialAutoplayAttemptedRef.current = true;
        // Keep ?autoplay=1 until `playing` confirms success.
        autoplayUrlCleanupPendingRef.current = true;
        userWantsPlaybackRef.current = true;
        initialPlaybackBufferingRef.current = true;

        void audio.play().catch((error: unknown) => {
          if (!isHandlerCurrent()) {
            return;
          }

          const name =
            error && typeof error === "object" && "name" in error
              ? String((error as { name?: string }).name)
              : "unknown";
          debugSnapshot("autoplay", `blocked:${name}`);
          autoplayUrlCleanupPendingRef.current = false;
          initialPlaybackBufferingRef.current = false;
          deferResumeSeekForInitialAutoplayRef.current = false;
          userWantsPlaybackRef.current = false;
          // Intent was not successfully consumed — allow a later gesture retry
          // via requestAutoplayIntent / manual Play, not a canplay loop.
          setAutoplayHint("Нажмите Play, чтобы начать прослушивание");
        });
      }
    };

    const handleStalled = () => {
      if (!isHandlerCurrent()) {
        return;
      }

      setPlayingState(false);
      debugSnapshot("audio-event", "stalled");
    };

    const handleEnded = async () => {
      if (!isHandlerCurrent() || !currentTrack) {
        return;
      }

      if (hasPreviewWindowRef.current) {
        finishPreview();
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
      if (!isHandlerCurrent()) {
        console.info("private_audio_session_switch", {
          stage: "audio_error_stale_ignored",
          generation: handlersGeneration,
          code: audio.error?.code ?? null,
        });
        return;
      }

      // Teardown during session replace clears src and can emit error — ignore.
      if (!src || (!audio.getAttribute("src") && !audio.currentSrc)) {
        return;
      }

      setPlayingState(false);
      setIsRecovering(false);

      if (!userInitiatedPauseRef.current) {
        // Keep user intent — they may want to retry after foreground recovery.
      }

      setIsLoading(false);

      const mediaError = audio.error;

      console.error("private_audio_session_switch", {
        stage: "audio_error",
        generation: handlersGeneration,
        code: mediaError?.code ?? null,
      });

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
    sessionGeneration,
    switchToTrack,
    tracks.length,
    saveProgress,
    src,
    debugSnapshot,
    setPlayingState,
    finishPreview,
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

  const hasValidDuration =
    (Number.isFinite(duration) && duration > 0) || hasPreviewWindow;
  const rawDisplayDuration = Number.isFinite(duration) && duration > 0
    ? duration
    : currentTrack?.durationSeconds && currentTrack.durationSeconds > 0
      ? currentTrack.durationSeconds
      : 0;
  const previewSpan = hasPreviewWindow
    ? previewEndSeconds - previewStartSeconds
    : 0;
  const displayDuration = hasPreviewWindow ? previewSpan : rawDisplayDuration;
  const displayCurrentTime = hasPreviewWindow
    ? clamp(currentTime - previewStartSeconds, 0, previewSpan)
    : currentTime;

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

    if (audio.ended || previewEnded) {
      const restartAt = hasPreviewWindow ? previewStartSeconds : 0;
      audio.currentTime = restartAt;
      setCurrentTime(restartAt);
      previewEndedRef.current = false;
      setPreviewEnded(false);
    }

    if (!audio.paused) {
      userWantsPlaybackRef.current = false;
      initialPlaybackBufferingRef.current = false;
      userInitiatedPauseRef.current = true;
      audio.pause();
      userInitiatedPauseRef.current = false;
      await flushProgress();
      return;
    }

    userWantsPlaybackRef.current = true;
    recoveryUrlAttemptedRef.current = false;
    initialPlaybackBufferingRef.current = true;

    try {
      await audio.play();
      setPlayerError(null);
      setAutoplayHint(null);
    } catch {
      initialPlaybackBufferingRef.current = false;
      userWantsPlaybackRef.current = false;
      setPlayingState(false);
      setPlayerError("Нажмите ещё раз, чтобы начать прослушивание.");
    }
  };

  /**
   * Re-arm autoplay on an already-mounted engine (same track/src) without
   * remounting or calling audio.load() again.
   */
  const requestAutoplayIntent = useCallback(() => {
    if (isPlayingRef.current) {
      return;
    }

    initialAutoplayPendingRef.current = true;
    initialAutoplayAttemptedRef.current = false;
    autoplayUrlCleanupPendingRef.current = false;
    setAutoplayHint(null);

    if (pendingStartPosition > 0) {
      deferResumeSeekForInitialAutoplayRef.current = true;
    }

    const audio = audioRef.current;

    if (
      !audio ||
      (!audio.getAttribute("src") && !audio.currentSrc) ||
      audio.readyState < HTMLMediaElement.HAVE_METADATA
    ) {
      // canplay handler will pick up initialAutoplayPendingRef.
      return;
    }

    initialAutoplayPendingRef.current = false;
    initialAutoplayAttemptedRef.current = true;
    autoplayUrlCleanupPendingRef.current = true;
    userWantsPlaybackRef.current = true;
    initialPlaybackBufferingRef.current = true;

    void audio.play().catch((error: unknown) => {
      const name =
        error && typeof error === "object" && "name" in error
          ? String((error as { name?: string }).name)
          : "unknown";
      debugSnapshot("autoplay-intent", `blocked:${name}`);
      autoplayUrlCleanupPendingRef.current = false;
      initialPlaybackBufferingRef.current = false;
      deferResumeSeekForInitialAutoplayRef.current = false;
      userWantsPlaybackRef.current = false;
      setAutoplayHint("Нажмите Play, чтобы начать прослушивание");
    });
  }, [audioRef, debugSnapshot, pendingStartPosition]);

  const handleSeekOffset = (offsetSeconds: number) => {
    const audio = audioRef.current;

    if (!audio || !hasValidDuration) {
      return;
    }

    const min = hasPreviewWindow ? previewStartSeconds : 0;
    const max = hasPreviewWindow
      ? Math.min(previewEndSeconds, duration)
      : duration;
    const nextTime = clamp(audio.currentTime + offsetSeconds, min, max);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleRangeChange = (value: number) => {
    const audio = audioRef.current;

    if (!audio || !hasValidDuration) {
      return;
    }

    const absolute = hasPreviewWindow ? previewStartSeconds + value : value;
    const min = hasPreviewWindow ? previewStartSeconds : 0;
    const max = hasPreviewWindow
      ? Math.min(previewEndSeconds, duration)
      : duration;
    const nextTime = clamp(absolute, min, max);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
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
        setAutoplayHint(null);

        try {
          await audio.play();
          setPlayerError(null);
        } catch (error: unknown) {
          const name =
            error && typeof error === "object" && "name" in error
              ? String((error as { name?: string }).name)
              : "unknown";
          debugSnapshot("play-at-index", `blocked:${name}`);
          userWantsPlaybackRef.current = false;
          setAutoplayHint("Нажмите Play, чтобы начать прослушивание");
        }
      } else if (!src && currentTrack?.id) {
        // Source still preparing — keep play intent for canplay.
        userWantsPlaybackRef.current = true;
        wasPlayingBeforeSwitchRef.current = true;
        initialAutoplayPendingRef.current = true;
        void loadSignedUrl(currentTrack.id);
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
      if (isPrivateAudio) {
        // Private items have no DELETE progress route; restart + forced save is enough.
      } else if (guestProgressModeRef.current) {
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
    initialAutoplayAttemptedRef.current = false;
    autoplayUrlCleanupPendingRef.current = false;
    deferResumeSeekForInitialAutoplayRef.current = false;
    initialPlaybackBufferingRef.current = false;
    wasPlayingBeforeSwitchRef.current = false;
    urlRequestRef.current += 1;
    urlAbortRef.current?.abort();
    urlAbortRef.current = null;
    urlRetryCountRef.current = 0;

    // Flush with this engine's snapshot (private/catalog) before clearing audio.
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
    setProgressError(null);
    setAutoplayHint(null);
    setStatusMessage("");
    debugSnapshot("stop-and-clear", "cleared");
  }, [debugSnapshot, flushProgress, setPlayingState]);

  useEffect(() => {
    registerCleanup?.(performStopAndClear);

    return () => {
      // Do not stop/clear the shared <audio> on remount — loadSession stops the
      // previous engine explicitly on session-key change before replacing state.
      // Clearing here would wipe a same-key remount (autoplay bump) mid-flight.
      urlAbortRef.current?.abort();
      urlAbortRef.current = null;
      urlRequestRef.current += 1;
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

    // Normal initial buffering after play()/autoplay — not a stalled session.
    if (initialPlaybackBufferingRef.current) {
      debugSnapshot("foreground-recovery", "skip-initial-buffering");
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

      // Element is mid-buffer after an accepted play() — do not pause/reload.
      if (
        !audio.paused &&
        audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
      ) {
        debugSnapshot("foreground-recovery", "skip-buffering");
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
    currentTime: displayCurrentTime,
    previewEnded,
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
    requestAutoplayIntent,
    userWantsPlaybackRef,
  };
}

export { PLAYBACK_RATES };
