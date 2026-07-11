"use client";

import { useEffect, useRef, useState } from "react";

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const;

type AudioPlayerProps = {
  src: string;
  title: string;
  authorName: string;
  slug: string;
  format: string | null;
  expectedDurationSeconds: number | null;
  coverSymbol: string;
  coverGradient: string;
};

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-9 w-9 sm:h-10 sm:w-10"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-9 w-9 sm:h-10 sm:w-10"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 5.5h3.5v13H7V5.5Zm6.5 0H17v13h-3.5V5.5Z" />
    </svg>
  );
}

function PreviousTrackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5.5" y="5" width="2.5" height="14" rx="0.5" />
      <path d="M18 5v14L8 12Z" />
    </svg>
  );
}

function NextTrackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 5v14l10-7Z" />
      <rect x="16" y="5" width="2.5" height="14" rx="0.5" />
    </svg>
  );
}

function RewindFifteenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19 12H8" />
      <path d="M12 7 7 12l5 5" />
    </svg>
  );
}

function ForwardFifteenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h11" />
      <path d="m12 7 5 5-5 5" />
    </svg>
  );
}

function ControlCaption({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string;
}) {
  return (
    <p className="mt-1.5 max-w-[4.75rem] text-center text-[10px] leading-tight text-white/55 sm:max-w-none sm:text-[11px]">
      <span className="block">{primary}</span>
      <span className="block">{secondary}</span>
    </p>
  );
}

export default function AudioPlayer({
  src,
  title,
  authorName,
  format,
  expectedDurationSeconds,
  coverSymbol,
  coverGradient,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playbackRateIndex, setPlaybackRateIndex] = useState(1);
  const [statusMessage, setStatusMessage] = useState("Подготавливаем аудио…");

  const hasValidDuration = Number.isFinite(duration) && duration > 0;
  const displayDuration = hasValidDuration
    ? duration
    : expectedDurationSeconds && expectedDurationSeconds > 0
      ? expectedDurationSeconds
      : 0;

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const updateDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        setIsLoading(false);
        setStatusMessage("");
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
      if (hasValidDuration || (Number.isFinite(audio.duration) && audio.duration > 0)) {
        setStatusMessage("Загрузка…");
      }
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      if (!playerError) {
        setStatusMessage("");
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
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
  }, [hasValidDuration, playbackRateIndex, playerError, src]);

  useEffect(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.playbackRate = PLAYBACK_RATES[playbackRateIndex];
    }
  }, [playbackRateIndex]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.ended) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }

    if (isPlaying) {
      audio.pause();
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

  const handleRetry = () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    setPlayerError(null);
    setIsLoading(true);
    setStatusMessage("Подготавливаем аудио…");
    audio.load();
  };

  const handleSpeedChange = () => {
    setPlaybackRateIndex((current) => (current + 1) % PLAYBACK_RATES.length);
  };

  const trimmedFormat = typeof format === "string" ? format.trim() : "";

  return (
    <div className="relative z-10">
      <audio ref={audioRef} src={src} preload="metadata" />

      <section className="mt-6 motion-reduce:transition-none">
        <div
          className={`relative aspect-square overflow-hidden rounded-[34px] bg-gradient-to-br ${coverGradient} shadow-[0_28px_70px_rgba(20,8,42,0.38)]`}
        >
          <div className="absolute -left-10 -top-10 h-52 w-52 rounded-full bg-white/15 blur-2xl motion-reduce:blur-none" />
          <div className="absolute -bottom-12 -right-10 h-56 w-56 rounded-full bg-[#f7d2c8]/30 blur-2xl motion-reduce:blur-none" />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-44 w-44 items-center justify-center rounded-full border border-white/40 bg-white/10 text-[100px] text-white shadow-[0_0_60px_rgba(255,255,255,0.28)]">
              {coverSymbol}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-7 text-center">
        <h1 className="text-[29px] font-semibold leading-tight">{title}</h1>
        <p className="mt-2 text-sm font-medium text-white/70">{authorName}</p>
        {trimmedFormat && (
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/50">
            {trimmedFormat}
          </p>
        )}
      </section>

      <section className="mt-8" aria-live="polite">
        {playerError ? (
          <div className="rounded-[20px] border border-white/15 bg-white/10 px-4 py-4 text-center">
            <p className="text-sm leading-6 text-white/85">{playerError}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-4 min-h-11 rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Попробовать снова
            </button>
          </div>
        ) : (
          <>
            {(isLoading || statusMessage) && (
              <p className="mb-4 text-center text-sm text-white/65">
                {statusMessage || "Подготавливаем аудио…"}
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-white/65">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(displayDuration)}</span>
            </div>

            <input
              type="range"
              min={0}
              max={hasValidDuration ? duration : 0}
              step={0.1}
              value={hasValidDuration ? currentTime : 0}
              disabled={!hasValidDuration}
              onChange={(event) => handleRangeChange(Number(event.target.value))}
              aria-label="Прогресс воспроизведения"
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
            />

            <div className="mt-8 grid grid-cols-5 items-start gap-0.5 px-0.5 sm:gap-2 sm:px-0">
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  disabled
                  aria-label="Предыдущая практика"
                  title="Очередь практик скоро появится"
                  className="flex h-10 w-10 min-h-11 min-w-11 cursor-not-allowed items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/45 opacity-[0.55] sm:h-11 sm:w-11"
                >
                  <PreviousTrackIcon />
                </button>
                <ControlCaption primary="Предыдущая" secondary="практика" />
              </div>

              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => handleSeekOffset(-15)}
                  disabled={!hasValidDuration}
                  aria-label="Назад на 15 секунд"
                  className="flex h-12 w-12 min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 sm:h-[52px] sm:w-[52px]"
                >
                  <RewindFifteenIcon />
                </button>
                <ControlCaption primary="Назад" secondary="15 секунд" />
              </div>

              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={handlePlayPause}
                  aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                  className="flex h-16 w-16 min-h-11 min-w-11 items-center justify-center rounded-full bg-white text-[#4b2f86] shadow-[0_18px_40px_rgba(0,0,0,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:h-[72px] sm:w-[72px]"
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>

                <button
                  type="button"
                  onClick={handleSpeedChange}
                  aria-label={`Скорость воспроизведения ${PLAYBACK_RATES[playbackRateIndex]}×`}
                  className="mt-3 min-h-11 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {PLAYBACK_RATES[playbackRateIndex]}×
                </button>
              </div>

              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => handleSeekOffset(15)}
                  disabled={!hasValidDuration}
                  aria-label="Вперёд на 15 секунд"
                  className="flex h-12 w-12 min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 sm:h-[52px] sm:w-[52px]"
                >
                  <ForwardFifteenIcon />
                </button>
                <ControlCaption primary="Вперёд" secondary="15 секунд" />
              </div>

              <div className="flex flex-col items-center">
                <button
                  type="button"
                  disabled
                  aria-label="Следующая практика"
                  title="Очередь практик скоро появится"
                  className="flex h-10 w-10 min-h-11 min-w-11 cursor-not-allowed items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/45 opacity-[0.55] sm:h-11 sm:w-11"
                >
                  <NextTrackIcon />
                </button>
                <ControlCaption primary="Следующая" secondary="практика" />
              </div>
            </div>
          </>
        )}
      </section>

      <section className="mt-8 rounded-[24px] border border-white/12 bg-white/8 px-5 py-5">
        <h2 className="text-[17px] font-semibold">Перед прослушиванием</h2>
        <p className="mt-3 text-sm leading-6 text-white/70">
          Выберите спокойное и безопасное место. Не включайте практику во время
          управления транспортом или работы, требующей постоянной концентрации.
        </p>
      </section>
    </div>
  );
}
