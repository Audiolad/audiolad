"use client";

import { useState } from "react";

import FormattedPlainText from "@/components/FormattedPlainText";
import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import PromoPlaybackPrompts from "@/components/promo/PromoPlaybackPrompts";
import type { LoadSessionInput } from "@/lib/listen/global-player-types";
import type { ListenTrack } from "@/lib/listen/types";

type AudioPlayerProps = {
  practiceId: string;
  practiceTitle: string;
  authorName: string;
  format: string | null;
  tracks: ListenTrack[];
  coverSymbol: string;
  coverGradient: string;
  coverImageUrl?: string | null;
  isAuthorPreview?: boolean;
  sessionPayload?: LoadSessionInput;
  promoConversionMode?: boolean;
  authorSlug?: string;
  productSlug?: string;
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

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NowPlayingIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="4" width="2.5" height="8" rx="0.75" />
      <rect x="6.75" y="2" width="2.5" height="12" rx="0.75" />
      <rect x="12.5" y="5" width="2.5" height="6" rx="0.75" />
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
  practiceId,
  practiceTitle,
  authorName,
  format,
  tracks,
  coverSymbol,
  coverGradient,
  coverImageUrl = null,
  isAuthorPreview = false,
  sessionPayload,
  promoConversionMode = false,
  authorSlug = "",
  productSlug = "",
}: AudioPlayerProps) {
  const {
    session,
    loadSession,
    dismissedPracticeId,
    activeQueue,
    queueCompleted,
    restartPlaylistQueue,
    returnToPlaylistSource,
    noticeMessage,
    clearNoticeMessage,
  } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const isEngineReady =
    Boolean(engine) && session?.practiceId === practiceId;
  const isDismissedIdle =
    dismissedPracticeId === practiceId && !isEngineReady;

  const [coverImageFailedUrl, setCoverImageFailedUrl] = useState<string | null>(
    null,
  );
  const [restartingQueue, setRestartingQueue] = useState(false);
  const queueLabel =
    activeQueue && !queueCompleted
      ? `Плейлист: ${activeQueue.currentIndex + 1} из ${activeQueue.entries.length}`
      : null;

  const {
    isMultiTrack = tracks.length > 1,
    currentTrack = tracks[0] ?? null,
    currentTrackIndex = 0,
    isPlaying = false,
    isLoading = true,
    hasValidDuration = false,
    displayDuration = 0,
    currentTime = 0,
    playerError = null,
    progressError = null,
    playbackRate = 1,
    statusMessage = "Подготавливаем аудио…",
    programProgressPercent = 0,
    programCompleted = false,
    isPreviousTrackDisabled = true,
    isNextTrackDisabled = true,
    handlePlayPause = async () => {},
    handleSeekOffset = () => {},
    handleRangeChange = () => {},
    handlePreviousTrack = async () => {},
    handleNextTrack = async () => {},
    handleSelectTrack = async () => {},
    handleRetry = () => {},
    handleSpeedChange = () => {},
    handleStartOver = async () => {},
    isTrackDone = () => false,
    src = null,
  } = isEngineReady && engine
    ? engine
    : {};

  const activeCoverUrl =
    currentTrack?.coverImageUrl ?? coverImageUrl ?? null;

  const showCoverImage =
    Boolean(activeCoverUrl) && coverImageFailedUrl !== activeCoverUrl;

  const trimmedFormat = typeof format === "string" ? format.trim() : "";
  const currentTrackTitle = currentTrack?.title?.trim() || practiceTitle;
  const showTrackTitle =
    isMultiTrack &&
    currentTrackTitle.toLowerCase() !== practiceTitle.trim().toLowerCase();
  const currentDescription = currentTrack?.description ?? "";

  return (
    <div className="relative z-10">
      {isDismissedIdle && sessionPayload ? (
        <section className="mt-6 text-center">
          <p className="text-sm text-white/70">
            Воспроизведение остановлено. Нажмите, чтобы начать снова.
          </p>
          <button
            type="button"
            onClick={() =>
              loadSession({
                ...sessionPayload,
                requestAutoplay: true,
              })
            }
            className="mt-4 min-h-11 rounded-full bg-white px-6 py-2 text-sm font-semibold text-[#4b2f86] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Воспроизвести
          </button>
        </section>
      ) : !isEngineReady ? (
        <p className="mt-6 text-center text-sm text-white/65">
          Подготавливаем плеер…
        </p>
      ) : null}

      {isAuthorPreview ? (
        <p className="mt-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-center text-xs text-white/75">
          Режим предпросмотра автора
        </p>
      ) : null}

      <section className="mt-6 motion-reduce:transition-none">
        <div
          className={`relative aspect-square overflow-hidden rounded-[34px] shadow-[0_28px_70px_rgba(20,8,42,0.38)] ${
            showCoverImage ? "bg-[#2b1749]" : `bg-gradient-to-br ${coverGradient}`
          }`}
        >
          {showCoverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeCoverUrl ?? undefined}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => {
                if (activeCoverUrl) {
                  setCoverImageFailedUrl(activeCoverUrl);
                }
              }}
            />
          ) : (
            <>
              <div className="absolute -left-10 -top-10 h-52 w-52 rounded-full bg-white/15 blur-2xl motion-reduce:blur-none" />
              <div className="absolute -bottom-12 -right-10 h-56 w-56 rounded-full bg-[#f7d2c8]/30 blur-2xl motion-reduce:blur-none" />

              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-44 w-44 items-center justify-center rounded-full border border-white/40 bg-white/10 text-[100px] text-white shadow-[0_0_60px_rgba(255,255,255,0.28)]">
                  {coverSymbol}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {noticeMessage ? (
        <div className="mt-4 rounded-[18px] border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/85">
          <p>{noticeMessage}</p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-white/70 underline"
            onClick={clearNoticeMessage}
          >
            Скрыть
          </button>
        </div>
      ) : null}

      {queueCompleted && activeQueue ? (
        <section className="mt-10 rounded-[28px] border border-white/15 bg-white/10 px-6 py-8 text-center">
          <h2 className="text-[24px] font-semibold">Плейлист прослушан</h2>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Вы прослушали все доступные материалы этой подборки.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              disabled={restartingQueue}
              onClick={() => {
                void (async () => {
                  setRestartingQueue(true);
                  await restartPlaylistQueue();
                  setRestartingQueue(false);
                })();
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#4b2f86] disabled:opacity-60"
            >
              {restartingQueue ? "Запуск…" : "Прослушать ещё раз"}
            </button>
            <button
              type="button"
              onClick={returnToPlaylistSource}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm font-semibold text-white"
            >
              Вернуться к плейлисту
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-7 text-center">
        {queueLabel ? (
          <p className="text-xs uppercase tracking-[0.14em] text-white/55">
            {queueLabel}
            {activeQueue?.title ? ` · ${activeQueue.title}` : ""}
          </p>
        ) : null}
        <h1 className="mt-2 text-[29px] font-semibold leading-tight">
          {practiceTitle}
        </h1>
        {showTrackTitle ? (
          <p className="mt-2 text-[18px] font-medium leading-snug text-white/90">
            {currentTrackTitle}
          </p>
        ) : null}
        {isMultiTrack ? (
          <p className="mt-2 text-sm text-white/65">
            Аудио {currentTrackIndex + 1} из {tracks.length}
          </p>
        ) : null}
        <p className="mt-2 text-sm font-medium text-white/70">{authorName}</p>
        {trimmedFormat ? (
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/50">
            {trimmedFormat}
          </p>
        ) : null}
        {currentDescription.trim() ? (
          <FormattedPlainText
            text={currentDescription}
            className="mx-auto mt-3 max-w-[28rem] text-sm leading-6 text-white/70"
          />
        ) : null}
      </section>

      {isEngineReady && isMultiTrack ? (
        <section className="mt-6" aria-label="Общий прогресс программы">
          <div className="flex items-center justify-between text-xs text-white/65">
            <span>Пройдено {programProgressPercent}%</span>
            {programCompleted ? (
              <span className="text-white/80">Программа завершена</span>
            ) : null}
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-white/20"
            role="progressbar"
            aria-valuenow={programProgressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Общий прогресс программы"
          >
            <div
              className="h-full rounded-full bg-white transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${programProgressPercent}%` }}
            />
          </div>
        </section>
      ) : null}

      {isEngineReady ? (
      <section className="mt-8" aria-live="polite">
        {playerError ? (
          <div className="rounded-[20px] border border-white/15 bg-white/10 px-4 py-4 text-center">
            <p className="text-sm leading-6 text-white/85">{playerError}</p>
            <button
              type="button"
              onClick={handleRetry}
              disabled={!isEngineReady}
              className="mt-4 min-h-11 rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
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
              max={hasValidDuration ? displayDuration : 0}
              step={0.1}
              value={hasValidDuration ? currentTime : 0}
              disabled={!hasValidDuration || !isEngineReady}
              onChange={(event) =>
                handleRangeChange(Number(event.target.value))
              }
              aria-label="Прогресс воспроизведения"
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
            />

            <div className="mt-8 grid grid-cols-5 items-start gap-0.5 px-0.5 sm:gap-2 sm:px-0">
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => void handlePreviousTrack()}
                  disabled={
                    !isEngineReady ||
                    isPreviousTrackDisabled ||
                    isLoading ||
                    !src
                  }
                  aria-label={
                    isMultiTrack || Boolean(activeQueue && !queueCompleted)
                      ? "Предыдущее аудио"
                      : "В начало текущего аудио"
                  }
                  className="flex h-10 w-10 min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 sm:h-11 sm:w-11"
                >
                  <PreviousTrackIcon />
                </button>
                <ControlCaption
                  primary="Предыдущее"
                  secondary={isMultiTrack ? "аудио" : "в начало"}
                />
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
                  onClick={() => void handlePlayPause()}
                  disabled={!isEngineReady || !src || isLoading}
                  aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                  className="flex h-16 w-16 min-h-11 min-w-11 items-center justify-center rounded-full bg-white text-[#4b2f86] shadow-[0_18px_40px_rgba(0,0,0,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50 sm:h-[72px] sm:w-[72px]"
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>

                <button
                  type="button"
                  onClick={handleSpeedChange}
                  aria-label={`Скорость воспроизведения ${playbackRate}×`}
                  className="mt-3 min-h-11 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {playbackRate}×
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
                  onClick={() => void handleNextTrack()}
                  disabled={
                    !isEngineReady ||
                    isNextTrackDisabled ||
                    isLoading ||
                    !src
                  }
                  aria-label="Следующее аудио"
                  className="flex h-10 w-10 min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 sm:h-11 sm:w-11"
                >
                  <NextTrackIcon />
                </button>
                <ControlCaption primary="Следующее" secondary="аудио" />
              </div>
            </div>
          </>
        )}

        {progressError ? (
          <p className="mt-4 text-center text-xs text-white/55">
            {progressError}
          </p>
        ) : null}
      </section>
      ) : null}

      {isEngineReady && promoConversionMode && authorSlug && productSlug ? (
        <PromoPlaybackPrompts
          enabled={promoConversionMode}
          practiceId={practiceId}
          practiceSlug={productSlug}
          authorSlug={authorSlug}
          productSlug={productSlug}
          trackId={currentTrack?.id ?? null}
          currentTime={currentTime}
          duration={displayDuration}
          isPlaying={isPlaying}
          programCompleted={programCompleted}
          attribution={session?.promoAttribution ?? null}
          onReplay={() => void handleStartOver()}
        />
      ) : null}

      {isEngineReady && isMultiTrack ? (
        <section className="mt-8" aria-label="Содержание программы">
          <h2 className="text-[17px] font-semibold">Содержание</h2>
          <ol className="mt-3 max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto pr-1">
            {tracks.map((track, index) => {
              const isCurrent = index === currentTrackIndex;
              const isDone = isTrackDone(track.id, track.durationSeconds);

              return (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => void handleSelectTrack(index)}
                    aria-label={
                      isCurrent
                        ? `Сейчас играет, аудио ${track.position}: ${track.title}`
                        : `Открыть аудио ${track.position}: ${track.title}`
                    }
                    aria-current={isCurrent ? "true" : undefined}
                    className={`flex w-full items-start gap-3 rounded-[18px] border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                      isCurrent
                        ? "border-white/50 bg-white/22 shadow-[0_6px_22px_rgba(255,255,255,0.16)]"
                        : "border-white/12 bg-white/8 hover:bg-white/12"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isDone
                          ? isCurrent
                            ? "bg-white text-[#4b2f86] ring-2 ring-white/45"
                            : "bg-white text-[#4b2f86]"
                          : isCurrent
                            ? "bg-white/35 text-white ring-2 ring-white/55 shadow-[0_0_14px_rgba(255,255,255,0.22)]"
                            : "bg-white/15 text-white/85"
                      }`}
                    >
                      {isDone ? <CheckIcon /> : track.position}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-semibold ${
                          isCurrent ? "text-white" : "text-white/95"
                        }`}
                      >
                        {track.title}
                      </span>
                      {isCurrent ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
                          <NowPlayingIcon />
                          Сейчас играет
                        </span>
                      ) : null}
                      {track.description?.trim() ? (
                        <FormattedPlainText
                          as="span"
                          text={track.description ?? ""}
                          className={`mt-1 block line-clamp-2 text-xs leading-5 ${
                            isCurrent ? "text-white/78" : "text-white/65"
                          }`}
                        />
                      ) : null}
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        isCurrent ? "font-medium text-white/85" : "text-white/60"
                      }`}
                    >
                      {formatTime(track.durationSeconds ?? 0)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {isEngineReady && programCompleted && !activeQueue ? (
        <section className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void handleStartOver()}
            className="min-h-11 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Начать заново
          </button>
        </section>
      ) : null}

      <section className="mt-8 rounded-[24px] border border-white/12 bg-white/8 px-5 py-5">
        <h2 className="text-[17px] font-semibold">Перед прослушиванием</h2>
        <FormattedPlainText
          text={
            "Выберите спокойное и безопасное место.\n\nНе включайте практику во время управления транспортом или работы, требующей постоянной концентрации."
          }
          className="mt-3 text-sm leading-6 text-white/70"
        />
      </section>
    </div>
  );
}
