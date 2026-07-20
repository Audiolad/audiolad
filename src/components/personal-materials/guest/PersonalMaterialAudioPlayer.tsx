"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearPersonalMaterialGuestProgress,
  readPersonalMaterialGuestProgress,
  writePersonalMaterialGuestProgress,
} from "@/lib/personal-materials/guest/progress";

type PersonalMaterialAudioPlayerProps = {
  materialId: string;
  audioApiPath: string;
  /** local = guest localStorage; server = callback only (owner library). */
  progressMode?: "local" | "server";
  initialPositionSeconds?: number;
  /** Throttled persist for server mode (default 12000ms). Local mode uses 500ms. */
  persistIntervalMs?: number;
  onProgressPersist?: (input: {
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
  }) => void;
};

type AudioFetchState = "idle" | "loading" | "ready" | "error" | "unavailable";

type SignedAudioResponse = {
  url: string;
  expiresAt: string;
};

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

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

export default function PersonalMaterialAudioPlayer({
  materialId,
  audioApiPath,
  progressMode = "local",
  initialPositionSeconds = 0,
  persistIntervalMs,
  onProgressPersist,
}: PersonalMaterialAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const signedRef = useRef<SignedAudioResponse | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(
    initialPositionSeconds > 0 ? initialPositionSeconds : null,
  );
  const saveTimeoutRef = useRef<number | null>(null);
  const lastPersistAtRef = useRef(0);
  const onProgressPersistRef = useRef(onProgressPersist);

  useEffect(() => {
    onProgressPersistRef.current = onProgressPersist;
  }, [onProgressPersist]);

  const [fetchState, setFetchState] = useState<AudioFetchState>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(
    initialPositionSeconds > 0 ? initialPositionSeconds : 0,
  );
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const persistNow = useCallback(
    (positionSeconds: number, durationSeconds: number, force = false) => {
      const completed = isNearComplete(positionSeconds, durationSeconds);

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

  const isSignedUrlExpired = useCallback(() => {
    const signed = signedRef.current;

    if (!signed) {
      return true;
    }

    const expiresAt = Date.parse(signed.expiresAt);

    if (Number.isNaN(expiresAt)) {
      return true;
    }

    return expiresAt <= Date.now() + 5000;
  }, []);

  const fetchSignedAudio = useCallback(async (): Promise<SignedAudioResponse> => {
    for (let attempt = 0; attempt <= 3; attempt += 1) {
      setFetchState("loading");
      setStatusMessage("Подготавливаем аудио…");

      const response = await fetch(audioApiPath, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 404) {
        setFetchState("unavailable");
        setStatusMessage("Доступ к материалу больше недоступен.");
        clearPersonalMaterialGuestProgress(materialId);
        throw new Error("material_unavailable");
      }

      if (response.status === 429) {
        if (attempt >= 3) {
          setFetchState("error");
          setStatusMessage("Слишком много запросов. Попробуйте позже.");
          throw new Error("rate_limited");
        }

        const delayMs = parseRetryAfterMs(response);
        await new Promise<void>((resolve) => {
          retryTimeoutRef.current = window.setTimeout(resolve, delayMs);
        });
        continue;
      }

      if (!response.ok) {
        setFetchState("error");
        setStatusMessage(
          "Не удалось загрузить аудио. Проверьте соединение и попробуйте ещё раз.",
        );
        throw new Error("audio_fetch_failed");
      }

      const payload = (await response.json()) as SignedAudioResponse;

      if (!payload.url || !payload.expiresAt) {
        setFetchState("error");
        setStatusMessage(
          "Не удалось загрузить аудио. Проверьте соединение и попробуйте ещё раз.",
        );
        throw new Error("invalid_audio_payload");
      }

      signedRef.current = payload;
      setFetchState("ready");
      setStatusMessage(null);

      return payload;
    }

    setFetchState("error");
    setStatusMessage("Слишком много запросов. Попробуйте позже.");
    throw new Error("rate_limited");
  }, [audioApiPath, materialId]);

  const ensureAudioSource = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (!signedRef.current || isSignedUrlExpired()) {
      const signed = await fetchSignedAudio();
      audio.src = signed.url;
      audio.load();
    }
  }, [fetchSignedAudio, isSignedUrlExpired]);

  const restoreSavedPosition = useCallback(() => {
    if (progressMode === "server") {
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

  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    try {
      if (isPlaying) {
        audio.pause();
        return;
      }

      await ensureAudioSource();

      if (pendingSeekRef.current !== null && Number.isFinite(pendingSeekRef.current)) {
        audio.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
      } else {
        restoreSavedPosition();

        if (pendingSeekRef.current !== null && Number.isFinite(pendingSeekRef.current)) {
          audio.currentTime = pendingSeekRef.current;
          pendingSeekRef.current = null;
        }
      }

      await audio.play();
    } catch {
      if (fetchState !== "unavailable") {
        setFetchState("error");
        setStatusMessage(
          "Не удалось загрузить аудио. Проверьте соединение и попробуйте ещё раз.",
        );
      }
    }
  }, [ensureAudioSource, fetchState, isPlaying, restoreSavedPosition]);

  const handleRetry = useCallback(async () => {
    clearRetryTimeout();
    signedRef.current = null;
    setFetchState("idle");
    setStatusMessage(null);

    try {
      await ensureAudioSource();
    } catch {
      // Error state already set in fetchSignedAudio.
    }
  }, [clearRetryTimeout, ensureAudioSource]);

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

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      scheduleProgressSave(audio.currentTime, audio.duration || duration);
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      scheduleProgressSave(audio.currentTime, audio.duration || duration, true);
    };
    const onEnded = () => {
      setIsPlaying(false);
      scheduleProgressSave(audio.duration || duration, audio.duration || duration, true);
      if (progressMode === "local") {
        clearPersonalMaterialGuestProgress(materialId);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

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
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [duration, materialId, progressMode, scheduleProgressSave]);

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

  return (
    <section
      aria-label="Плеер персональной диагностики"
      className="rounded-2xl border border-[#ece6f5] bg-[#fcfbfe] p-4 sm:p-5"
    >
      <audio ref={audioRef} preload="none" playsInline />

      <div aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      {fetchState === "loading" && (
        <p className="mb-4 text-sm text-[#6d628f]">Подготавливаем аудио…</p>
      )}

      {fetchState === "error" && (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-[#6d628f]">
            Не удалось загрузить аудио. Проверьте соединение и попробуйте ещё раз.
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            Повторить
          </button>
        </div>
      )}

      {fetchState === "unavailable" && (
        <p className="mb-4 text-sm text-[#6d628f]">Доступ к материалу больше недоступен.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={fetchState === "unavailable"}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
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
