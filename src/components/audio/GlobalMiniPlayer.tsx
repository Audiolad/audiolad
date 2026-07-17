"use client";

import AuthorLink from "@/components/authors/AuthorLink";
import {
  GLOBAL_MINI_PLAYER_HEIGHT_PX,
  useGlobalAudioPlayer,
  usePlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import { BOTTOM_NAV_MAIN_HEIGHT_PX } from "@/lib/navigation/bottom-nav";

function MiniRewindIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M19 12H8M12 7 7 12l5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MiniForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M5 12h11M12 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MiniPrevIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <rect x="5.5" y="5" width="2.5" height="14" rx="0.5" />
      <path d="M18 5v14L8 12Z" />
    </svg>
  );
}

function MiniNextIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M6 5v14l10-7Z" />
      <rect x="16" y="5" width="2.5" height="14" rx="0.5" />
    </svg>
  );
}

function MiniPlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function MiniPauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M7 5.5h3.5v13H7V5.5Zm6.5 0H17v13h-3.5V5.5Z" />
    </svg>
  );
}

function MiniCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function GlobalMiniPlayer() {
  const { session, showMiniPlayer, openFullPlayer, stopAndClear, activeQueue } =
    useGlobalAudioPlayer();
  const engine = usePlayerEngine();

  if (!showMiniPlayer || !session) {
    return null;
  }

  const activeSession = session;
  const queueMode = Boolean(activeQueue);

  const progressPercent =
    engine.displayDuration > 0
      ? Math.min(100, (engine.currentTime / engine.displayDuration) * 100)
      : 0;

  const activeCoverUrl =
    engine.currentTrack?.coverImageUrl ?? activeSession.coverImageUrl;

  const title =
    engine.currentTrack?.title?.trim() || activeSession.practiceTitle;
  const subtitle = activeSession.authorName;

  function handleOpenFullPlayer() {
    openFullPlayer();
  }

  return (
    <div
      className="global-mini-player fixed inset-x-0 z-30 border-t border-white/10 bg-gradient-to-r from-[#5a3a96] via-[#6f4bbb] to-[#4b2f86] shadow-[0_-10px_30px_rgba(36,19,63,0.35)] xl:hidden"
      style={{
        bottom: `calc(${BOTTOM_NAV_MAIN_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`,
        height: `${GLOBAL_MINI_PLAYER_HEIGHT_PX}px`,
      }}
      aria-label="Мини-плеер"
    >
      <div className="relative mx-auto flex h-full w-full max-w-[430px] flex-col px-3 py-2">
        <button
          type="button"
          aria-label="Закрыть плеер"
          onClick={(event) => {
            event.stopPropagation();
            stopAndClear();
          }}
          className="absolute right-2 top-1.5 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white/55 transition hover:text-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <MiniCloseIcon />
        </button>

        <div className="flex min-h-0 flex-1 items-center gap-3 pr-8">
          <button
            type="button"
            onClick={handleOpenFullPlayer}
            className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
            aria-label={`Открыть полный плеер: ${title}`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-gradient-to-br ${activeSession.coverGradient} text-xl text-white shadow-inner`}
            >
              {activeCoverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeCoverUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                activeSession.coverSymbol
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{title}</p>
              {subtitle ? (
                <AuthorLink
                  authorSlug={activeSession.authorSlug}
                  authorName={subtitle}
                  stopPropagation
                  className="truncate text-xs text-white/70 hover:text-white"
                />
              ) : null}
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            {queueMode ? (
              <button
                type="button"
                aria-label="Предыдущий трек"
                disabled={engine.isPreviousTrackDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  void engine.handlePreviousTrack();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <MiniPrevIcon />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Назад на 15 секунд"
                onClick={(event) => {
                  event.stopPropagation();
                  engine.handleSeekOffset(-15);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <MiniRewindIcon />
              </button>
            )}

            <button
              type="button"
              aria-label={engine.isPlaying ? "Пауза" : "Воспроизвести"}
              onClick={(event) => {
                event.stopPropagation();
                void engine.handlePlayPause();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#4b2f86] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {engine.isPlaying ? <MiniPauseIcon /> : <MiniPlayIcon />}
            </button>

            {queueMode ? (
              <button
                type="button"
                aria-label="Следующий трек"
                disabled={engine.isNextTrackDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  void engine.handleNextTrack();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <MiniNextIcon />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Вперёд на 15 секунд"
                onClick={(event) => {
                  event.stopPropagation();
                  engine.handleSeekOffset(15);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <MiniForwardIcon />
              </button>
            )}
          </div>
        </div>

        <div
          className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/20"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-white/85 transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
