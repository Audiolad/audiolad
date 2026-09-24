"use client";

import { useMaxAudioPlayback } from "@/components/max/useMaxAudioPlayback";
import { formatMaxDuration } from "@/lib/max/format-duration";
import type { MaxPlaybackSession } from "@/lib/max/playback-types";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  return formatMaxDuration(seconds);
}

export default function MaxAudioPlayer({
  session,
  fetchAudio,
}: {
  session: MaxPlaybackSession;
  fetchAudio: (
    trackId: string,
    signal: AbortSignal,
  ) => Promise<{ ok: true; url: string } | { ok: false; reason: string }>;
}) {
  const {
    audioRef,
    currentTrack,
    trackIndex,
    isPlaying,
    isPreparing,
    currentTime,
    duration,
    error,
    play,
    pause,
    seek,
    skipBy,
    selectTrack,
    nextTrack,
    previousTrack,
    canGoPrevious,
    canGoNext,
  } = useMaxAudioPlayback({ session, fetchAudio });

  const currentTitle = currentTrack?.title ?? session.title;
  const sliderMax = duration > 0 ? duration : 0;

  return (
    <section className="mt-6 rounded-2xl border border-[#e8def5] bg-white p-4">
      <audio ref={audioRef} preload="none" />
      <p className="text-sm font-medium text-[#25135c]">{currentTitle}</p>
      {isPreparing ? (
        <p className="mt-2 text-sm text-[#6c5d94]">Подготавливаем аудио…</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-[#8a3a5a]">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={previousTrack}
          disabled={!canGoPrevious}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#eadff8] text-sm font-medium text-[#7042c5] disabled:opacity-40"
        >
          Пред
        </button>
        <button
          type="button"
          onClick={() => skipBy(-15)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#eadff8] text-sm font-medium text-[#7042c5]"
        >
          −15
        </button>
        <button
          type="button"
          onClick={isPlaying ? pause : play}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white"
        >
          {isPlaying ? "Пауза" : "Слушать"}
        </button>
        <button
          type="button"
          onClick={() => skipBy(15)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#eadff8] text-sm font-medium text-[#7042c5]"
        >
          +15
        </button>
        <button
          type="button"
          onClick={nextTrack}
          disabled={!canGoNext}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#eadff8] text-sm font-medium text-[#7042c5] disabled:opacity-40"
        >
          След
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={sliderMax || 1}
        step={1}
        value={clampDisplayTime(currentTime, sliderMax)}
        onChange={(event) => seek(Number(event.target.value))}
        className="mt-4 w-full"
        aria-label="Положение трека"
      />
      <p className="mt-1 text-xs text-[#6c5d94]">
        {formatClock(currentTime)} / {formatClock(duration)}
      </p>

      <ol className="mt-4 space-y-2">
        {session.tracks.map((track, index) => {
          const active = index === trackIndex;
          return (
            <li key={track.trackId}>
              <button
                type="button"
                onClick={() => selectTrack(index)}
                className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm ${
                  active ? "bg-[#f3edfb] font-medium text-[#7042c5]" : "text-[#25135c]"
                }`}
              >
                <span>
                  {track.position}. {track.title}
                </span>
                {track.durationSeconds !== null ? (
                  <span className="text-xs text-[#6c5d94]">
                    {formatMaxDuration(track.durationSeconds)}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function clampDisplayTime(current: number, max: number): number {
  if (!Number.isFinite(current) || current < 0) {
    return 0;
  }
  if (!Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return Math.min(current, max);
}
