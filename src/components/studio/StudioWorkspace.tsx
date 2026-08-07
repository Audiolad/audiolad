"use client";

import Link from "next/link";
import { useRef } from "react";

import { useStudioAudio } from "@/components/studio/StudioAudioProvider";

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
}

export default function StudioWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    currentTime,
    loadLocalFiles,
    pause,
    play,
    projectDuration,
    projectError,
    removeTrack,
    seek,
    seekRelative,
    setTrackVolume,
    status,
    toggleTrackMuted,
    toggleTrackSolo,
    tracks,
  } = useStudioAudio();

  const isLoading = status === "loading";
  const isPlaying = status === "playing";
  const canControlTransport = tracks.length > 0 && !isLoading;

  return (
    <section className="flex min-h-dvh flex-col">
      <header className="flex flex-col gap-4 border-b border-[#ded1ee] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7042c5]">
            АудиоЛад для авторов
          </p>
          <h1 className="mt-1 text-xl font-semibold text-[#25135c]">
            Студия аудиопрактик
          </h1>
          <p className="mt-1 text-sm text-[#70618e]">
            Новый проект · Не сохранён
          </p>
        </div>
        <nav className="flex flex-wrap gap-2">
          <Link
            href="/author-dashboard"
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
          >
            В кабинет автора
          </Link>
          <Link
            href="/profile"
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#cfc0e6] px-4 text-sm font-semibold text-[#523786]"
          >
            В АудиоЛад
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8">
        <div className="rounded-[28px] border border-[#e2d6f1] bg-white p-5 shadow-[0_12px_35px_rgba(71,33,126,0.08)] sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#25135c]">
                Локальные дорожки
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#70618e]">
                Файл остаётся только в этой вкладке и не загружается на сервер.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || tracks.length >= 5}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Загрузка…" : "Добавить аудиофайл"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac"
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.currentTarget.value = "";
                if (files.length > 0) {
                  void loadLocalFiles(files);
                }
              }}
            />
          </div>

          {projectError ? (
            <p
              role="alert"
              className="mt-5 rounded-2xl bg-[#fff0f1] px-4 py-3 text-sm leading-6 text-[#a12a42]"
            >
              {projectError}
            </p>
          ) : null}

          {tracks.length >= 5 ? (
            <p className="mt-4 text-sm font-medium text-[#7042c5]">
              В проект можно добавить не более пяти дорожек
            </p>
          ) : null}

          {tracks.length === 0 && !isLoading ? (
            <div className="mt-7 rounded-2xl border border-dashed border-[#cdbbe5] bg-[#faf7ff] px-5 py-10 text-center">
              <p className="text-base font-medium text-[#3b246e]">
                Добавьте локальные аудиодорожки
              </p>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#70618e]">
                Поддерживаются MP3, WAV и файлы M4A/AAC, которые может
                декодировать ваш браузер. Временный лимит — 200 МБ.
              </p>
            </div>
          ) : null}

          <div className="mt-7 space-y-3">
            {tracks.map((track, index) => (
              <div
                key={track.id}
                className="rounded-2xl border border-[#d8caeb] bg-[#fbf9ff] p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#35205f]">
                      {index + 1}. {track.fileName}
                    </p>
                    <p className="mt-1 text-sm text-[#70618e]">
                      {formatTime(track.duration)} · {formatFileSize(track.fileSize)}
                      {track.status === "loading" ? " · Загрузка…" : ""}
                      {track.status === "error" ? " · Ошибка загрузки" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleTrackMuted(track.id)}
                      aria-label="Отключить звук дорожки"
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#cfc0e6] px-3 text-sm font-semibold text-[#523786]"
                    >
                      М
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTrackSolo(track.id)}
                      aria-label="Слушать только эту дорожку"
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#cfc0e6] px-3 text-sm font-semibold text-[#523786]"
                    >
                      С
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTrack(track.id)}
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#e2b8c4] px-4 text-sm font-semibold text-[#a12a42]"
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                <div
                  aria-label="Визуальный блок дорожки"
                  className="relative mt-5 h-14 overflow-hidden rounded-xl bg-[linear-gradient(90deg,#d8c4f3_0_8%,transparent_8%_10%,#c9b0ee_10%_16%,transparent_16%_19%,#ddcdf4_19%_27%,transparent_27%_30%,#bea0e9_30%_38%,transparent_38%_41%,#d6c0f2_41%_49%,transparent_49%_52%,#bea0e9_52%_61%,transparent_61%_65%,#ddcdf4_65%_75%,transparent_75%_79%,#c9b0ee_79%_88%,transparent_88%_91%,#d8c4f3_91%)]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-[#7042c5]/25"
                    style={{
                      width: `${Math.min(
                        (currentTime / track.duration) * 100,
                        100,
                      )}%`,
                    }}
                  />
                </div>

                <label className="mt-5 block text-sm font-medium text-[#4e3978]">
                  Громкость: {Math.round(track.volume * 100)}%
                  <input
                    aria-label="Громкость дорожки"
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(track.volume * 100)}
                    onChange={(event) =>
                      setTrackVolume(track.id, Number(event.target.value) / 100)
                    }
                    className="mt-2 block w-full accent-[#7042c5]"
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        <section
          aria-label="Транспорт Studio"
          className="rounded-[28px] border border-[#e2d6f1] bg-white p-5 shadow-[0_12px_35px_rgba(71,33,126,0.08)] sm:p-7"
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canControlTransport}
              onClick={() => seek(0)}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cfc0e6] px-4 text-sm font-semibold text-[#523786] disabled:cursor-not-allowed disabled:opacity-50"
            >
              В начало
            </button>
            <button
              type="button"
              disabled={!canControlTransport}
              onClick={() => seekRelative(-15)}
              aria-label="Перемотать назад на 15 секунд"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cfc0e6] px-4 text-sm font-semibold text-[#523786] disabled:cursor-not-allowed disabled:opacity-50"
            >
              −15
            </button>
            {isPlaying ? (
              <button
                type="button"
                onClick={pause}
                aria-label="Пауза"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#523786] px-5 text-sm font-semibold text-white"
              >
                ‖
              </button>
            ) : (
              <button
                type="button"
                disabled={!canControlTransport}
                onClick={() => void play()}
                aria-label="Воспроизвести"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                ▶
              </button>
            )}
            <button
              type="button"
              disabled={!canControlTransport}
              onClick={() => seekRelative(15)}
              aria-label="Перемотать вперёд на 15 секунд"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cfc0e6] px-4 text-sm font-semibold text-[#523786] disabled:cursor-not-allowed disabled:opacity-50"
            >
              +15
            </button>
            <p className="text-sm font-medium tabular-nums text-[#4e3978]">
              {formatTime(currentTime)} / {formatTime(projectDuration)}
            </p>
          </div>

          <input
            aria-label="Позиция воспроизведения"
            type="range"
            min="0"
            max={Math.max(projectDuration, 0)}
            step="0.01"
            value={Math.min(currentTime, projectDuration)}
            disabled={!canControlTransport}
            onChange={(event) => seek(Number(event.target.value))}
            className="mt-5 block w-full accent-[#7042c5] disabled:cursor-not-allowed"
          />
          {isLoading ? (
            <p className="mt-3 text-sm text-[#70618e]">Загрузка аудио…</p>
          ) : null}
        </section>
      </main>
    </section>
  );
}
