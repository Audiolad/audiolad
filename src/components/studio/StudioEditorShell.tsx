"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type StudioLocalTrack,
  useStudioAudio,
} from "@/components/studio/StudioAudioProvider";
import { StudioBrand } from "@/components/studio/StudioBrand";
import { useStudioRecorder } from "@/components/studio/useStudioRecorder";
import {
  StudioTimeline,
  type StudioTimelineHandle,
} from "@/components/studio/StudioTimeline";
import {
  clampPixelsPerSecond,
  DEFAULT_PIXELS_PER_SECOND,
  getFitPixelsPerSecond,
} from "@/lib/studio/timeline-math";
import { getStudioDefaultFadeDuration } from "@/lib/studio/fade-math";
import {
  MIN_STUDIO_CLIP_DURATION,
  type StudioClip,
} from "@/lib/studio/clip-math";

type StudioTrackSlot = {
  id: string;
  name: string;
  audioTrackId: string | null;
};

const MAX_TRACK_SLOTS = 5;
const TRACK_ACCENTS = [
  "border-violet-400/70 bg-violet-400/15 text-violet-200",
  "border-sky-400/70 bg-sky-400/15 text-sky-200",
  "border-teal-400/70 bg-teal-400/15 text-teal-200",
  "border-amber-400/70 bg-amber-400/15 text-amber-100",
  "border-emerald-400/70 bg-emerald-400/15 text-emerald-200",
];
const TIMELINE_ACCENTS = ["#a78bfa", "#38bdf8", "#2dd4bf", "#fbbf24", "#34d399"];

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0:00";
  }

  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
}

function isNativeInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], a[href], [role="button"], [role="checkbox"], [role="link"], [role="menuitem"], [role="slider"], [role="textbox"]',
    ),
  );
}

function TrackMuteButton({
  track,
  onToggle,
}: {
  track?: StudioLocalTrack;
  onToggle: () => void;
}) {
  const label = track?.muted
    ? "Включить звук дорожки"
    : "Отключить звук дорожки";
  const isDisabled = !track;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={track?.muted ?? false}
      disabled={isDisabled}
      title={
        isDisabled
          ? "Добавьте аудио, чтобы управлять звуком"
          : track.muted
            ? "Включить звук"
            : "Отключить звук"
      }
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#1c2433] text-[#c9d8ff] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {track?.muted ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="m16 9 5 5m0-5-5 5" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      )}
    </button>
  );
}

function TrackFadeButton({
  clip,
  kind,
  onToggle,
}: {
  clip?: StudioClip;
  kind: "in" | "out";
  onToggle: () => void;
}) {
  const isFadeIn = kind === "in";
  const active = isFadeIn
    ? (clip?.fadeInDuration ?? 0) > 0
    : (clip?.fadeOutDuration ?? 0) > 0;
  const label = isFadeIn ? "Плавное появление" : "Плавное затухание";

  return (
    <button
      type="button"
      disabled={!clip}
      onClick={onToggle}
      aria-label={label}
      aria-pressed={active}
      title={
        clip
          ? active
            ? `${label}: выключить`
            : `${label}: включить`
          : "Добавьте аудио, чтобы настроить затухание"
      }
      className={`h-8 rounded border px-2 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-violet-300/70 bg-violet-400/20 text-violet-100"
          : "border-white/15 bg-[#1c2433] text-[#c9d8ff]"
      }`}
    >
      {isFadeIn ? "Появление" : "Затухание"}
    </button>
  );
}

export default function StudioEditorShell() {
  const addAudioInputRef = useRef<HTMLInputElement | null>(null);
  const replaceAudioInputRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<StudioTimelineHandle | null>(null);
  const [projectName, setProjectName] = useState("Новый проект");
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotNameDraft, setSlotNameDraft] = useState("");
  const [pixelsPerSecond, setPixelsPerSecond] = useState(
    DEFAULT_PIXELS_PER_SECOND,
  );
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [slots, setSlots] = useState<StudioTrackSlot[]>([
    { id: "slot-1", name: "Дорожка 1", audioTrackId: null },
    { id: "slot-2", name: "Дорожка 2", audioTrackId: null },
  ]);
  const {
    createMicrophoneAnalyser,
    currentTime,
    getTrackBuffer,
    ingestRecordedFile,
    loadLocalFiles,
    pause,
    play,
    projectDuration,
    projectError,
    removeTrack,
    replaceTrackAudio,
    seek,
    seekRelative,
    setClipFades,
    setClipLayout,
    splitClip,
    removeClip,
    setTrackVolume,
    status,
    toggleTrackMuted,
    tracks,
  } = useStudioAudio();

  const tracksById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  const isLoading = status === "loading";
  const isPlaying = status === "playing";
  const canControlTransport = tracks.length > 0 && !isLoading;
  const {
    isProcessingRecording,
    isRecording,
    recordingElapsed,
    recordingError,
    recordingAnalyser,
    recordingStartTime,
    recordingSlotId,
    startRecording,
    stopRecording,
  } = useStudioRecorder({
    createMicrophoneAnalyser,
    onRecordedFile: async (file, startTime, slotId) => {
      const track = await ingestRecordedFile(file, { startTime });
      if (track) {
        setSlots((currentSlots) =>
          currentSlots.map((slot) =>
            slot.id === slotId ? { ...slot, audioTrackId: track.id } : slot,
          ),
        );
      }
    },
  });

  useEffect(() => {
    const handleSpaceShortcut = (event: KeyboardEvent) => {
      if (
        event.key !== " " ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        !canControlTransport ||
        isNativeInteractiveTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      if (isPlaying) {
        pause();
      } else {
        void play();
      }
    };

    document.addEventListener("keydown", handleSpaceShortcut);
    return () => document.removeEventListener("keydown", handleSpaceShortcut);
  }, [canControlTransport, isPlaying, pause, play]);

  const timelineTracks = slots.map((slot) => {
    const track = slot.audioTrackId
      ? tracksById.get(slot.audioTrackId)
      : undefined;
    return {
      id: track?.id ?? slot.id,
      name: slot.name,
      fileName: track?.fileName,
      hasAudio: Boolean(slot.audioTrackId && track?.clips.length),
      buffer: track ? getTrackBuffer(track.id) : null,
      clips: track?.clips ?? [],
      accent: TIMELINE_ACCENTS[slots.indexOf(slot) % TIMELINE_ACCENTS.length],
    };
  });
  const handleTimelineViewportWidthChange = useCallback((width: number) => {
    setTimelineViewportWidth(width);
  }, []);

  const openAddAudioDialog = (slotId: string) => {
    if (addAudioInputRef.current) {
      addAudioInputRef.current.dataset.slotId = slotId;
      addAudioInputRef.current.click();
    }
  };

  const startSlotRecording = (slotId: string) => {
    void startRecording({
      slotId,
      startTime: tracks.length === 0 ? 0 : currentTime,
      onStartTransport: () => (isPlaying ? undefined : play()),
    });
  };

  const startSlotRename = (slot: StudioTrackSlot) => {
    setEditingSlotId(slot.id);
    setSlotNameDraft(slot.name);
  };

  const saveSlotRename = (slotId: string) => {
    const name = slotNameDraft.trim();
    if (name) {
      setSlots((currentSlots) =>
        currentSlots.map((slot) =>
          slot.id === slotId ? { ...slot, name } : slot,
        ),
      );
    }
    setEditingSlotId(null);
  };

  const cancelSlotRename = () => {
    setEditingSlotId(null);
    setSlotNameDraft("");
  };

  const addSlot = () => {
    setSlots((currentSlots) => {
      if (currentSlots.length >= MAX_TRACK_SLOTS) {
        return currentSlots;
      }

      const nextNumber = currentSlots.length + 1;
      return [
        ...currentSlots,
        {
          id: `slot-${crypto.randomUUID()}`,
          name: `Дорожка ${nextNumber}`,
          audioTrackId: null,
        },
      ];
    });
  };

  const renderTimelineControls = (_timelineTrack: unknown, index: number) => {
    const slot = slots[index];
    const track = slot?.audioTrackId
      ? tracksById.get(slot.audioTrackId)
      : undefined;
    const selectedClip = track?.clips.find((clip) => clip.id === selectedClipId);
    const canSplitSelectedClip = Boolean(
      selectedClip &&
        currentTime > selectedClip.startTime + MIN_STUDIO_CLIP_DURATION &&
        currentTime <
          selectedClip.startTime +
            selectedClip.duration -
            MIN_STUDIO_CLIP_DURATION,
    );
    if (!slot) {
      return null;
    }
    const accent = TRACK_ACCENTS[index % TRACK_ACCENTS.length];

    return (
      <div className="flex min-h-40 gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${accent}`}>
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-1">
            {editingSlotId === slot.id ? (
              <input
                autoFocus
                value={slotNameDraft}
                onChange={(event) => setSlotNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveSlotRename(slot.id);
                  if (event.key === "Escape") cancelSlotRename();
                }}
                aria-label={`Название дорожки ${index + 1}`}
                className="min-w-0 flex-1 rounded bg-[#1c2433] px-2 py-1 text-sm font-semibold text-white outline-none ring-1 ring-violet-300/60"
              />
            ) : (
              <>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {slot.name}
                </p>
                <button
                  type="button"
                  onClick={() => startSlotRename(slot)}
                  aria-label={`Изменить название ${slot.name}`}
                  title="Переименовать дорожку"
                  className="shrink-0 text-[#bda8e8]"
                >
                  ✎
                </button>
              </>
            )}
          </div>
          {recordingSlotId === slot.id && isRecording ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-2 inline-flex w-fit items-center rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-1 text-xs font-semibold tabular-nums text-rose-100"
            >
              ● Идёт запись {formatTime(recordingElapsed)}
            </p>
          ) : null}
          <div className="mt-3 flex min-h-28 items-end gap-3">
            <TrackMuteButton
              track={track}
              onToggle={() => track && toggleTrackMuted(track.id)}
            />
            <div className="studio-volume-fader flex h-28 w-5 shrink-0 flex-col items-center">
              <input
                aria-label={`Громкость ${slot.name}`}
                type="range"
                min="0"
                max="100"
                value={Math.round((track?.volume ?? 1) * 100)}
                disabled={!track}
                onChange={(event) =>
                  track && setTrackVolume(track.id, Number(event.target.value) / 100)
                }
                title={
                  track
                    ? `Громкость: ${Math.round(track.volume * 100)}%`
                    : "Добавьте аудио, чтобы регулировать громкость"
                }
                className="studio-volume-fader__range accent-[#9f7aea] disabled:cursor-not-allowed disabled:opacity-40"
              />
              <span className="text-[10px] text-[#9ba7bb]">
                {Math.round((track?.volume ?? 1) * 100)}%
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <TrackFadeButton
              clip={selectedClip}
              kind="in"
              onToggle={() => {
                if (!track || !selectedClip) return;
                setClipFades(track.id, selectedClip.id, {
                  fadeInDuration:
                    selectedClip.fadeInDuration > 0
                      ? 0
                      : getStudioDefaultFadeDuration(selectedClip.duration),
                });
              }}
            />
            <TrackFadeButton
              clip={selectedClip}
              kind="out"
              onToggle={() => {
                if (!track || !selectedClip) return;
                setClipFades(track.id, selectedClip.id, {
                  fadeOutDuration:
                    selectedClip.fadeOutDuration > 0
                      ? 0
                      : getStudioDefaultFadeDuration(selectedClip.duration),
                });
              }}
            />
          </div>
          <div className="mt-3 flex flex-col items-start gap-2 text-xs">
            {track ? (
              <>
                <button
                  type="button"
                  disabled={track.isReplacing || track.clips.length > 1}
                  onClick={() => {
                    pause();
                    if (replaceAudioInputRef.current) {
                      replaceAudioInputRef.current.dataset.trackId = track.id;
                      replaceAudioInputRef.current.click();
                    }
                  }}
                  title={
                    track.clips.length > 1
                      ? "Объедините или очистите фрагменты перед заменой аудио"
                      : undefined
                  }
                  className="text-[#d8c8fb] disabled:opacity-40"
                >
                  Заменить аудио
                </button>
                <button type="button" disabled={!canSplitSelectedClip} onClick={() => {
                  if (!selectedClip) return;
                  const nextId = splitClip(track.id, selectedClip.id, currentTime);
                  if (nextId) setSelectedClipId(nextId);
                }} className="text-[#d8c8fb] disabled:opacity-40">
                  Разрезать
                </button>
                <button type="button" disabled={!selectedClip} onClick={() => {
                  if (!selectedClip) return;
                  if (track.clips.length === 1) {
                    removeTrack(track.id);
                    setSlots((currentSlots) =>
                      currentSlots.map((item) =>
                        item.id === slot.id
                          ? { ...item, audioTrackId: null }
                          : item,
                      ),
                    );
                  } else {
                    removeClip(track.id, selectedClip.id);
                  }
                  setSelectedClipId(null);
                }} className="text-[#a9b4c7] disabled:opacity-40">
                  Удалить фрагмент
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeTrack(track.id);
                    setSlots((currentSlots) =>
                      currentSlots.map((item) =>
                        item.id === slot.id ? { ...item, audioTrackId: null } : item,
                      ),
                    );
                  }}
                  className="text-[#a9b4c7]"
                >
                  Очистить дорожку
                </button>
              </>
            ) : null}
            {!track ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isLoading || isRecording || isProcessingRecording}
                  onClick={() => openAddAudioDialog(slot.id)}
                  className="text-[#d8c8fb] disabled:opacity-40"
                >
                  Добавить аудио
                </button>
                {recordingSlotId === slot.id ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="text-rose-200"
                  >
                    Стоп · {formatTime(recordingElapsed)}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isLoading || isRecording || isProcessingRecording}
                    onClick={() => startSlotRecording(slot.id)}
                    className="text-[#d8c8fb] disabled:opacity-40"
                  >
                    Записать
                  </button>
                )}
              </div>
            ) : null}
            {index >= 2 ? (
              <button
                type="button"
                disabled={recordingSlotId === slot.id}
                onClick={() => {
                  if (track) removeTrack(track.id);
                  setSlots((currentSlots) =>
                    currentSlots.filter((item) => item.id !== slot.id),
                  );
                }}
                className="text-[#a9b4c7] underline underline-offset-4 disabled:opacity-40"
              >
                Удалить дорожку
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderTimelineEmptyState = (_timelineTrack: unknown, index: number) => {
    const slot = slots[index];
    if (!slot) {
      return null;
    }
    const isThisSlotRecording = recordingSlotId === slot.id;
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-medium text-[#e2e8f5]">Добавьте аудио</p>
        <p className="mt-1 text-xs text-[#97a4b8]">
          Загрузите аудиофайл с устройства
        </p>
        <p className="mt-2 text-xs text-[#718096]">
          При записи под музыку лучше использовать наушники.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={isLoading || isRecording || isProcessingRecording}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              openAddAudioDialog(slot.id);
            }}
            className="h-10 rounded-lg bg-[#7650bd] px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            Добавить аудио
          </button>
          {isThisSlotRecording ? (
            <button
              type="button"
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                stopRecording();
              }}
              className="h-10 rounded-lg border border-rose-300/60 bg-rose-400/15 px-4 text-sm font-semibold text-rose-100"
            >
              Стоп · {formatTime(recordingElapsed)}
            </button>
          ) : (
            <button
              type="button"
              disabled={isLoading || isRecording || isProcessingRecording}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                startSlotRecording(slot.id);
              }}
              className="h-10 rounded-lg border border-violet-300/60 px-4 text-sm font-semibold text-violet-100 disabled:opacity-40"
            >
              Записать с микрофона
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="min-h-dvh bg-[#0b1019] text-[#edf0f7]">
      <div className="mx-auto flex min-h-dvh max-w-[1920px] flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#0f1520] px-4 py-3 lg:px-6">
          <StudioBrand />
          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/studio"
              className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm text-[#bfc9da] hover:bg-white/5"
            >
              ← Назад в Studio
            </Link>
            <Link
              href="/author-dashboard"
              className="inline-flex min-h-9 items-center rounded-lg border border-white/15 px-3 text-sm font-medium text-white"
            >
              В кабинет автора
            </Link>
            <Link
              href="/profile"
              className="inline-flex min-h-9 items-center rounded-lg border border-violet-300/50 px-3 text-sm font-medium text-[#eadfff]"
            >
              В АудиоЛад
            </Link>
          </nav>
        </header>

        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#131b28]/95 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-center gap-3 xl:flex-nowrap">
            <div className="min-w-[220px] rounded-lg border border-white/10 bg-[#0d131d] px-3 py-2">
              <p className="text-xs text-[#99a4b8]">Проект</p>
              {isEditingProjectName ? (
                <input
                  autoFocus
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  onBlur={() => setIsEditingProjectName(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setIsEditingProjectName(false);
                    }
                  }}
                  aria-label="Название проекта"
                  className="mt-1 w-full bg-transparent text-sm font-semibold text-white outline-none"
                />
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-white">
                    {projectName}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsEditingProjectName(true)}
                    title="Изменить название"
                    aria-label="Изменить название проекта"
                    className="text-[#bda8e8]"
                  >
                    ✎
                  </button>
                </div>
              )}
            </div>

            <section aria-label="Транспорт Studio" className="flex flex-1 flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={!canControlTransport}
                onClick={() => {
                  seek(0);
                  timelineRef.current?.scrollToStart();
                }}
                title="Перейти в начало"
                className="h-10 rounded-lg border border-white/15 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                |◀
              </button>
              <button
                type="button"
                disabled={!canControlTransport}
                onClick={() => seekRelative(-15)}
                aria-label="Перемотать назад на 15 секунд"
                className="h-10 rounded-lg border border-white/15 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                −15
              </button>
              {isPlaying ? (
                <button
                  type="button"
                  onClick={pause}
                  aria-label="Пауза"
                  title="Пробел — воспроизведение / пауза"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#4fb887] p-0 leading-none text-[#06110d]"
                >
                  ‖
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canControlTransport}
                  onClick={() => void play()}
                  aria-label="Воспроизвести"
                  title="Пробел — воспроизведение / пауза"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#4fb887] p-0 leading-none text-[#06110d] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ▶
                </button>
              )}
              <button
                type="button"
                disabled={!canControlTransport}
                onClick={() => seekRelative(15)}
                aria-label="Перемотать вперёд на 15 секунд"
                className="h-10 rounded-lg border border-white/15 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                +15
              </button>
              <button
                type="button"
                disabled={!canControlTransport}
                onClick={() => {
                  seek(projectDuration);
                  timelineRef.current?.scrollToEnd();
                }}
                aria-label="Перейти в конец"
                title="Перейти в конец проекта"
                className="h-10 rounded-lg border border-white/15 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                ▶|
              </button>
              <p className="min-w-[116px] text-center text-sm tabular-nums text-[#dfe5f2]">
                {formatTime(currentTime)} / {formatTime(projectDuration)}
              </p>
              <input
                aria-label="Позиция воспроизведения проекта"
                type="range"
                min="0"
                max={Math.max(projectDuration, 0)}
                step="0.01"
                value={Math.min(currentTime, projectDuration)}
                disabled={!canControlTransport}
                onChange={(event) => seek(Number(event.target.value))}
                className="min-w-[120px] flex-1 accent-[#9f7aea] disabled:cursor-not-allowed"
              />
            </section>
            {isRecording ? (
              <p
                role="status"
                className="rounded border border-rose-400/50 bg-rose-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-rose-200"
              >
                ● Идёт запись {formatTime(recordingElapsed)}
              </p>
            ) : null}

            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs uppercase tracking-wide text-[#99a4b8]">
                Масштаб
              </span>
              <button
                type="button"
                onClick={() =>
                  setPixelsPerSecond((current) =>
                    clampPixelsPerSecond(current / 1.25),
                  )
                }
                className="h-9 w-9 rounded border border-white/10"
                aria-label="Уменьшить масштаб временной шкалы"
              >
                −
              </button>
              <input
                aria-label="Масштаб временной шкалы"
                type="range"
                min="0.001"
                max="400"
                step="0.001"
                value={pixelsPerSecond}
                onChange={(event) => setPixelsPerSecond(Number(event.target.value))}
                className="w-16 accent-[#9f7aea]"
              />
              <button
                type="button"
                onClick={() =>
                  setPixelsPerSecond((current) =>
                    clampPixelsPerSecond(current * 1.25),
                  )
                }
                className="h-9 w-9 rounded border border-white/10"
                aria-label="Увеличить масштаб временной шкалы"
              >
                +
              </button>
              <button
                type="button"
                onClick={() =>
                  setPixelsPerSecond(
                    getFitPixelsPerSecond(projectDuration, timelineViewportWidth),
                  )
                }
                className="h-9 rounded border border-white/10 px-2 text-xs"
              >
                По ширине
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" disabled title="Сохранение проектов будет добавлено на следующем этапе" className="h-10 rounded-lg border border-white/15 px-3 text-sm opacity-45">
                Сохранить
              </button>
              <button type="button" disabled title="Экспорт будет доступен после подключения серверного сведения" className="h-10 rounded-lg border border-violet-300/40 px-3 text-sm opacity-45">
                Экспорт
              </button>
            </div>
          </div>
        </div>

        <main className="flex-1 px-4 py-5 lg:px-6">
          {projectError ? (
            <p role="alert" className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {projectError}
            </p>
          ) : null}
          {recordingError ? (
            <p role="alert" className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {recordingError}
            </p>
          ) : null}

          <StudioTimeline
            ref={timelineRef}
            duration={projectDuration}
            currentTime={currentTime}
            isPlaying={isPlaying}
            tracks={timelineTracks}
            liveRecording={
              isRecording &&
              recordingSlotId &&
              recordingAnalyser &&
              recordingStartTime !== null
                ? {
                    slotId: recordingSlotId,
                    startTime: recordingStartTime,
                    analyser: recordingAnalyser,
                  }
                : null
            }
            pixelsPerSecond={pixelsPerSecond}
            onViewportWidthChange={handleTimelineViewportWidthChange}
            onSeek={seek}
            selectedClipId={selectedClipId}
            onSelectClip={setSelectedClipId}
            onClipGestureStart={pause}
            onClipLayoutChange={setClipLayout}
            onClipFadesChange={setClipFades}
            renderControls={renderTimelineControls}
            renderEmpty={renderTimelineEmptyState}
          />

          {false ? <div className="space-y-3">
            {slots.map((slot, index) => {
              const track = slot.audioTrackId
                ? tracksById.get(slot.audioTrackId)
                : undefined;
              const accent = TRACK_ACCENTS[index % TRACK_ACCENTS.length];

              return (
                <section key={slot.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#121b28]">
                  <div className="grid lg:grid-cols-[250px_minmax(0,1fr)]">
                    <aside className="flex min-h-40 gap-3 border-b border-white/10 bg-[#101722] p-4 lg:border-b-0 lg:border-r">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${accent}`}>
                        {index + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex min-w-0 items-center gap-1">
                          {editingSlotId === slot.id ? (
                            <input
                              autoFocus
                              value={slotNameDraft}
                              onChange={(event) =>
                                setSlotNameDraft(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  saveSlotRename(slot.id);
                                }
                                if (event.key === "Escape") {
                                  cancelSlotRename();
                                }
                              }}
                              aria-label={`Название дорожки ${index + 1}`}
                              className="min-w-0 flex-1 rounded bg-[#1c2433] px-2 py-1 text-sm font-semibold text-white outline-none ring-1 ring-violet-300/60"
                            />
                          ) : (
                            <>
                              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                                {slot.name}
                              </p>
                              <button
                                type="button"
                                onClick={() => startSlotRename(slot)}
                                aria-label={`Изменить название ${slot.name}`}
                                title="Переименовать дорожку"
                                className="shrink-0 text-[#bda8e8]"
                              >
                                ✎
                              </button>
                            </>
                          )}
                        </div>

                        <div className="mt-3 flex min-h-28 items-end gap-3">
                          <TrackMuteButton
                            track={track}
                            onToggle={() => {
                              if (track) {
                                toggleTrackMuted(track.id);
                              }
                            }}
                          />
                          <div className="studio-volume-fader flex h-28 w-5 shrink-0 flex-col items-center">
                            <input
                              aria-label={`Громкость ${slot.name}`}
                              type="range"
                              min="0"
                              max="100"
                              value={Math.round((track?.volume ?? 1) * 100)}
                              disabled={!track}
                              onChange={(event) => {
                                if (track) {
                                  setTrackVolume(
                                    track.id,
                                    Number(event.target.value) / 100,
                                  );
                                }
                              }}
                              title={
                                track
                                  ? `Громкость: ${Math.round(track.volume * 100)}%`
                                  : "Добавьте аудио, чтобы регулировать громкость"
                              }
                              className="studio-volume-fader__range accent-[#9f7aea] disabled:cursor-not-allowed disabled:opacity-40"
                            />
                            <span className="text-[10px] text-[#9ba7bb]">
                              {Math.round((track?.volume ?? 1) * 100)}%
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-col items-start gap-2 text-xs">
                          {track ? (
                            <>
                              <button
                                type="button"
                                disabled={track.isReplacing}
                                onClick={() => {
                                  pause();
                                  if (replaceAudioInputRef.current) {
                                    replaceAudioInputRef.current.dataset.trackId =
                                      track.id;
                                    replaceAudioInputRef.current.click();
                                  }
                                }}
                                className="text-[#d8c8fb] disabled:opacity-40"
                              >
                                Заменить аудио
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  removeTrack(track.id);
                                  setSlots((currentSlots) =>
                                    currentSlots.map((item) =>
                                      item.id === slot.id
                                        ? { ...item, audioTrackId: null }
                                        : item,
                                    ),
                                  );
                                }}
                                className="text-[#a9b4c7]"
                              >
                                Очистить дорожку
                              </button>
                            </>
                          ) : null}
                          {index >= 2 ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (track) {
                                  removeTrack(track.id);
                                }
                                setSlots((currentSlots) =>
                                  currentSlots.filter((item) => item.id !== slot.id),
                                );
                              }}
                              className="text-[#a9b4c7] underline underline-offset-4"
                            >
                              Удалить дорожку
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </aside>

                    <div className="min-w-0 p-4">
                      {track ? (
                        <div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#e8edf8]">
                              {track.fileName}
                            </p>
                            <p className="mt-1 text-xs text-[#9ba7bb]">
                              {formatTime(Math.max(...track.clips.map((clip) => clip.duration), 0))} · {formatFileSize(track.fileSize)}
                              {track.isReplacing ? " · Замена аудио…" : ""}
                            </p>
                          </div>
                          {track.replacementError ? (
                            <p role="alert" className="mt-3 text-sm text-rose-200">
                              {track.replacementError}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-white/20 bg-[#0d131d] px-4 text-center">
                          <p className="text-sm font-medium text-[#e2e8f5]">
                            Добавьте аудио
                          </p>
                          <p className="mt-1 text-xs text-[#97a4b8]">
                            Загрузите аудиофайл с устройства
                          </p>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => openAddAudioDialog(slot.id)}
                            className="mt-4 h-10 rounded-lg bg-[#7650bd] px-4 text-sm font-semibold text-white disabled:opacity-40"
                          >
                            Добавить аудио
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div> : null}

          {slots.length < MAX_TRACK_SLOTS ? (
            <button
              type="button"
              onClick={addSlot}
              className="mt-3 inline-flex h-11 items-center rounded-lg border border-dashed border-white/25 px-4 text-sm font-semibold text-[#d8c8fb]"
            >
              + Добавить дорожку
            </button>
          ) : (
            <p className="mt-3 text-sm text-[#a9b4c7]">
              В проект можно добавить не более пяти дорожек
            </p>
          )}

          <input
            ref={addAudioInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac"
            className="sr-only"
            onChange={(event) => {
              const slotId = event.currentTarget.dataset.slotId;
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              delete event.currentTarget.dataset.slotId;
              if (!slotId || !file) {
                return;
              }
              void loadLocalFiles([file]).then(([track]) => {
                if (track) {
                  setSlots((currentSlots) =>
                    currentSlots.map((slot) =>
                      slot.id === slotId
                        ? { ...slot, audioTrackId: track.id }
                        : slot,
                    ),
                  );
                }
              });
            }}
          />
          <input
            ref={replaceAudioInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac"
            className="sr-only"
            onChange={(event) => {
              const trackId = event.currentTarget.dataset.trackId;
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              delete event.currentTarget.dataset.trackId;
              if (trackId && file) {
                void replaceTrackAudio(trackId, file);
              }
            }}
          />
        </main>
      </div>

      <div className="fixed inset-0 z-30 hidden flex-col items-center justify-center bg-[#0b1019] p-8 text-center md:hidden">
        <StudioBrand />
        <p className="mt-8 text-lg font-semibold">
          Для работы в Студии поверните устройство горизонтально
        </p>
        <p className="mt-3 text-sm text-[#b7c1d1]">
          Для удобного монтажа используйте компьютер или планшет
        </p>
      </div>
    </section>
  );
}
