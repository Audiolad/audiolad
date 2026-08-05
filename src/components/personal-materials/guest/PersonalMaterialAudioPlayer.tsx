"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";
import { logPlayerDebug } from "@/lib/audio/player-debug";
import { STOP_LOCAL_AUDIO_EVENT } from "@/lib/audio/local-audio-coordination";
import {
  clearPersonalMaterialGuestProgress,
  readPersonalMaterialGuestProgress,
  writePersonalMaterialGuestProgress,
} from "@/lib/personal-materials/guest/progress";
import {
  PERSONAL_AUDIO_COPY,
  classifyFetchStatus,
  classifyMediaErrorCode,
  classifyPlayError,
  getSignedUrlRemainingMs,
  isLikelyIosUserAgent,
  isSignedUrlFresh,
  toSafeAudioSrcPath,
  type SignedAudioPayload,
} from "@/lib/personal-materials/guest/audio-player-helpers";

type PersonalMaterialAudioPlayerProps = {
  materialId: string;
  audioApiPath: string;
  enabled?: boolean;
  /** local = guest localStorage; server = callback only; none = author preview. */
  progressMode?: "local" | "server" | "none";
  initialPositionSeconds?: number;
  /** Throttled persist for server mode (default 12000ms). Local mode uses 500ms. */
  persistIntervalMs?: number;
  /** Accessible name; keep product-facing copy, not technical ids. */
  ariaLabel?: string;
  onProgressPersist?: (input: {
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
  }) => void;
};

type AudioUiState =
  | "idle"
  | "loading"
  | "ready"
  | "needs_gesture"
  | "error"
  | "unavailable";

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
const DEBUG_SOURCE = "personal-material-audio";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function parseRetryAfterMs(response: Response): number {
  const header = response.headers.get("Retry-After");

  if (!header) {
    return 3000;
  }

  const seconds = Number.parseInt(header, 10);

  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  return 3000;
}

function isNearComplete(positionSeconds: number, durationSeconds: number): boolean {
  if (!durationSeconds || durationSeconds <= 0) {
    return false;
  }
  return positionSeconds >= Math.max(durationSeconds - 15, Math.ceil(durationSeconds * 0.95));
}

function getErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name: unknown }).name);
  }
  return "unknown";
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

function isUnavailableState(state: AudioUiState): boolean {
  return state === "unavailable";
}

export default function PersonalMaterialAudioPlayer({
  materialId,
  audioApiPath,
  enabled = true,
  progressMode = "local",
  initialPositionSeconds = 0,
  persistIntervalMs,
  ariaLabel = "Плеер персональной диагностики",
  onProgressPersist,
}: PersonalMaterialAudioPlayerProps) {
  const { stopAndClear } = useGlobalAudioPlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const signedRef = useRef<SignedAudioPayload | null>(null);
  const assignedSrcSafeRef = useRef<string>("");
  const srcGenerationRef = useRef(0);
  const fetchEpochRef = useRef(0);
  const inFlightFetchRef = useRef<Promise<SignedAudioPayload> | null>(null);
  const playInFlightRef = useRef(false);
  const ensurePreparedSourceRef = useRef<
    | ((input: {
        inUserGesture: boolean;
        stage: "prefetch" | "fetch";
        fatalOnError: boolean;
        epoch?: number;
      }) => Promise<boolean>)
    | null
  >(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(
    initialPositionSeconds > 0 ? initialPositionSeconds : null,
  );
  const saveTimeoutRef = useRef<number | null>(null);
  const lastPersistAtRef = useRef(0);
  const onProgressPersistRef = useRef(onProgressPersist);
  const consecutivePlayFailuresRef = useRef(0);
  const uiStateRef = useRef<AudioUiState>("idle");

  const [uiState, setUiState] = useState<AudioUiState>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(
    initialPositionSeconds > 0 ? initialPositionSeconds : 0,
  );
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showIosSafariFallback, setShowIosSafariFallback] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  const updateUiState = useCallback((next: AudioUiState) => {
    uiStateRef.current = next;
    setUiState(next);
  }, []);

  useEffect(() => {
    onProgressPersistRef.current = onProgressPersist;
  }, [onProgressPersist]);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const debugLog = useCallback(
    (
      event: string,
      fields?: Record<string, string | number | boolean | null | undefined>,
    ) => {
      const signed = signedRef.current;
      const remainingMs = signed
        ? getSignedUrlRemainingMs(signed.expiresAt)
        : null;

      logPlayerDebug(DEBUG_SOURCE, event, {
        audio: audioRef.current,
        isPlaying,
        sessionGeneration: srcGenerationRef.current,
        fields: {
          materialId,
          safeSrc: toSafeAudioSrcPath(audioRef.current?.currentSrc || audioRef.current?.src),
          expiresAt: signed?.expiresAt ?? null,
          remainingMs,
          ua:
            typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 180)
              : null,
          mediaErrorCode: audioRef.current?.error?.code ?? null,
          ...fields,
        },
      });
    },
    [isPlaying, materialId],
  );

  const persistNow = useCallback(
    (positionSeconds: number, durationSeconds: number, force = false) => {
      const completed = isNearComplete(positionSeconds, durationSeconds);

      if (progressMode === "none") {
        return;
      }

      if (progressMode === "local") {
        writePersonalMaterialGuestProgress(materialId, {
          positionSeconds,
          durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      const now = Date.now();
      const interval = persistIntervalMs ?? 12000;
      if (!force && now - lastPersistAtRef.current < interval) {
        return;
      }
      lastPersistAtRef.current = now;
      onProgressPersistRef.current?.({
        positionSeconds,
        durationSeconds,
        completed,
      });
    },
    [materialId, persistIntervalMs, progressMode],
  );

  const scheduleProgressSave = useCallback(
    (positionSeconds: number, durationSeconds: number, force = false) => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      const delay = progressMode === "local" ? 500 : force ? 0 : 1500;
      saveTimeoutRef.current = window.setTimeout(() => {
        persistNow(positionSeconds, durationSeconds, force);
      }, delay);
    },
    [persistNow, progressMode],
  );

  const applySignedSource = useCallback(
    (signed: SignedAudioPayload) => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      const nextSafe = toSafeAudioSrcPath(signed.url);
      const currentSafe = toSafeAudioSrcPath(audio.currentSrc || audio.src);

      signedRef.current = signed;

      if (currentSafe !== nextSafe || !audio.src) {
        srcGenerationRef.current += 1;
        audio.src = signed.url;
        audio.load();
        assignedSrcSafeRef.current = nextSafe;
        debugLog("src_assigned", {
          safeSrc: nextSafe,
          generation: srcGenerationRef.current,
        });
      }
    },
    [debugLog],
  );

  const clearAudioSource = useCallback(() => {
    const audio = audioRef.current;
    signedRef.current = null;
    assignedSrcSafeRef.current = "";
    srcGenerationRef.current += 1;

    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
  }, []);

  const isSourcePrepared = useCallback(() => {
    const audio = audioRef.current;
    const signed = signedRef.current;

    if (!audio || !signed || !isSignedUrlFresh(signed)) {
      return false;
    }

    const audioSafe = toSafeAudioSrcPath(audio.currentSrc || audio.src);
    return Boolean(audioSafe) && audioSafe === toSafeAudioSrcPath(signed.url);
  }, []);

  const fetchSignedAudio = useCallback(
    async (input: {
      inUserGesture: boolean;
      stage: "prefetch" | "fetch";
      epoch: number;
    }): Promise<SignedAudioPayload> => {
      if (inFlightFetchRef.current) {
        debugLog("fetch_deduped", {
          stage: input.stage,
          inUserGesture: input.inUserGesture,
          epoch: input.epoch,
        });
        return inFlightFetchRef.current;
      }

      const run = (async () => {
        for (let attempt = 0; attempt <= 3; attempt += 1) {
          if (input.epoch !== fetchEpochRef.current) {
            throw Object.assign(new Error("aborted"), { kind: "abort" as const });
          }

          if (uiStateRef.current !== "unavailable") {
            updateUiState("loading");
            setStatusMessage(PERSONAL_AUDIO_COPY.preparing);
          }

          debugLog(input.stage, {
            attempt,
            inUserGesture: input.inUserGesture,
            epoch: input.epoch,
          });

          let response: Response;

          try {
            response = await fetch(audioApiPath, {
              method: "GET",
              cache: "no-store",
              credentials: "same-origin",
            });
          } catch (error) {
            debugLog("fetch_network_exception", {
              stage: input.stage,
              errorName: getErrorName(error),
              errorMessage: getErrorMessage(error).slice(0, 120),
              inUserGesture: input.inUserGesture,
            });
            throw Object.assign(new Error("network"), { kind: "network" as const });
          }

          if (input.epoch !== fetchEpochRef.current) {
            throw Object.assign(new Error("aborted"), { kind: "abort" as const });
          }

          debugLog("fetch_response", {
            stage: input.stage,
            status: response.status,
            inUserGesture: input.inUserGesture,
          });

          if (response.status === 404) {
            updateUiState("unavailable");
            setStatusMessage(PERSONAL_AUDIO_COPY.unavailable);
            clearPersonalMaterialGuestProgress(materialId);
            throw Object.assign(new Error("material_unavailable"), {
              kind: "unavailable" as const,
            });
          }

          if (response.status === 429) {
            if (attempt >= 3) {
              const classified = classifyFetchStatus(429);
              updateUiState("error");
              setStatusMessage(classified.message);
              throw Object.assign(new Error("rate_limited"), {
                kind: "rate_limited" as const,
              });
            }

            const delayMs = parseRetryAfterMs(response);
            await new Promise<void>((resolve) => {
              retryTimeoutRef.current = window.setTimeout(resolve, delayMs);
            });
            continue;
          }

          if (!response.ok) {
            const classified = classifyFetchStatus(response.status);
            if (classified.kind === "unavailable") {
              updateUiState("unavailable");
            } else {
              updateUiState("error");
            }
            setStatusMessage(classified.message);
            throw Object.assign(new Error("audio_fetch_failed"), {
              kind: classified.kind,
            });
          }

          const payload = (await response.json()) as SignedAudioPayload;

          if (!payload.url || !payload.expiresAt) {
            updateUiState("error");
            setStatusMessage(PERSONAL_AUDIO_COPY.network);
            throw Object.assign(new Error("invalid_audio_payload"), {
              kind: "network" as const,
            });
          }

          if (input.epoch !== fetchEpochRef.current) {
            throw Object.assign(new Error("aborted"), { kind: "abort" as const });
          }

          applySignedSource(payload);
          consecutivePlayFailuresRef.current = 0;
          setShowIosSafariFallback(false);
          updateUiState("ready");
          setStatusMessage(null);

          debugLog("fetch_resolved", {
            stage: input.stage,
            status: response.status,
            inUserGesture: input.inUserGesture,
            expiresAt: payload.expiresAt,
            remainingMs: getSignedUrlRemainingMs(payload.expiresAt),
            safeSrc: toSafeAudioSrcPath(payload.url),
          });

          return payload;
        }

        updateUiState("error");
        setStatusMessage(PERSONAL_AUDIO_COPY.rateLimited);
        throw Object.assign(new Error("rate_limited"), {
          kind: "rate_limited" as const,
        });
      })();

      inFlightFetchRef.current = run;

      try {
        return await run;
      } finally {
        if (inFlightFetchRef.current === run) {
          inFlightFetchRef.current = null;
        }
      }
    },
    [applySignedSource, audioApiPath, debugLog, materialId, updateUiState],
  );

  const ensurePreparedSource = useCallback(
    async (input: {
      inUserGesture: boolean;
      stage: "prefetch" | "fetch";
      /** Prefetch failures stay non-fatal. */
      fatalOnError: boolean;
      epoch?: number;
    }): Promise<boolean> => {
      if (isSourcePrepared()) {
        return true;
      }

      const epoch = input.epoch ?? fetchEpochRef.current;

      try {
        await fetchSignedAudio({
          inUserGesture: input.inUserGesture,
          stage: input.stage,
          epoch,
        });
        return isSourcePrepared();
      } catch (error) {
        const kind =
          error && typeof error === "object" && "kind" in error
            ? String((error as { kind: unknown }).kind)
            : "network";

        if (kind === "abort") {
          debugLog("fetch_aborted", {
            inUserGesture: input.inUserGesture,
            epoch,
          });
          return false;
        }

        if (!input.fatalOnError && kind !== "unavailable") {
          // Soft failure: leave play available for a user-driven retry.
          if (uiStateRef.current !== "unavailable") {
            updateUiState("idle");
            setStatusMessage(null);
          }
          debugLog("prefetch_soft_failure", {
            kind,
            inUserGesture: input.inUserGesture,
          });
          return false;
        }

        return false;
      }
    },
    [debugLog, fetchSignedAudio, isSourcePrepared, updateUiState],
  );

  const restoreSavedPosition = useCallback(() => {
    if (progressMode === "server" || progressMode === "none") {
      return;
    }

    const saved = readPersonalMaterialGuestProgress(materialId);
    const audio = audioRef.current;

    if (!saved || !audio) {
      return;
    }

    if (saved.durationSeconds && saved.positionSeconds >= saved.durationSeconds - 2) {
      return;
    }

    pendingSeekRef.current = saved.positionSeconds;
  }, [materialId, progressMode]);

  const applyPendingSeek = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (pendingSeekRef.current !== null && Number.isFinite(pendingSeekRef.current)) {
      audio.currentTime = pendingSeekRef.current;
      pendingSeekRef.current = null;
      return;
    }

    restoreSavedPosition();

    if (pendingSeekRef.current !== null && Number.isFinite(pendingSeekRef.current)) {
      audio.currentTime = pendingSeekRef.current;
      pendingSeekRef.current = null;
    }
  }, [restoreSavedPosition]);

  const handlePlayRejection = useCallback(
    (error: unknown, fetchedInGesture: boolean) => {
      const classified = classifyPlayError(error);

      debugLog("play_rejected", {
        errorName: getErrorName(error),
        errorMessage: getErrorMessage(error).slice(0, 120),
        kind: classified.kind,
        fetchedInGesture,
        mediaErrorCode: audioRef.current?.error?.code ?? null,
      });

      if (classified.kind === "abort") {
        return;
      }

      consecutivePlayFailuresRef.current += 1;

      if (classified.kind === "not_allowed") {
        updateUiState("needs_gesture");
        setStatusMessage(PERSONAL_AUDIO_COPY.needsGesture);
      } else if (classified.kind === "not_supported") {
        updateUiState("error");
        setStatusMessage(PERSONAL_AUDIO_COPY.notSupported);
      } else {
        updateUiState("error");
        setStatusMessage(classified.message ?? PERSONAL_AUDIO_COPY.playFailed);
      }

      if (
        consecutivePlayFailuresRef.current >= 2 &&
        typeof navigator !== "undefined" &&
        isLikelyIosUserAgent(navigator.userAgent)
      ) {
        setShowIosSafariFallback(true);
      }
    },
    [debugLog, updateUiState],
  );

  const requestPlay = useCallback(
    async (fetchedInGesture: boolean) => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      applyPendingSeek();

      debugLog("play_requested", {
        fetchedInGesture,
        prepared: isSourcePrepared(),
      });

      try {
        await audio.play();
        consecutivePlayFailuresRef.current = 0;
        setShowIosSafariFallback(false);
        updateUiState("ready");
        setStatusMessage(null);
        debugLog("play_resolved", { fetchedInGesture });
      } catch (error) {
        handlePlayRejection(error, fetchedInGesture);
      }
    },
    [
      applyPendingSeek,
      debugLog,
      handlePlayRejection,
      isSourcePrepared,
      updateUiState,
    ],
  );

  useEffect(() => {
    const onStopLocal = () => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      audio.pause();
      scheduleProgressSave(
        audio.currentTime,
        audio.duration || duration,
        true,
      );
    };

    window.addEventListener(STOP_LOCAL_AUDIO_EVENT, onStopLocal);

    return () => {
      window.removeEventListener(STOP_LOCAL_AUDIO_EVENT, onStopLocal);
    };
  }, [duration, scheduleProgressSave]);

  useEffect(() => {
    ensurePreparedSourceRef.current = ensurePreparedSource;
  }, [ensurePreparedSource]);

  // Prefetch signed URL after mount / material change — never autoplay.
  // Uses a ref so callback identity churn (isPlaying → debugLog) cannot re-trigger fetch.
  useEffect(() => {
    if (!enabled) {
      return;
    }

    clearRetryTimeout();
    inFlightFetchRef.current = null;
    fetchEpochRef.current += 1;
    const epoch = fetchEpochRef.current;

    // Reset media element via refs only — UI state is updated by prefetch callbacks
    // (avoids cascading setState-in-effect lint / render churn).
    clearAudioSource();
    consecutivePlayFailuresRef.current = 0;

    void ensurePreparedSourceRef.current?.({
      inUserGesture: false,
      stage: "prefetch",
      fatalOnError: false,
      epoch,
    });
  }, [audioApiPath, clearAudioSource, clearRetryTimeout, enabled, materialId]);

  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio || uiStateRef.current === "unavailable") {
      return;
    }

    if (isPlaying) {
      audio.pause();
      return;
    }

    if (playInFlightRef.current) {
      debugLog("play_ignored_in_flight", {});
      return;
    }

    playInFlightRef.current = true;
    setIsActionPending(true);

    try {
      // Mutual exclusion: stop Global Player before local <audio> starts.
      stopAndClear();

      if (isSourcePrepared()) {
        // Critical path: no await fetch / timer before play() while gesture is warm.
        await requestPlay(false);
        return;
      }

      const prepared = await ensurePreparedSource({
        inUserGesture: true,
        stage: "fetch",
        fatalOnError: true,
      });

      // Re-read after await — ref may change while fetch is in flight.
      if (!prepared || isUnavailableState(uiStateRef.current)) {
        return;
      }

      // After await, iOS may reject — surface needs_gesture instead of fake network error.
      await requestPlay(true);
    } finally {
      playInFlightRef.current = false;
      setIsActionPending(false);
    }
  }, [
    debugLog,
    ensurePreparedSource,
    isPlaying,
    isSourcePrepared,
    requestPlay,
    stopAndClear,
  ]);

  const handleRetry = useCallback(async () => {
    if (playInFlightRef.current || uiStateRef.current === "unavailable") {
      return;
    }

    playInFlightRef.current = true;
    setIsActionPending(true);
    clearRetryTimeout();
    setShowIosSafariFallback(false);
    inFlightFetchRef.current = null;
    fetchEpochRef.current += 1;
    const epoch = fetchEpochRef.current;
    clearAudioSource();
    updateUiState("loading");
    setStatusMessage(PERSONAL_AUDIO_COPY.preparing);

    try {
      stopAndClear();

      const prepared = await ensurePreparedSource({
        inUserGesture: true,
        stage: "fetch",
        fatalOnError: true,
        epoch,
      });

      if (!prepared || isUnavailableState(uiStateRef.current)) {
        return;
      }

      await requestPlay(true);
    } finally {
      playInFlightRef.current = false;
      setIsActionPending(false);
    }
  }, [
    clearAudioSource,
    clearRetryTimeout,
    ensurePreparedSource,
    requestPlay,
    stopAndClear,
    updateUiState,
  ]);

  const handleSeek = useCallback(
    (value: number) => {
      const audio = audioRef.current;

      if (!audio || !Number.isFinite(value)) {
        return;
      }

      audio.currentTime = value;
      setCurrentTime(value);
      scheduleProgressSave(value, audio.duration || duration, true);
    },
    [duration, scheduleProgressSave],
  );

  const handleSkip = useCallback(
    (delta: number) => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      const next = Math.max(0, Math.min(audio.duration || duration, audio.currentTime + delta));
      handleSeek(next);
    },
    [duration, handleSeek],
  );

  const handleRateChange = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
    audio.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const isCurrentSourceEvent = () => {
      if (!assignedSrcSafeRef.current) {
        return false;
      }

      return (
        toSafeAudioSrcPath(audio.currentSrc || audio.src) ===
        assignedSrcSafeRef.current
      );
    };

    const onTimeUpdate = () => {
      if (!isCurrentSourceEvent()) {
        return;
      }
      setCurrentTime(audio.currentTime);
      scheduleProgressSave(audio.currentTime, audio.duration || duration);
    };

    const onLoadedMetadata = () => {
      if (!isCurrentSourceEvent()) {
        return;
      }
      setDuration(audio.duration || 0);
      debugLog("loadedmetadata", {
        duration: audio.duration || 0,
      });
    };

    const onCanPlay = () => {
      if (!isCurrentSourceEvent()) {
        return;
      }
      debugLog("canplay", {});
      if (
        uiStateRef.current === "loading" ||
        uiStateRef.current === "idle" ||
        uiStateRef.current === "needs_gesture"
      ) {
        // Keep needs_gesture message if present; otherwise mark ready.
        if (uiStateRef.current !== "needs_gesture") {
          updateUiState("ready");
        }
      }
    };

    const onPlaying = () => {
      if (!isCurrentSourceEvent()) {
        return;
      }
      setIsPlaying(true);
      consecutivePlayFailuresRef.current = 0;
      updateUiState("ready");
      setStatusMessage(null);
      debugLog("playing", {});
    };

    const onPlay = () => {
      if (!isCurrentSourceEvent()) {
        return;
      }
      setIsPlaying(true);
    };

    const onPause = () => {
      if (!isCurrentSourceEvent()) {
        return;
      }
      setIsPlaying(false);
      scheduleProgressSave(audio.currentTime, audio.duration || duration, true);
      debugLog("pause", {});
    };

    const onEnded = () => {
      if (!isCurrentSourceEvent()) {
        return;
      }
      setIsPlaying(false);
      scheduleProgressSave(audio.duration || duration, audio.duration || duration, true);
      if (progressMode === "local") {
        clearPersonalMaterialGuestProgress(materialId);
      }
      debugLog("ended", {});
    };

    const onWaiting = () => {
      if (!isCurrentSourceEvent()) {
        return;
      }
      debugLog("waiting", {});
    };

    const onStalled = () => {
      if (!isCurrentSourceEvent()) {
        return;
      }
      debugLog("stalled", {});
    };

    const onError = () => {
      if (!isCurrentSourceEvent()) {
        debugLog("audio_error_stale_ignored", {
          mediaErrorCode: audio.error?.code ?? null,
        });
        return;
      }

      const classified = classifyMediaErrorCode(audio.error?.code ?? null);

      debugLog("audio_error", {
        mediaErrorCode: audio.error?.code ?? null,
        kind: classified.kind,
      });

      if (classified.kind === "abort" || classified.message === null) {
        return;
      }

      if (uiStateRef.current === "unavailable") {
        return;
      }

      consecutivePlayFailuresRef.current += 1;
      updateUiState("error");
      setStatusMessage(classified.message);

      if (
        consecutivePlayFailuresRef.current >= 2 &&
        typeof navigator !== "undefined" &&
        isLikelyIosUserAgent(navigator.userAgent)
      ) {
        setShowIosSafariFallback(true);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onStalled);
    audio.addEventListener("error", onError);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        scheduleProgressSave(audio.currentTime, audio.duration || duration, true);
      }
    };
    const onPageHide = () => {
      scheduleProgressSave(audio.currentTime, audio.duration || duration, true);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onStalled);
      audio.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [debugLog, duration, materialId, progressMode, scheduleProgressSave, updateUiState]);

  useEffect(() => {
    return () => {
      clearRetryTimeout();

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [clearRetryTimeout]);

  const progressMax = duration > 0 ? duration : 100;
  const progressValue = duration > 0 ? currentTime : 0;
  const playDisabled = uiState === "unavailable";
  const visibleStatus =
    statusMessage ??
    (uiState === "loading" ? PERSONAL_AUDIO_COPY.preparing : null);

  if (!enabled) {
    return null;
  }

  return (
    <section
      aria-label={ariaLabel}
      className="rounded-2xl border border-[#ece6f5] bg-[#fcfbfe] p-4 sm:p-5"
    >
      <audio ref={audioRef} preload="none" playsInline />

      <div aria-live="polite" className="sr-only">
        {visibleStatus}
      </div>

      {uiState === "loading" && (
        <p className="mb-4 text-sm text-[#6d628f]">{PERSONAL_AUDIO_COPY.preparing}</p>
      )}

      {uiState === "needs_gesture" && (
        <p className="mb-4 text-sm text-[#6d628f]">{PERSONAL_AUDIO_COPY.needsGesture}</p>
      )}

      {uiState === "error" && (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-[#6d628f]">
            {statusMessage ?? PERSONAL_AUDIO_COPY.playFailed}
          </p>
          <button
            type="button"
            onClick={() => {
              void handleRetry();
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            {PERSONAL_AUDIO_COPY.retry}
          </button>
        </div>
      )}

      {uiState === "unavailable" && (
        <p className="mb-4 text-sm text-[#6d628f]">{PERSONAL_AUDIO_COPY.unavailable}</p>
      )}

      {showIosSafariFallback && uiState !== "unavailable" && (
        <p className="mb-4 text-sm text-[#6d628f]">{PERSONAL_AUDIO_COPY.iosSafariFallback}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void handlePlayPause();
          }}
          disabled={playDisabled}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          aria-busy={uiState === "loading" || isActionPending}
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white disabled:opacity-50"
        >
          {isPlaying ? (
            <span className="text-2xl leading-none">❚❚</span>
          ) : (
            <span className="ml-0.5 text-2xl leading-none">▶</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSkip(-15)}
          aria-label="Назад на 15 секунд"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[#ded5ef] px-3 text-xs font-semibold text-[#5f5484]"
        >
          −15
        </button>

        <button
          type="button"
          onClick={() => handleSkip(15)}
          aria-label="Вперёд на 15 секунд"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[#ded5ef] px-3 text-xs font-semibold text-[#5f5484]"
        >
          +15
        </button>

        <button
          type="button"
          onClick={handleRateChange}
          aria-label={`Скорость воспроизведения ${playbackRate}x`}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#ded5ef] px-3 text-xs font-semibold text-[#5f5484]"
        >
          {playbackRate}x
        </button>

        <div className="ml-auto text-xs tabular-nums text-[#6d628f]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Прогресс воспроизведения</span>
        <input
          type="range"
          min={0}
          max={progressMax}
          step={0.1}
          value={progressValue}
          onChange={(event) => handleSeek(Number(event.target.value))}
          className="mt-1 w-full accent-[#7042c5]"
        />
      </label>
    </section>
  );
}
