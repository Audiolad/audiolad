"use client";

import { useEffect } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";

export const DESKTOP_PLAYER_BAR_HEIGHT_PX = 96;

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

function RewindIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
      <path
        d="M19 12H8M12 7 7 12l5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
      <path
        d="M5 12h11M12 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
      <rect x="5.5" y="5" width="2.5" height="14" rx="0.5" />
      <path d="M18 5v14L8 12Z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
      <path d="M6 5v14l10-7Z" />
      <rect x="16" y="5" width="2.5" height="14" rx="0.5" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M7 5.5h3.5v13H7V5.5Zm6.5 0H17v13h-3.5V5.5Z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
      <path
        d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DesktopPlayerBar() {
  const { session, showMiniPlayer, openFullPlayer, activeQueue } =
    useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();

  const isVisible = Boolean(showMiniPlayer && session && engine);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");

    const syncHeight = () => {
      const height =
        isVisible && media.matches
          ? `${DESKTOP_PLAYER_BAR_HEIGHT_PX}px`
          : "0px";
      document.documentElement.style.setProperty(
        "--listener-desktop-player-height",
        height,
      );
    };

    syncHeight();
    media.addEventListener("change", syncHeight);

    return () => {
      media.removeEventListener("change", syncHeight);
      document.documentElement.style.setProperty(
        "--listener-desktop-player-height",
        "0px",
      );
    };
  }, [isVisible]);

  if (!isVisible || !session || !engine) {
    return null;
  }

  const queueMode = Boolean(activeQueue);
  const activeCoverUrl =
    engine.currentTrack?.coverImageUrl ?? session.coverImageUrl;
  const title =
    engine.currentTrack?.title?.trim() || session.practiceTitle;
  const subtitle = session.authorName;

  const progressPercent =
    engine.displayDuration > 0
      ? Math.min(100, (engine.currentTime / engine.displayDuration) * 100)
      : 0;

  const secondaryButtonClass =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#eadff8] text-[#7042c5] transition hover:border-[#dcc9f2] hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      className="desktop-player-bar hidden shrink-0 border-t border-[#eadff8] bg-[#fffdfd] shadow-[0_-4px_16px_rgba(90,60,145,0.06)] xl:flex xl:flex-col xl:justify-center"
      style={{ height: `${DESKTOP_PLAYER_BAR_HEIGHT_PX}px` }}
      aria-label="Плеер"
    >
      <div className="flex min-h-0 items-center gap-4 px-5 py-2">
        <div className="flex min-w-0 max-w-[240px] flex-1 items-center gap-3">
          <div
            className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-gradient-to-br ${session.coverGradient} text-xl text-white shadow-inner`}
          >
            {activeCoverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeCoverUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              session.coverSymbol
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p
              className="line-clamp-2 text-[15px] font-semibold leading-snug text-[#25135c]"
              title={title}
            >
              {title}
            </p>
            {subtitle ? (
              <p
                className="mt-0.5 truncate text-[13px] text-[#7042c5]"
                title={subtitle}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-[1.4] flex-col gap-2">
          <div className="flex items-center justify-center gap-1.5">
            {queueMode ? (
              <button
                type="button"
                aria-label="Предыдущий трек"
                disabled={engine.isPreviousTrackDisabled}
                onClick={() => {
                  void engine.handlePreviousTrack();
                }}
                className={secondaryButtonClass}
              >
                <PrevIcon />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Назад на 15 секунд"
                disabled={!engine.hasValidDuration}
                onClick={() => {
                  engine.handleSeekOffset(-15);
                }}
                className={secondaryButtonClass}
              >
                <RewindIcon />
              </button>
            )}

            <button
              type="button"
              aria-label={engine.isPlaying ? "Пауза" : "Воспроизвести"}
              onClick={() => {
                void engine.handlePlayPause();
              }}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white shadow-[0_6px_16px_rgba(96,59,168,0.22)] transition hover:bg-[#6234b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              {engine.isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            {queueMode ? (
              <button
                type="button"
                aria-label="Следующий трек"
                disabled={engine.isNextTrackDisabled}
                onClick={() => {
                  void engine.handleNextTrack();
                }}
                className={secondaryButtonClass}
              >
                <NextIcon />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Вперёд на 15 секунд"
                disabled={!engine.hasValidDuration}
                onClick={() => {
                  engine.handleSeekOffset(15);
                }}
                className={secondaryButtonClass}
              >
                <ForwardIcon />
              </button>
            )}
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-[#9485b4]">
              {formatTime(engine.currentTime)}
            </span>

            {engine.hasValidDuration ? (
              <input
                type="range"
                min={0}
                max={engine.displayDuration}
                step={0.1}
                value={engine.currentTime}
                onChange={(event) => {
                  engine.handleRangeChange(Number(event.target.value));
                }}
                aria-label="Прогресс воспроизведения"
                aria-valuemin={0}
                aria-valuemax={Math.round(engine.displayDuration)}
                aria-valuenow={Math.round(engine.currentTime)}
                className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[#eee6f7] accent-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              />
            ) : (
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#eee6f7]"
                role="progressbar"
                aria-valuenow={Math.round(progressPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Прогресс воспроизведения"
              >
                <div
                  className="h-full rounded-full bg-[#7042c5] transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            <span className="w-10 shrink-0 text-[11px] tabular-nums text-[#9485b4]">
              {formatTime(engine.displayDuration)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Открыть полный плеер"
            onClick={() => {
              openFullPlayer();
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#eadff8] text-[#7042c5] transition hover:border-[#dcc9f2] hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <ExpandIcon />
          </button>

          <button
            type="button"
            onClick={() => {
              engine.handleSpeedChange();
            }}
            aria-label={`Скорость воспроизведения ${engine.playbackRate}×`}
            className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-[#eadff8] px-3 text-[13px] font-semibold tabular-nums text-[#7042c5] transition hover:border-[#dcc9f2] hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {engine.playbackRate}×
          </button>
        </div>
      </div>
    </section>
  );
}
