"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { PLAYBACK_RATES } from "@/components/audio/useSequentialPlayer";
import { isPrivateAudioSession } from "@/lib/listen/global-player-types";
import { buildPrivateAudioGlobalSession } from "@/lib/private-audio/global-session";
import type { PrivateAudioDetailDto } from "@/lib/private-audio/types";

type PrivateAudioGlobalPlayerControlsProps = {
  item: PrivateAudioDetailDto;
  onProgressLabelChange?: (input: {
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
  }) => void;
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

export default function PrivateAudioGlobalPlayerControls({
  item,
  onProgressLabelChange,
}: PrivateAudioGlobalPlayerControlsProps) {
  const { session, loadSession } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();

  const isActive =
    Boolean(session) &&
    isPrivateAudioSession(session!) &&
    session!.itemId === item.id;

  const [bootstrapping, setBootstrapping] = useState(false);

  const currentTime = isActive
    ? engine?.currentTime ?? item.progress.positionSeconds
    : item.progress.positionSeconds;
  const duration = isActive
    ? engine?.displayDuration || item.durationSeconds || 0
    : item.durationSeconds || item.progress.durationSeconds || 0;
  const isPlaying = Boolean(isActive && engine?.isPlaying);
  const playbackRate = isActive ? engine?.playbackRate ?? 1 : 1;
  const statusMessage = isActive ? engine?.statusMessage : null;
  const playerError = isActive ? engine?.playerError : null;
  const isLoading = Boolean(isActive && engine?.isLoading);

  useEffect(() => {
    if (!isActive || !engine || !onProgressLabelChange) {
      return;
    }

    onProgressLabelChange({
      positionSeconds: engine.currentTime,
      durationSeconds:
        engine.displayDuration || item.durationSeconds || 0,
      completed: item.progress.completed,
    });
  }, [
    engine,
    engine?.currentTime,
    engine?.displayDuration,
    isActive,
    item.durationSeconds,
    item.progress.completed,
    onProgressLabelChange,
  ]);

  const startOrResume = useCallback(async () => {
    if (isActive && engine) {
      await engine.handlePlayPause();
      return;
    }

    setBootstrapping(true);

    try {
      loadSession(
        buildPrivateAudioGlobalSession(item, {
          requestAutoplay: true,
        }),
      );
    } finally {
      setBootstrapping(false);
    }
  }, [engine, isActive, item, loadSession]);

  const handleSeekOffset = useCallback(
    (offset: number) => {
      if (!isActive || !engine) {
        return;
      }

      engine.handleSeekOffset(offset);
    },
    [engine, isActive],
  );

  const handleRangeChange = useCallback(
    (value: number) => {
      if (!isActive || !engine) {
        return;
      }

      engine.handleRangeChange(value);
    },
    [engine, isActive],
  );

  const handleSpeedChange = useCallback(() => {
    if (!isActive || !engine) {
      return;
    }

    engine.handleSpeedChange();
  }, [engine, isActive]);

  const progressMax = duration > 0 ? duration : 100;
  const progressValue = duration > 0 ? currentTime : 0;

  const rateLabel = useMemo(() => {
    const match = PLAYBACK_RATES.find((rate) => rate === playbackRate);
    return match ?? playbackRate;
  }, [playbackRate]);

  return (
    <section
      aria-label="Плеер аудиоматериала"
      className="rounded-2xl border border-[#ece6f5] bg-[#fcfbfe] p-4 sm:p-5"
    >
      <div aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      {isLoading || bootstrapping ? (
        <p className="mb-4 text-sm text-[#6d628f]">Подготавливаем аудио…</p>
      ) : null}

      {playerError ? (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-[#6d628f]">{playerError}</p>
          {isActive && engine ? (
            <button
              type="button"
              onClick={() => engine.handleRetry()}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
            >
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void startOrResume()}
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
          onClick={() => handleSeekOffset(-15)}
          disabled={!isActive || !engine?.hasValidDuration}
          aria-label="Назад на 15 секунд"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[#ded5ef] px-3 text-xs font-semibold text-[#5f5484] disabled:opacity-40"
        >
          −15
        </button>

        <button
          type="button"
          onClick={() => handleSeekOffset(15)}
          disabled={!isActive || !engine?.hasValidDuration}
          aria-label="Вперёд на 15 секунд"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[#ded5ef] px-3 text-xs font-semibold text-[#5f5484] disabled:opacity-40"
        >
          +15
        </button>

        <button
          type="button"
          onClick={handleSpeedChange}
          disabled={!isActive}
          aria-label={`Скорость воспроизведения ${rateLabel}x`}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#ded5ef] px-3 text-xs font-semibold text-[#5f5484] disabled:opacity-40"
        >
          {rateLabel}x
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
          disabled={!isActive || !engine?.hasValidDuration}
          onChange={(event) => handleRangeChange(Number(event.target.value))}
          className="mt-1 w-full accent-[#7042c5] disabled:opacity-40"
        />
      </label>
    </section>
  );
}
