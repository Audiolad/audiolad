"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type UseSequentialPlayerOptions = {
  slug: string;
  practiceId: string;
  tracks: ListenTrack[];
  initialProgress: ListenProgressEntry[];
};

type SwitchTrackOptions = {
  autoPlay?: boolean;
  startPosition?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useSequentialPlayer({
  slug,
  practiceId,
  tracks,
  initialProgress,
}: UseSequentialPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRequestRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<PendingSavePayload | null>(null);
  const lastSaveAtRef = useRef(0);
  const progressRef = useRef<ListenProgressEntry[]>(initialProgress);
  const wasPlayingBeforeSwitchRef = useRef(false);

  const initialPlayback = useMemo(
    () => resolveInitialPlayback(tracks, initialProgress),
    [initialProgress, tracks],
  );

  const [currentTrackIndex, setCurrentTrackIndex] = useState(
    initialPlayback.trackIndex,
  );
  const [src, setSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUrlLoading, setIsUrlLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [playbackRateIndex, setPlaybackRateIndex] = useState(1);
  const [statusMessage, setStatusMessage] = useState("Подготавливаем аудио…");
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

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

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

  const slugRef = useRef(slug);
  const saveProgressRef = useRef<
    (
      audioItemId: string,
      positionSeconds: number,
      completed: boolean,
      options?: { force?: boolean },
    ) => Promise<void>
  >(async () => {});

  useEffect(() => {
    slugRef.current = slug;
  }, [slug]);

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
        const response = await fetch(`/api/listen/${slugRef.current}/progress`, {
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
    [updateProgressEntry],
  );

  useEffect(() => {
    saveProgressRef.current = saveProgress;
  }, [saveProgress]);

  const flushProgress = useCallback(async () => {
    if (!currentTrack) {
      return;
    }

    await saveProgress(
      currentTrack.id,
      currentTime,
      isTrackCompleted(
        currentTrack.durationSeconds,
        currentTime,
        progressRef.current.find((entry) => entry.audioItemId === currentTrack.id)
          ?.completed ?? false,
      ),
      { force: true },
    );
  }, [currentTime, currentTrack, saveProgress]);

  const loadSignedUrl = useCallback(
    async (audioItemId: string) => {
      const requestId = urlRequestRef.current + 1;
      urlRequestRef.current = requestId;
      setIsUrlLoading(true);
      setUrlError(null);
      setStatusMessage("Подготавливаем аудио…");

      try {
        const response = await fetch(
          `/api/listen/${slug}/audio/${audioItemId}`,
        );

        if (requestId !== urlRequestRef.current) {
          return;
        }

        const payload = (await response.json()) as { url?: string; error?: string };

        if (!response.ok || !payload.url) {
          if (response.status === 403) {
            setUrlError("Доступ к прослушиванию не открыт.");
          } else if (response.status === 404) {
            setUrlError("Аудиофайл не найден.");
          } else {
            setUrlError("Не удалось получить ссылку на аудио.");
          }

          setSrc(null);
          setIsUrlLoading(false);
          setIsLoading(false);
          return;
        }

        setSrc(payload.url);
        setIsUrlLoading(false);
      } catch {
        if (requestId !== urlRequestRef.current) {
          return;
        }

        setUrlError("Не удалось получить ссылку на аудио.");
        setSrc(null);
        setIsUrlLoading(false);
        setIsLoading(false);
      }
    },
    [slug],
  );

  const switchToTrack = useCallback(
    async (nextIndex: number, options?: SwitchTrackOptions) => {
      if (nextIndex < 0 || nextIndex >= tracks.length) {
        return;
      }

      const previousTrack = tracks[currentTrackIndex];

      if (previousTrack) {
        await saveProgress(
          previousTrack.id,
          currentTime,
          isTrackCompleted(
            previousTrack.durationSeconds,
            currentTime,
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
    [currentTime, currentTrackIndex, isPlaying, loadSignedUrl, saveProgress, tracks],
  );

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || !currentTrack?.id) {
      return;
    }

    initializedRef.current = true;
    void loadSignedUrl(currentTrack.id);
  }, [currentTrack?.id, loadSignedUrl]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !src) {
      return;
    }

    audio.load();
    setIsLoading(true);
    setStatusMessage("Подготавливаем аудио…");
  }, [src]);

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
      setCurrentTime(audio.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setPlayerError(null);
      setStatusMessage("");
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleWaiting = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setStatusMessage("Загрузка…");
      }
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
      }
    };

    const handleEnded = async () => {
      if (!currentTrack) {
        return;
      }

      setIsPlaying(false);
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

      setProgramCompleted(true);
    };

    const handleError = () => {
      setIsPlaying(false);
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
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audio.playbackRate = PLAYBACK_RATES[playbackRateIndex];

    return () => {
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
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
    switchToTrack,
    tracks.length,
    saveProgress,
    src,
  ]);

  useEffect(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.playbackRate = PLAYBACK_RATES[playbackRateIndex];
    }
  }, [playbackRateIndex]);

  useEffect(() => {
    if (!isPlaying || !currentTrack) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void saveProgress(
        currentTrack.id,
        audioRef.current?.currentTime ?? currentTime,
        false,
      );
    }, PROGRESS_SAVE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentTime, currentTrack, isPlaying, saveProgress]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushProgress();
      }
    };

    const handlePageHide = () => {
      void flushProgress();
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [flushProgress]);

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

    if (isPlaying) {
      audio.pause();
      await flushProgress();
      return;
    }

    try {
      await audio.play();
      setPlayerError(null);
    } catch {
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

    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const handleNextTrack = async () => {
    if (currentTrackIndex >= tracks.length - 1) {
      return;
    }

    await switchToTrack(currentTrackIndex + 1, {
      autoPlay: isPlaying,
      startPosition: 0,
    });
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

  const handleRetry = () => {
    if (!currentTrack) {
      return;
    }

    setPlayerError(null);
    setUrlError(null);
    setIsLoading(true);
    setStatusMessage("Подготавливаем аудио…");
    void loadSignedUrl(currentTrack.id);
  };

  const handleSpeedChange = () => {
    setPlaybackRateIndex((current) => (current + 1) % PLAYBACK_RATES.length);
  };

  const handleStartOver = async () => {
    try {
      const response = await fetch(`/api/listen/${slug}/progress`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setProgressError("Не удалось сбросить прогресс.");
        return;
      }

      setProgress([]);
      progressRef.current = [];
      setProgramCompleted(false);
      setProgressError(null);
      await switchToTrack(0, { autoPlay: false, startPosition: 0 });
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

  return {
    audioRef,
    src,
    isMultiTrack,
    currentTrack,
    currentTrackIndex,
    tracks,
    isPlaying,
    isLoading: isLoading || isUrlLoading,
    hasValidDuration,
    displayDuration,
    currentTime,
    playerError: playerError ?? urlError,
    progressError,
    playbackRate: PLAYBACK_RATES[playbackRateIndex],
    statusMessage,
    programProgressPercent,
    programCompleted,
    isPreviousTrackDisabled:
      currentTrackIndex === 0 && currentTime <= PREVIOUS_TRACK_THRESHOLD_SECONDS,
    isNextTrackDisabled: currentTrackIndex >= tracks.length - 1,
    handlePlayPause,
    handleSeekOffset,
    handleRangeChange,
    handlePreviousTrack,
    handleNextTrack,
    handleSelectTrack,
    handleRetry,
    handleSpeedChange,
    handleStartOver,
    isTrackDone,
    practiceId,
  };
}

export { PLAYBACK_RATES };
