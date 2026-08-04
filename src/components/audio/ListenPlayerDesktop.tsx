"use client";

import PlaybackCoverImage from "@/components/images/PlaybackCoverImage";
import AuthorLink from "@/components/authors/AuthorLink";
import FormattedPlainText from "@/components/FormattedPlainText";
import {
  CheckIcon,
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

export default function ListenPlayerDesktop() {
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

  const secondaryBtnClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#6f4bbb] via-[#8e68c9] to-[#2b1749] text-white shadow-[0_18px_48px_rgba(55,30,100,0.18)]">
      <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-[#e5b5df]/20 blur-3xl motion-reduce:blur-none" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-[#e9c3b5]/15 blur-3xl motion-reduce:blur-none" />

      <div className="relative z-10 flex flex-col gap-3 p-4 xl:gap-3 xl:p-4 2xl:gap-3.5 2xl:p-4">
        {/* 1. Top: cover + practice info */}
        <section className="grid min-w-0 grid-cols-[minmax(220px,min(40%,290px))_minmax(0,1fr)] items-start gap-4 xl:gap-5 2xl:grid-cols-[minmax(240px,min(32%,325px))_minmax(0,1fr)]">
          <div className="w-full max-w-[290px] justify-self-start 2xl:max-w-[325px]">
            <div
              className={`relative aspect-square w-full overflow-hidden rounded-[24px] shadow-[0_22px_56px_rgba(20,8,42,0.34)] ${
                showCoverImage
                  ? "bg-[#2b1749]"
                  : `bg-gradient-to-br ${coverGradient}`
              }`}
            >
              {showCoverImage ? (
                <PlaybackCoverImage
                  coverUrl={activeCoverUrl}
                  coverImage={activeCoverImage}
                  updatedAt={activeCoverUpdatedAt}
                  displayWidth={325}
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
                  <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl motion-reduce:blur-none" />
                  <div className="absolute -bottom-12 -right-10 h-44 w-44 rounded-full bg-[#f7d2c8]/30 blur-2xl motion-reduce:blur-none" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/40 bg-white/10 text-[64px] text-white shadow-[0_0_48px_rgba(255,255,255,0.28)]">
                      {coverSymbol}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="min-w-0 pt-0.5">
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">
              Сейчас играет
            </p>

            {queueLabel ? (
              <p className="mt-1.5 text-xs uppercase tracking-[0.14em] text-white/55">
                {queueLabel}
                {activeQueue?.title ? ` · ${activeQueue.title}` : ""}
              </p>
            ) : null}

            <h1 className="mt-2 text-[26px] font-semibold leading-[1.18] tracking-[-0.01em] xl:text-[28px] 2xl:text-[32px]">
              {practiceTitle}
            </h1>

            {showTrackTitle ? (
              <p className="mt-2 text-[17px] font-medium leading-snug text-white/90">
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
              className="mt-2.5 inline-block text-[15px] font-medium text-white/80 hover:text-white"
            />

            {trimmedFormat ? (
              <p className="mt-1.5 text-xs uppercase tracking-[0.14em] text-white/50">
                {trimmedFormat}
              </p>
            ) : null}

            {isAuthorPreview ? (
              <p className="mt-3 inline-flex rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs text-white/80">
                Режим предпросмотра автора
              </p>
            ) : null}

            {isDismissedIdle && sessionPayload ? (
              <div className="mt-6">
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
              </div>
            ) : !isEngineReady ? (
              <p className="mt-6 text-sm text-white/65">Подготавливаем плеер…</p>
            ) : null}

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
              <div className="mt-6 rounded-[24px] border border-white/15 bg-white/10 px-5 py-6">
                <h2 className="text-[22px] font-semibold">Плейлист прослушан</h2>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Вы прослушали все доступные материалы этой подборки.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
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
              </div>
            ) : null}
          </div>
        </section>

        {/* 2. Bottom: full-width controls panel */}
        <section className="rounded-[22px] border border-white/12 bg-[#2b1749]/35 px-4 py-3.5 backdrop-blur-sm xl:px-5 xl:py-3.5">
          {isEngineReady && isMultiTrack ? (
            <div className="mb-3" aria-label="Общий прогресс программы">
              <div className="flex items-center justify-between text-xs text-white/65">
                <span>Пройдено {programProgressPercent}%</span>
                {programCompleted ? (
                  <span className="text-white/80">Программа завершена</span>
                ) : null}
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20"
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
            </div>
          ) : null}

          {isEngineReady ? (
            <div aria-live="polite">
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
                    <p className="mb-3 text-center text-sm text-white/65">
                      {statusMessage || "Подготавливаем аудио…"}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs tabular-nums text-white/70">
                    <span className="w-10 shrink-0">
                      {formatListenTime(currentTime)}
                    </span>
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
                      className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="w-10 shrink-0 text-right">
                      {formatListenTime(displayDuration)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-col items-center">
                    <div className="flex items-center justify-center gap-2 xl:gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleSeekOffset(-15)}
                        disabled={!hasValidDuration}
                        aria-label="Назад на 15 секунд"
                        className={`${secondaryBtnClass} p-1.5`}
                      >
                        <RewindFifteenIcon />
                      </button>

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
                        className={secondaryBtnClass}
                      >
                        <PreviousTrackIcon />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handlePlayPause()}
                        disabled={!isEngineReady || !src || isLoading}
                        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                        className="inline-flex h-[58px] w-[58px] items-center justify-center rounded-full bg-white text-[#4b2f86] shadow-[0_12px_28px_rgba(0,0,0,0.26)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPlaying ? (
                          <PauseIcon className="h-7 w-7" />
                        ) : (
                          <PlayIcon className="h-7 w-7" />
                        )}
                      </button>

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
                        className={secondaryBtnClass}
                      >
                        <NextTrackIcon />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSeekOffset(15)}
                        disabled={!hasValidDuration}
                        aria-label="Вперёд на 15 секунд"
                        className={`${secondaryBtnClass} p-2`}
                      >
                        <ForwardFifteenIcon />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSpeedChange}
                      aria-label={`Скорость воспроизведения ${playbackRate}×`}
                      className="mt-1.5 min-h-8 rounded-full border border-white/20 px-3 py-0.5 text-sm font-semibold text-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {playbackRate}×
                    </button>
                  </div>
                </>
              )}

              {progressError ? (
                <p className="mt-2.5 text-center text-xs text-white/55">
                  {progressError}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-center text-sm text-white/65">
              Управление станет доступно после подготовки плеера.
            </p>
          )}

          <ListenPlayerLibrarySlot forDesktop className="mt-3" />

          <ListenPlayerPromoSlot forDesktop />

          {listeningNotice ? (
            <div className="mt-3 rounded-[18px] border border-white/12 bg-white/[0.07] px-4 py-2.5 xl:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm text-white/80"
                  aria-hidden="true"
                >
                  ✦
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold leading-snug">
                    {listeningNotice.title}
                  </h2>
                  <FormattedPlainText
                    text={listeningNotice.text}
                    className="mt-1 text-sm leading-5 text-white/72"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {isEngineReady && isMultiTrack ? (
          <section aria-label="Содержание программы">
            <h2 className="text-[17px] font-semibold">Содержание</h2>
            <ol className="mt-3 max-h-[min(18rem,28vh)] space-y-2 overflow-y-auto pr-1">
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
                      className={`flex w-full items-start gap-3 rounded-[16px] border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                        isCurrent
                          ? "border-white/50 bg-white/22 shadow-[0_6px_22px_rgba(255,255,255,0.16)]"
                          : "border-white/12 bg-white/8 hover:bg-white/12"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isDone
                            ? "bg-white text-[#4b2f86]"
                            : isCurrent
                              ? "bg-white/35 text-white ring-2 ring-white/55"
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
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-white/60">
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
          <div>
            <button
              type="button"
              onClick={() => void handleStartOver()}
              className="min-h-11 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Начать заново
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
