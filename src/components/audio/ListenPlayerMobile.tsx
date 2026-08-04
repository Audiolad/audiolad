"use client";

import PlaybackCoverImage from "@/components/images/PlaybackCoverImage";
import AuthorLink from "@/components/authors/AuthorLink";
import FormattedPlainText from "@/components/FormattedPlainText";
import ListeningNoticeCard from "@/components/products/ListeningNoticeCard";
import {
  CheckIcon,
  ControlCaption,
  ForwardFifteenIcon,
  formatListenTime,
  ListenPlayerLibrarySlot,
  ListenPlayerPromoSlot,
  NextTrackIcon,
  NowPlayingIcon,
  PauseIcon,
  PlayIcon,
  PreviousTrackIcon,
  RewindFifteenIcon,
  useListenPlayer,
} from "@/components/audio/listen-player-shared";

export default function ListenPlayerMobile() {
  const {
    props: {
      practiceTitle,
      authorName,
      tracks,
      coverSymbol,
      coverGradient,
      isAuthorPreview,
      sessionPayload,
      authorSlug,
      listeningNotice,
    },
    isEngineReady,
    isDismissedIdle,
    queueLabel,
    restartingQueue,
    setRestartingQueue,
    setCoverImageFailedUrl,
    showCoverImage,
    activeCoverUrl,
    activeCoverImage,
    activeCoverUpdatedAt,
    trimmedFormat,
    currentTrackTitle,
    showTrackTitle,
    currentDescription,
    isMultiTrack,
    currentTrackIndex,
    isPlaying,
    isLoading,
    hasValidDuration,
    displayDuration,
    currentTime,
    playerError,
    progressError,
    playbackRate,
    statusMessage,
    programProgressPercent,
    programCompleted,
    isPreviousTrackDisabled,
    isNextTrackDisabled,
    src,
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
    loadSession,
    activeQueue,
    queueCompleted,
    restartPlaylistQueue,
    returnToPlaylistSource,
    noticeMessage,
    clearNoticeMessage,
  } = useListenPlayer();

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
            <PlaybackCoverImage
              coverUrl={activeCoverUrl}
              coverImage={activeCoverImage}
              updatedAt={activeCoverUpdatedAt}
              displayWidth={360}
              priority
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
        <AuthorLink
          authorSlug={authorSlug}
          authorName={authorName}
          className="mt-2 inline-block text-sm font-medium text-white/70 hover:text-white"
        />
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
                <span>{formatListenTime(currentTime)}</span>
                <span>{formatListenTime(displayDuration)}</span>
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

      <ListenPlayerLibrarySlot forDesktop={false} className="mt-5" />

      <ListenPlayerPromoSlot forDesktop={false} />

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
                      {formatListenTime(track.durationSeconds ?? 0)}
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

      {listeningNotice ? (
        <ListeningNoticeCard notice={listeningNotice} variant="dark" />
      ) : null}
    </div>
  );
}
