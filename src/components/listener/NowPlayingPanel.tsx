"use client";

import Link from "next/link";

import PlaybackCoverImage from "@/components/images/PlaybackCoverImage";
import AuthorLink from "@/components/authors/AuthorLink";
import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import {
  buildListenPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";

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

function PanelHeading() {
  return (
    <h2 className="text-[17px] font-semibold leading-tight text-[#25135c]">
      Сейчас играет
    </h2>
  );
}

function EmptyState({ embedded }: { embedded: boolean }) {
  return (
    <div
      className={`flex flex-col items-center text-center ${
        embedded ? "px-4 pb-5 pt-1" : "flex-1 justify-center px-6 py-8"
      }`}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#f3ebfc] text-xl text-[#7042c5]"
        aria-hidden="true"
      >
        ♫
      </div>
      <p className="mt-3 text-[15px] font-medium leading-snug text-[#25135c]">
        Пока ничего не играет
      </p>
      <p className="mt-1 max-w-[240px] text-[13px] leading-[1.45] text-[#9485b4]">
        Выберите практику, чтобы начать слушать
      </p>
    </div>
  );
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

type PlaybackControlsProps = {
  queueMode: boolean;
  isPlaying: boolean;
  isPreviousDisabled: boolean;
  isNextDisabled: boolean;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekBack: () => void;
  onSeekForward: () => void;
};

function PlaybackControls({
  queueMode,
  isPlaying,
  isPreviousDisabled,
  isNextDisabled,
  onPlayPause,
  onPrevious,
  onNext,
  onSeekBack,
  onSeekForward,
}: PlaybackControlsProps) {
  const secondaryButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#eadff8] text-[#7042c5] transition hover:border-[#dcc9f2] hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      {queueMode ? (
        <button
          type="button"
          aria-label="Предыдущий трек"
          disabled={isPreviousDisabled}
          onClick={onPrevious}
          className={secondaryButtonClass}
        >
          <PrevIcon />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Назад на 15 секунд"
          onClick={onSeekBack}
          className={secondaryButtonClass}
        >
          <RewindIcon />
        </button>
      )}

      <button
        type="button"
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        onClick={onPlayPause}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#7042c5] text-white shadow-[0_6px_16px_rgba(96,59,168,0.22)] transition hover:bg-[#6234b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {queueMode ? (
        <button
          type="button"
          aria-label="Следующий трек"
          disabled={isNextDisabled}
          onClick={onNext}
          className={secondaryButtonClass}
        >
          <NextIcon />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Вперёд на 15 секунд"
          onClick={onSeekForward}
          className={secondaryButtonClass}
        >
          <ForwardIcon />
        </button>
      )}
    </div>
  );
}

export default function NowPlayingPanel({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { session, activeQueue } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();

  const hasSession = Boolean(session?.tracks.length);
  const isEngineReady = Boolean(engine);
  const queueMode = Boolean(activeQueue);

  const panelShellClass = embedded
    ? "flex min-h-0 flex-1 flex-col overflow-hidden"
    : "flex h-full min-h-0 w-[var(--listener-now-playing-width)] shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-[#fffdfd] shadow-[0_8px_24px_rgba(90,60,145,0.06)]";

  const headingWrapClass = embedded
    ? "shrink-0 px-4 pb-3 pt-5"
    : "shrink-0 border-b border-[#f0e8f8] px-5 py-3";

  if (!hasSession || !session) {
    return (
      <div className={panelShellClass} aria-label="Сейчас играет">
        <div className={headingWrapClass}>
          <PanelHeading />
        </div>
        <EmptyState embedded={embedded} />
      </div>
    );
  }

  const {
    practiceTitle,
    authorName,
    authorSlug,
    productSlug,
    tracks,
    coverImageUrl,
    coverImage,
    coverUpdatedAt,
    coverSymbol,
    coverGradient,
  } = session;

  const currentTrack =
    isEngineReady && engine?.currentTrack
      ? engine.currentTrack
      : (tracks[0] ?? null);
  const currentTrackIndex =
    isEngineReady && engine ? engine.currentTrackIndex : 0;
  const isMultiTrack = tracks.length > 1;
  const displayDuration =
    isEngineReady && engine && engine.displayDuration > 0
      ? engine.displayDuration
      : (currentTrack?.durationSeconds ?? 0);
  const currentTime = isEngineReady && engine ? engine.currentTime : 0;
  const programProgressPercent =
    isEngineReady && engine ? engine.programProgressPercent : 0;
  const progressPercent =
    displayDuration > 0
      ? Math.min(100, (currentTime / displayDuration) * 100)
      : 0;

  const title =
    currentTrack?.title?.trim() || practiceTitle.trim() || "Без названия";
  const activeCoverUrl = currentTrack?.coverImageUrl ?? coverImageUrl;
  const activeCoverImage = currentTrack?.coverImage ?? coverImage ?? null;
  const activeCoverUpdatedAt =
    currentTrack?.coverImage != null
      ? currentTrack.updatedAt ?? null
      : coverUpdatedAt ?? null;
  const description = currentTrack?.description?.trim() ?? "";

  const nextTrack = tracks[currentTrackIndex + 1] ?? null;

  const listenHref =
    authorSlug && productSlug
      ? buildListenPath(authorSlug, productSlug)
      : null;
  const practiceHref =
    authorSlug && productSlug
      ? buildPracticePublicPath(authorSlug, productSlug)
      : null;

  const contentPaddingClass = embedded ? "px-4 pb-4" : "px-5 py-4";

  return (
    <div className={panelShellClass} aria-label="Сейчас играет">
      <div className={headingWrapClass}>
        <PanelHeading />
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${contentPaddingClass}`}>
        <div className="overflow-hidden rounded-[16px] border border-[#f0e8f8] bg-[#faf6ff]">
          {activeCoverUrl ? (
            <PlaybackCoverImage
              coverUrl={activeCoverUrl}
              coverImage={activeCoverImage}
              updatedAt={activeCoverUpdatedAt}
              displayWidth={280}
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div
              className={`flex aspect-square w-full items-center justify-center bg-gradient-to-br ${coverGradient} text-4xl text-white/90`}
              aria-hidden="true"
            >
              {coverSymbol}
            </div>
          )}
        </div>

        <h3 className="mt-3 line-clamp-2 text-[17px] font-semibold leading-snug text-[#25135c]">
          {title}
        </h3>

        {authorName ? (
          <AuthorLink
            authorSlug={authorSlug}
            authorName={authorName}
            className="mt-1.5 inline-block max-w-full truncate text-[14px] font-medium text-[#7042c5]"
          />
        ) : null}

        {displayDuration > 0 ? (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[12px] tabular-nums text-[#9485b4]">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(displayDuration)}</span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eee6f7]"
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
          </div>
        ) : null}

        {isEngineReady && engine ? (
          <PlaybackControls
            queueMode={queueMode}
            isPlaying={engine.isPlaying}
            isPreviousDisabled={engine.isPreviousTrackDisabled}
            isNextDisabled={engine.isNextTrackDisabled}
            onPlayPause={() => {
              void engine.handlePlayPause();
            }}
            onPrevious={() => {
              void engine.handlePreviousTrack();
            }}
            onNext={() => {
              void engine.handleNextTrack();
            }}
            onSeekBack={() => {
              engine.handleSeekOffset(-15);
            }}
            onSeekForward={() => {
              engine.handleSeekOffset(15);
            }}
          />
        ) : null}

        {isMultiTrack ? (
          <p className="mt-3 text-[13px] text-[#9485b4]">
            Шаг {currentTrackIndex + 1} из {tracks.length}
            {programProgressPercent > 0
              ? ` · ${Math.round(programProgressPercent)}%`
              : null}
          </p>
        ) : null}

        {description ? (
          <p className="mt-3 line-clamp-3 text-[13px] leading-[1.45] text-[#9485b4]">
            {description}
          </p>
        ) : null}

        {nextTrack ? (
          <div className="mt-4 rounded-[14px] border border-[#f0e8f8] bg-[#faf6ff] px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9485b4]">
              Далее
            </p>
            <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-[#25135c]">
              {nextTrack.title}
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          {listenHref ? (
            <Link
              href={listenHref}
              className="inline-flex min-h-10 items-center justify-center rounded-[14px] bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6234b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Открыть плеер
            </Link>
          ) : null}
          {practiceHref ? (
            <Link
              href={practiceHref}
              className="inline-flex min-h-10 items-center justify-center rounded-[14px] border border-[#dcc9f2] px-4 py-2 text-sm font-medium text-[#7042c5] transition hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Страница практики
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
