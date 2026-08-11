"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

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
import {
  getStudioMusicVolumeDb,
  getStudioMusicVolumeFromDb,
  STUDIO_MUSIC_VOLUME_MAX_DB,
  STUDIO_MUSIC_VOLUME_MIN_DB,
} from "@/lib/studio/audio-engine-math";
import {
  createStudioClipClipboard,
  createStudioEditingSnapshot,
  createStudioHistory,
  getStudioPasteClips,
  recordStudioHistory,
  redoStudioHistory,
  undoStudioHistory,
  type StudioClipClipboard,
  type StudioEditingSnapshot,
  type StudioHistory,
} from "@/lib/studio/history";
import type { StudioProjectHydration } from "@/lib/studio/hydration";
import type { StudioTrackKind, StudioVoicePreset } from "@/lib/studio/persistence";
import {
  StudioAutosaveController,
  type StudioAutosaveState,
} from "@/lib/studio/autosave";
import { serializeStudioProjectState, validateStudioProjectDocument } from "@/lib/studio/persistence";
import { updateStudioProject } from "@/lib/studio/persistence-client";

type StudioTrackSlot = {
  id: string;
  name: string;
  audioTrackId: string | null;
  trackKind: StudioTrackKind;
};

const MAX_VOICE_TRACKS = 3;
const MAX_MUSIC_TRACKS = 2;
const MAX_TRACK_SLOTS = MAX_VOICE_TRACKS + MAX_MUSIC_TRACKS;
const TRACK_ACCENTS = [
  "border-violet-400/70 bg-violet-400/15 text-violet-200",
  "border-sky-400/70 bg-sky-400/15 text-sky-200",
  "border-teal-400/70 bg-teal-400/15 text-teal-200",
  "border-amber-400/70 bg-amber-400/15 text-amber-100",
  "border-emerald-400/70 bg-emerald-400/15 text-emerald-200",
];
const TIMELINE_ACCENTS = ["#a78bfa", "#38bdf8", "#2dd4bf", "#fbbf24", "#34d399"];
const STUDIO_CLIP_OVERLAP_ERROR =
  "Здесь недостаточно свободного места для вставки фрагмента.";

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

export default function StudioEditorShell({
  persistedHydration,
  recorderDebug = false,
  audioDebug = false,
}: {
  persistedHydration?: StudioProjectHydration | null;
  recorderDebug?: boolean;
  audioDebug?: boolean;
}) {
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
  const [history, setHistory] = useState<StudioHistory | null>(null);
  const [clipboard, setClipboard] = useState<StudioClipClipboard | null>(null);
  const [editingError, setEditingError] = useState<string | null>(null);
  const historyRef = useRef<StudioHistory | null>(null);
  const hydratedProjectIdRef = useRef<string | null>(null);
  const gestureSnapshotRef = useRef<StudioEditingSnapshot | null>(null);
  const controllerRef = useRef<StudioAutosaveController | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const projectNameRef = useRef(projectName);
  const slotsRef = useRef<StudioTrackSlot[]>([]);
  const tracksRef = useRef<StudioLocalTrack[]>([]);
  const assetSignatureRef = useRef<string | null>(null);
  const [autosaveState, setAutosaveState] = useState<StudioAutosaveState | null>(null);
  const [slots, setSlots] = useState<StudioTrackSlot[]>([
    { id: "slot-voice-1", name: "Голос 1", audioTrackId: null, trackKind: "voice" },
    { id: "slot-music-1", name: "Музыка 1", audioTrackId: null, trackKind: "music" },
  ]);
  const {
    createMicrophoneAnalyser,
    currentTime,
    exportEditingState,
    getTrackBuffer,
    hasPersistenceProject,
    ingestRecordedFile,
    loadLocalFiles,
    pause,
    pasteClips,
    play,
    projectDuration,
    projectError,
    audioDebugState,
    removeTrack,
    rippleDeleteClip,
    replaceTrackAudio,
    retryTrackAssetUpload,
    restoreEditingState,
    seek,
    seekRelative,
    setClipFades,
    setClipLayout,
    splitClip,
    removeClip,
    setTrackVolume,
    setTrackVoicePreset,
    status,
    toggleTrackMuted,
    tracks,
    updateRetainedAssets,
  } = useStudioAudio();

  useEffect(() => {
    projectNameRef.current = projectName;
    slotsRef.current = slots;
    tracksRef.current = tracks;
  }, [projectName, slots, tracks]);

  useEffect(() => {
    if (controllerRef.current) return;
    controllerRef.current = new StudioAutosaveController({
      getSnapshot: () => {
        const assetState = tracksRef.current.some(
          (track) => !track.assetId || track.assetPersistenceStatus !== "saved",
        );
        const hasAssetError = tracksRef.current.some(
          (track) => track.assetPersistenceStatus === "error",
        );
        const projectId = projectIdRef.current;
        if (!projectId) {
          throw new Error("Persisted project is not ready");
        }
        const serialized = serializeStudioProjectState({
          currentTime: exportEditingState().position,
          slots: slotsRef.current,
          tracks: tracksRef.current.map((track) => ({
            id: track.id,
            assetId: track.assetId,
            assetPersistenceStatus: track.assetPersistenceStatus,
            name: track.fileName,
            volume: track.volume,
            muted: track.muted,
            trackKind: track.trackKind,
            voicePreset: track.voicePreset,
            clips: track.clips,
          })),
        });
        return {
          name: projectNameRef.current.trim() || "Новый проект",
          document: serialized.document,
          blocked: hasAssetError ? "asset-error" : assetState || serialized.pendingTrackIds.length
            ? "assets"
            : undefined,
        };
      },
      update: async ({ expectedRevision, name, projectData }) => {
        const projectId = projectIdRef.current;
        if (!projectId) throw new Error("Persisted project is not ready");
        const project = await updateStudioProject({
          projectId,
          expectedRevision,
          name,
          projectData,
        });
        return { revision: project.revision };
      },
      onChange: setAutosaveState,
    });
  }, [exportEditingState]);

  const markSavedChange = useCallback(() => {
    controllerRef.current?.markDirty();
  }, []);

  useEffect(() => {
    if (
      !persistedHydration ||
      hydratedProjectIdRef.current === persistedHydration.project.id
    ) return;
    hydratedProjectIdRef.current = persistedHydration.project.id;
    projectIdRef.current = persistedHydration.project.id;
    setProjectName(persistedHydration.project.name);
    setSlots(persistedHydration.state.slots.map((slot) => ({
      ...slot,
      trackKind: slot.trackKind ?? "voice",
    })));
    setSelectedClipId(null);
    setClipboard(null);
    setEditingError(null);
    const initial = createStudioEditingSnapshot({
      tracks: tracks.map((track) => ({
        id: track.id,
        fileName: track.fileName,
        fileSize: track.fileSize,
        assetId: track.assetId,
        assetPersistenceStatus: track.assetPersistenceStatus,
        clips: track.clips,
        volume: track.volume,
        muted: track.muted,
        trackKind: track.trackKind,
        voicePreset: track.voicePreset,
      })),
      slots: persistedHydration.state.slots,
      selectedClipId: null,
      position: persistedHydration.state.currentTime,
    });
    const nextHistory = createStudioHistory(initial);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    assetSignatureRef.current = tracks
      .map((track) => `${track.id}:${track.assetId ?? ""}:${track.assetPersistenceStatus}`)
      .join("|");
    controllerRef.current?.hydrate({
      revision: persistedHydration.project.revision,
      name: persistedHydration.project.name,
      document: validateStudioProjectDocument(persistedHydration.project.projectData),
      complete: persistedHydration.failures.size === 0,
    });
  }, [persistedHydration, tracks]);

  useEffect(() => {
    if (!persistedHydration) return;
    const signature = tracks
      .map((track) => `${track.id}:${track.assetId ?? ""}:${track.assetPersistenceStatus}`)
      .join("|");
    if (assetSignatureRef.current === null) {
      assetSignatureRef.current = signature;
      return;
    }
    if (signature !== assetSignatureRef.current) {
      assetSignatureRef.current = signature;
      controllerRef.current?.notifyAssetBound();
    }
  }, [persistedHydration, tracks]);

  useEffect(() => {
    const controller = controllerRef.current;
    return () => controller?.dispose();
  }, []);

  useEffect(() => {
    if (!autosaveState?.canWarnBeforeUnload) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [autosaveState?.canWarnBeforeUnload]);

  const tracksById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  const captureEditingSnapshot = useCallback(
    (): StudioEditingSnapshot => ({
      ...exportEditingState(),
      slots: slots.map((slot) => ({ ...slot })),
      selectedClipId,
    }),
    [exportEditingState, selectedClipId, slots],
  );
  const updateHistory = useCallback((nextHistory: StudioHistory) => {
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    updateRetainedAssets([
      ...nextHistory.past.flatMap((snapshot) =>
        snapshot.tracks.map((track) => track.id),
      ),
      ...nextHistory.future.flatMap((snapshot) =>
        snapshot.tracks.map((track) => track.id),
      ),
      ...(clipboard ? [clipboard.sourceTrackId] : []),
    ]);
  }, [clipboard, updateRetainedAssets]);
  const recordEditingHistory = useCallback(
    (before: StudioEditingSnapshot) => {
      const next = recordStudioHistory(
        historyRef.current ?? createStudioHistory(before),
        captureEditingSnapshot(),
      );
      updateHistory(next);
      markSavedChange();
    },
    [captureEditingSnapshot, markSavedChange, updateHistory],
  );
  const runEditingAction = useCallback(
    <Result,>(action: () => Result): Result => {
      const before = captureEditingSnapshot();
      const result = action();
      recordEditingHistory(before);
      return result;
    },
    [captureEditingSnapshot, recordEditingHistory],
  );
  const restoreHistorySnapshot = useCallback(
    (snapshot: StudioEditingSnapshot) => {
      restoreEditingState(snapshot);
      const validClipIds = new Set(
        snapshot.tracks.flatMap((track) => track.clips.map((clip) => clip.id)),
      );
      const trackIds = new Set(snapshot.tracks.map((track) => track.id));
      setSlots(
        snapshot.slots.map((slot) => ({
          ...slot,
          audioTrackId:
            slot.audioTrackId && trackIds.has(slot.audioTrackId)
              ? slot.audioTrackId
              : null,
          trackKind: slot.trackKind ?? "voice",
        })),
      );
      setSelectedClipId(
        snapshot.selectedClipId && validClipIds.has(snapshot.selectedClipId)
          ? snapshot.selectedClipId
          : null,
      );
      setEditingError(null);
    },
    [restoreEditingState, setSlots],
  );
  const undo = useCallback(() => {
    const next = undoStudioHistory(historyRef.current ?? createStudioHistory(
      captureEditingSnapshot(),
    ));
    if (!next.snapshot) return;
    updateHistory(next.history);
    restoreHistorySnapshot(next.snapshot);
    markSavedChange();
  }, [captureEditingSnapshot, markSavedChange, restoreHistorySnapshot, updateHistory]);
  const redo = useCallback(() => {
    const next = redoStudioHistory(historyRef.current ?? createStudioHistory(
      captureEditingSnapshot(),
    ));
    if (!next.snapshot) return;
    updateHistory(next.history);
    restoreHistorySnapshot(next.snapshot);
    markSavedChange();
  }, [captureEditingSnapshot, markSavedChange, restoreHistorySnapshot, updateHistory]);
  const selectedTrackAndClip = (() => {
    for (const track of tracks) {
      const clip = track.clips.find((item) => item.id === selectedClipId);
      if (clip) return { track, clip };
    }
    return null;
  })();
  const canSplitSelectedClip = Boolean(
    selectedTrackAndClip &&
      currentTime >
        selectedTrackAndClip.clip.startTime + MIN_STUDIO_CLIP_DURATION &&
      currentTime <
        selectedTrackAndClip.clip.startTime +
          selectedTrackAndClip.clip.duration -
          MIN_STUDIO_CLIP_DURATION,
  );
  const splitSelectedClip = useCallback(() => {
    if (!selectedTrackAndClip || !canSplitSelectedClip) {
      return false;
    }

    const nextId = runEditingAction(() =>
      splitClip(
        selectedTrackAndClip.track.id,
        selectedTrackAndClip.clip.id,
        currentTime,
      ),
    );
    if (nextId) {
      setSelectedClipId(nextId);
      return true;
    }
    return false;
  }, [
    canSplitSelectedClip,
    currentTime,
    runEditingAction,
    selectedTrackAndClip,
    splitClip,
  ]);
  const detachTrackFromSlots = useCallback((trackId: string) => {
    setSlots((currentSlots) =>
      currentSlots.map((slot) =>
        slot.audioTrackId === trackId ? { ...slot, audioTrackId: null } : slot,
      ),
    );
  }, [setSlots]);
  const deleteSelectedClip = useCallback(() => {
    if (!selectedTrackAndClip) return;
    runEditingAction(() => {
      if (selectedTrackAndClip.track.clips.length === 1) {
        removeTrack(selectedTrackAndClip.track.id);
        detachTrackFromSlots(selectedTrackAndClip.track.id);
      } else {
        removeClip(selectedTrackAndClip.track.id, selectedTrackAndClip.clip.id);
      }
    });
    setSelectedClipId(null);
  }, [detachTrackFromSlots, removeClip, removeTrack, runEditingAction, selectedTrackAndClip]);
  const rippleDeleteSelectedClip = useCallback(() => {
    if (!selectedTrackAndClip) return;
    runEditingAction(() =>
      rippleDeleteClip(
        selectedTrackAndClip.track.id,
        selectedTrackAndClip.clip.id,
      ),
    );
    setSelectedClipId(null);
  }, [rippleDeleteClip, runEditingAction, selectedTrackAndClip]);
  const copySelectedClip = useCallback(() => {
    if (!selectedTrackAndClip) return;
    setClipboard(
      createStudioClipClipboard(
        selectedTrackAndClip.track.id,
        [selectedTrackAndClip.clip],
      ),
    );
    setEditingError(null);
  }, [selectedTrackAndClip]);
  const pasteClipboard = useCallback(() => {
    if (!clipboard) return;
    const targetTrack = tracks.find(
      (track) => track.id === clipboard.sourceTrackId,
    );
    if (!targetTrack) {
      return;
    }
    const buffer = getTrackBuffer(targetTrack.id);
    if (!buffer) return;
    const pastedPreview = getStudioPasteClips({
      clipboard,
      targetStartTime: currentTime,
      targetBufferDuration: buffer.duration,
      createClipId: () => crypto.randomUUID(),
    });
    const overlaps = pastedPreview.some((candidate) =>
      targetTrack.clips.some(
        (clip) =>
          candidate.startTime < clip.startTime + clip.duration &&
          candidate.startTime + candidate.duration > clip.startTime,
      ),
    );
    if (overlaps) {
      setEditingError(STUDIO_CLIP_OVERLAP_ERROR);
      return;
    }
    const pastedIds = runEditingAction(() =>
      pasteClips(targetTrack.id, clipboard, currentTime),
    );
    if (pastedIds[0]) {
      setSelectedClipId(pastedIds[0]);
    }
    setEditingError(null);
  }, [
    clipboard,
    currentTime,
    getTrackBuffer,
    pasteClips,
    runEditingAction,
    tracks,
  ]);
  const isLoading = status === "loading";
  const isPlaying = status === "playing";
  const canControlTransport = tracks.length > 0 && !isLoading;
  const {
    isArmingRecording,
    isProcessingRecording,
    isRecording,
    recordingElapsed,
    recordingError,
    recordingAnalyser,
    recordingStartTime,
    recordingSlotId,
    recordingStatus,
    recorderDebugState,
    recordStopControlEvent,
    startRecording,
    stopRecording,
  } = useStudioRecorder({
    createMicrophoneAnalyser,
    debugEnabled: recorderDebug,
    onRecordedFile: async (file, startTime, slotId) => {
      const track = await ingestRecordedFile(file, { startTime });
      if (track) {
        setSlots((currentSlots) =>
          currentSlots.map((slot) =>
            slot.id === slotId ? { ...slot, audioTrackId: track.id } : slot,
          ),
        );
        markSavedChange();
      }
    },
  });

  useEffect(() => {
    const handleStudioShortcut = (event: KeyboardEvent) => {
      if (event.isComposing || isNativeInteractiveTarget(event.target)) {
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;

      if (
        event.key === " " &&
        !event.repeat &&
        !modifier &&
        !event.altKey &&
        canControlTransport
      ) {
        event.preventDefault();
        if (isPlaying) {
          pause();
        } else {
          void play();
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "c") {
        if (!selectedTrackAndClip) return;
        event.preventDefault();
        copySelectedClip();
        return;
      }
      if (modifier && event.key.toLowerCase() === "v") {
        if (!clipboard) return;
        event.preventDefault();
        pasteClipboard();
        return;
      }
      if (
        modifier &&
        !event.altKey &&
        !event.repeat &&
        event.key.toLowerCase() === "b" &&
        canSplitSelectedClip
      ) {
        if (splitSelectedClip()) {
          event.preventDefault();
        }
        return;
      }
      if (
        !modifier &&
        !event.altKey &&
        !event.repeat &&
        event.shiftKey &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedTrackAndClip
      ) {
        event.preventDefault();
        rippleDeleteSelectedClip();
        return;
      }
      if (
        !modifier &&
        !event.altKey &&
        !event.repeat &&
        !event.shiftKey &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedTrackAndClip
      ) {
        event.preventDefault();
        deleteSelectedClip();
      }
    };

    document.addEventListener("keydown", handleStudioShortcut);
    return () => document.removeEventListener("keydown", handleStudioShortcut);
  }, [
    canControlTransport,
    canSplitSelectedClip,
    clipboard,
    copySelectedClip,
    deleteSelectedClip,
    isPlaying,
    pasteClipboard,
    pause,
    play,
    redo,
    rippleDeleteSelectedClip,
    selectedTrackAndClip,
    splitSelectedClip,
    undo,
  ]);

  const timelineTracks = slots.map((slot) => {
    const track = slot.audioTrackId
      ? tracksById.get(slot.audioTrackId)
      : undefined;
    return {
      id: track?.id ?? slot.id,
      slotId: slot.id,
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
    const slot = slots.find((item) => item.id === slotId);
    if (addAudioInputRef.current) {
      addAudioInputRef.current.dataset.slotId = slotId;
      addAudioInputRef.current.dataset.trackKind = slot?.trackKind ?? "music";
      addAudioInputRef.current.click();
    }
  };

  const startSlotRecording = (slotId: string) => {
    if (slots.find((slot) => slot.id === slotId)?.trackKind !== "voice") return;
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
      markSavedChange();
    }
    setEditingSlotId(null);
  };

  const cancelSlotRename = () => {
    setEditingSlotId(null);
    setSlotNameDraft("");
  };

  const addSlot = (trackKind: StudioTrackKind) => {
    setSlots((currentSlots) => {
      const sameKind = currentSlots.filter((slot) => slot.trackKind === trackKind).length;
      const limit = trackKind === "voice" ? MAX_VOICE_TRACKS : MAX_MUSIC_TRACKS;
      if (currentSlots.length >= MAX_TRACK_SLOTS || sameKind >= limit) {
        return currentSlots;
      }

      const nextNumber = sameKind + 1;
      const nextSlot = {
        id: `slot-${crypto.randomUUID()}`,
        name: `${trackKind === "voice" ? "Голос" : "Музыка"} ${nextNumber}`,
        audioTrackId: null,
        trackKind,
      };
      const insertAt = trackKind === "voice"
        ? currentSlots.findIndex((slot) => slot.trackKind === "music")
        : currentSlots.length;
      return insertAt < 0
        ? [...currentSlots, nextSlot]
        : [...currentSlots.slice(0, insertAt), nextSlot, ...currentSlots.slice(insertAt)];
    });
    markSavedChange();
  };

  const renderTimelineControls = (_timelineTrack: unknown, index: number) => {
    const slot = slots[index];
    const track = slot?.audioTrackId
      ? tracksById.get(slot.audioTrackId)
      : undefined;
    const selectedClip = track?.clips.find((clip) => clip.id === selectedClipId);
    const trackKind = track?.trackKind ?? slot.trackKind;
    if (!slot) {
      return null;
    }
    const accent = TRACK_ACCENTS[index % TRACK_ACCENTS.length];
    const musicVolumeDb = getStudioMusicVolumeDb(track?.volume ?? 1);
    const displayedVolume = trackKind === "music"
      ? `${Math.round(musicVolumeDb)} dB`
      : `${Math.round((track?.volume ?? 1) * 100)}%`;

    return (
      <div className="flex gap-3 py-1 lg:min-h-0">
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
            <button
              type="button"
              onPointerDown={(event) =>
                recordStopControlEvent("sidebar", "pointerdown", event.target)
              }
              onTouchStart={(event) =>
                recordStopControlEvent("sidebar", "touchstart", event.target)
              }
              onClick={(event) => {
                recordStopControlEvent(
                  "sidebar",
                  "click",
                  event.target,
                  event.currentTarget.getBoundingClientRect(),
                );
                stopRecording();
              }}
              className="mt-2 inline-flex min-h-10 w-fit items-center rounded-lg border border-rose-400/50 bg-rose-500/15 px-3 py-1 text-xs font-semibold tabular-nums text-rose-100"
            >
              Стоп · {formatTime(recordingElapsed)}
            </button>
          ) : null}
          {hasPersistenceProject && track ? (
            <div className="mt-2 flex items-center gap-2 text-xs" aria-live="polite">
              {track.status === "error" ? (
                <span className="text-rose-200">
                  {track.replacementError ?? "Не удалось загрузить аудио дорожки"}
                </span>
              ) : null}
              <span className={
                track.assetPersistenceStatus === "error"
                  ? "text-rose-200"
                  : "text-[#9ba7bb]"
              }>
                {track.assetPersistenceStatus === "pending"
                  ? "Ожидает сохранения"
                  : track.assetPersistenceStatus === "uploading"
                    ? "Сохранение аудио…"
                    : track.assetPersistenceStatus === "saved"
                      ? "Аудио сохранено"
                      : "Не удалось сохранить аудио"}
              </span>
              {track.assetPersistenceStatus === "error" ? (
                <button
                  type="button"
                  onClick={() => retryTrackAssetUpload(track.id)}
                  className="text-[#d8c8fb] underline underline-offset-4"
                >
                  Повторить
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <TrackMuteButton
              track={track}
              onToggle={() => {
                if (track) {
                  toggleTrackMuted(track.id);
                  markSavedChange();
                }
              }}
            />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                aria-label={`Громкость ${slot.name}`}
                type="range"
                min={trackKind === "music" ? STUDIO_MUSIC_VOLUME_MIN_DB : "0"}
                max={trackKind === "music" ? STUDIO_MUSIC_VOLUME_MAX_DB : "400"}
                value={trackKind === "music"
                  ? Math.round(musicVolumeDb)
                  : Math.round((track?.volume ?? 1) * 100)}
                disabled={!track}
                onChange={(event) => {
                  if (!track) return;
                  const nextVolume = trackKind === "music"
                    ? getStudioMusicVolumeFromDb(Number(event.target.value))
                    : Number(event.target.value) / 100;
                  setTrackVolume(track.id, nextVolume);
                  markSavedChange();
                }}
                title={
                  track
                    ? `Громкость: ${displayedVolume}`
                    : "Добавьте аудио, чтобы регулировать громкость"
                }
                className="min-w-20 flex-1 accent-[#9f7aea] disabled:cursor-not-allowed disabled:opacity-40"
              />
              <span className="text-[10px] text-[#9ba7bb]">
                {displayedVolume}
              </span>
            </div>
          </div>
          {trackKind === "voice" && (track?.volume ?? 1) > 2 ? (
            <p className="mt-1 text-[10px] text-[#9ba7bb]">
              Высокое усиление может вызвать искажения
            </p>
          ) : null}
          {trackKind === "music" ? <div className="mt-2 flex flex-wrap gap-2">
            <TrackFadeButton
              clip={selectedClip}
              kind="in"
              onToggle={() => {
                if (!track || !selectedClip) return;
                runEditingAction(() =>
                  setClipFades(track.id, selectedClip.id, {
                    fadeInDuration:
                      selectedClip.fadeInDuration > 0
                        ? 0
                        : getStudioDefaultFadeDuration(selectedClip.duration),
                  }),
                );
              }}
            />
            <TrackFadeButton
              clip={selectedClip}
              kind="out"
              onToggle={() => {
                if (!track || !selectedClip) return;
                runEditingAction(() =>
                  setClipFades(track.id, selectedClip.id, {
                    fadeOutDuration:
                      selectedClip.fadeOutDuration > 0
                        ? 0
                        : getStudioDefaultFadeDuration(selectedClip.duration),
                  }),
                );
              }}
            />
          </div> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
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
                <button type="button" disabled={!canSplitSelectedClip} onClick={splitSelectedClip} className="text-[#d8c8fb] disabled:opacity-40">
                  Разрезать
                </button>
                <button type="button" disabled={!selectedClip} onClick={deleteSelectedClip} className="text-[#a9b4c7] disabled:opacity-40">
                  Удалить фрагмент
                </button>
                <button type="button" disabled={!selectedClip} onClick={rippleDeleteSelectedClip} className="text-[#a9b4c7] disabled:opacity-40">
                  Удалить + сдвиг
                </button>
                <button
                  type="button"
                  onClick={() => {
                    runEditingAction(() => {
                      removeTrack(track.id);
                      detachTrackFromSlots(track.id);
                    });
                    setSelectedClipId(null);
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
                  disabled={isLoading || isArmingRecording || isRecording || isProcessingRecording}
                  onClick={() => openAddAudioDialog(slot.id)}
                  className="text-[#d8c8fb] disabled:opacity-40"
                >
                  {trackKind === "voice" ? "Загрузить голос" : "Добавить музыку"}
                </button>
                {trackKind === "voice" && (recordingSlotId === slot.id && isRecording ? null : (
                  <button
                    type="button"
                    disabled={isLoading || isArmingRecording || isRecording || isProcessingRecording}
                    onClick={() => startSlotRecording(slot.id)}
                    className="text-[#d8c8fb] disabled:opacity-40"
                  >
                    Записать голос
                  </button>
                ))}
              </div>
            ) : null}
            {track?.trackKind === "voice" ? (
              <select
                aria-label={`Обработка голоса ${slot.name}`}
                value={track.voicePreset}
                onChange={(event) => {
                  runEditingAction(() =>
                    setTrackVoicePreset(track.id, event.target.value as StudioVoicePreset),
                  );
                  markSavedChange();
                }}
                className="rounded border border-white/15 bg-[#1c2433] px-2 py-1 text-xs text-white"
              >
                <option value="none">Без эффекта</option>
                <option value="focus">Фокус</option>
                <option value="depth">Глубина</option>
                <option value="trance">Транс</option>
              </select>
            ) : null}
            {index >= 2 ? (
              <button
                type="button"
                disabled={recordingSlotId === slot.id || isArmingRecording || isProcessingRecording}
                onClick={() => {
                  if (track) removeTrack(track.id);
                  setSlots((currentSlots) =>
                    currentSlots.filter((item) => item.id !== slot.id),
                  );
                  markSavedChange();
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
    const isThisSlotRecording = recordingSlotId === slot.id && isRecording;
    const isVoiceSlot = slot.trackKind === "voice";
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-medium text-[#e2e8f5]">
          {isVoiceSlot ? "Добавьте голос" : "Добавьте музыку"}
        </p>
        <p className="mt-1 text-xs text-[#97a4b8]">
          Загрузите аудиофайл с устройства
        </p>
        <p className="mt-2 text-xs text-[#718096]">
          {isVoiceSlot ? "При записи под музыку лучше использовать наушники." : "Загрузите фоновую музыку или ambience."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={isLoading || isArmingRecording || isRecording || isProcessingRecording}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              openAddAudioDialog(slot.id);
            }}
            className="h-10 rounded-lg bg-[#7650bd] px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {isVoiceSlot ? "Загрузить голос" : "Добавить музыку"}
          </button>
          {isThisSlotRecording ? (
            <button
              type="button"
              onPointerUp={(event) => event.stopPropagation()}
              onPointerDown={(event) => {
                event.stopPropagation();
                recordStopControlEvent("timeline", "pointerdown", event.target);
              }}
              onClick={(event) => {
                event.stopPropagation();
                recordStopControlEvent("timeline", "click", event.target);
                stopRecording();
              }}
              className="h-10 rounded-lg border border-rose-300/60 bg-rose-400/15 px-4 text-sm font-semibold text-rose-100"
            >
              Стоп · {formatTime(recordingElapsed)}
            </button>
          ) : isVoiceSlot ? (
            <button
              type="button"
              disabled={isLoading || isArmingRecording || isRecording || isProcessingRecording}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                startSlotRecording(slot.id);
              }}
              className="h-10 rounded-lg border border-violet-300/60 px-4 text-sm font-semibold text-violet-100 disabled:opacity-40"
            >
              Записать голос
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const guardNavigation = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (
      autosaveState?.canWarnBeforeUnload &&
      !window.confirm("Есть несохранённые изменения. Если выйти сейчас, они могут быть потеряны.")
    ) {
      event.preventDefault();
    }
  }, [autosaveState?.canWarnBeforeUnload]);

  const autosaveMessage = autosaveState?.status === "partial-disabled"
    ? "Проект открыт не полностью. Сохранение отключено."
    : autosaveState?.status === "conflict"
      ? "Проект изменён в другой вкладке. Обновите страницу, чтобы продолжить."
      : autosaveState?.status === "asset-uploading"
        ? "Сохранение аудио…"
        : autosaveState?.status === "error"
          ? "Ошибка сохранения"
          : autosaveState?.isInFlight
            ? "Сохранение…"
            : autosaveState?.dirty
              ? "Есть несохранённые изменения"
              : autosaveState?.status === "saved" && persistedHydration
              ? "Сохранено"
              : null;
  const saveIsInFlight = autosaveState?.isInFlight ?? false;
  const saveHasDirtyChanges = autosaveState?.dirty ?? false;
  const saveIsUnavailable = !persistedHydration ||
    autosaveState?.status === "partial-disabled" ||
    autosaveState?.status === "conflict";
  const saveButtonDisabled = saveIsUnavailable || saveIsInFlight || !saveHasDirtyChanges;
  const saveButtonLabel = saveIsInFlight
    ? "Сохранение…"
    : saveHasDirtyChanges
      ? "Сохранить"
      : "Сохранено";

  return (
    <section className="min-h-dvh bg-[#0b1019] text-[#edf0f7]">
      <div className="mx-auto flex min-h-dvh max-w-[1920px] flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#0f1520] px-4 py-3 lg:px-6">
          <StudioBrand />
          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/studio"
              onClick={guardNavigation}
              className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm text-[#bfc9da] hover:bg-white/5"
            >
              ← Назад в Studio
            </Link>
            <Link
              href="/author-dashboard"
              onClick={guardNavigation}
              className="inline-flex min-h-9 items-center rounded-lg border border-white/15 px-3 text-sm font-medium text-white"
            >
              В кабинет автора
            </Link>
            <Link
              href="/profile"
              onClick={guardNavigation}
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
                  onBlur={() => {
                    setIsEditingProjectName(false);
                    markSavedChange();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setIsEditingProjectName(false);
                      markSavedChange();
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
              <button
                type="button"
                onPointerDown={(event) => recordStopControlEvent("top", "pointerdown", event.target)}
                onClick={(event) => {
                  recordStopControlEvent("top", "click", event.target);
                  stopRecording();
                }}
                className="min-h-10 rounded border border-rose-400/50 bg-rose-500/10 px-3 py-1 text-xs font-semibold tabular-nums text-rose-200"
              >
                Стоп · {formatTime(recordingElapsed)}
              </button>
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
              <button
                type="button"
                disabled={!history || history.past.length < 2}
                onClick={undo}
                title="Отменить последнее действие (Ctrl/Cmd+Z)"
                className="h-10 rounded-lg border border-white/15 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Отменить
              </button>
              <button
                type="button"
                disabled={!history || history.future.length === 0}
                onClick={redo}
                title="Повторить отменённое действие (Ctrl/Cmd+Shift+Z или Ctrl+Y)"
                className="h-10 rounded-lg border border-white/15 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Повторить
              </button>
              <button
                type="button"
                disabled={saveButtonDisabled}
                onClick={() => controllerRef.current?.retry()}
                className="h-10 rounded-lg border border-white/15 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saveButtonLabel}
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
          {autosaveMessage ? (
            <p
              role={autosaveState?.status === "error" || autosaveState?.status === "conflict" ? "alert" : "status"}
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                autosaveState?.status === "error" || autosaveState?.status === "conflict"
                  ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                  : "border-white/10 bg-[#131b28] text-[#c9d8ff]"
              }`}
            >
              {autosaveMessage}
              {autosaveState?.status === "conflict" ? (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="ml-3 underline underline-offset-4"
                >
                  Обновить страницу
                </button>
              ) : null}
            </p>
          ) : null}
          {editingError ? (
            <p role="alert" className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {editingError}
            </p>
          ) : null}
          {recordingError ? (
            <p role="alert" className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {recordingError}
            </p>
          ) : null}
          {recordingStatus === "arming" ? (
            <p role="status" className="mb-4 rounded-lg border border-violet-300/30 bg-violet-400/10 px-4 py-3 text-sm text-violet-100">
              Включаем микрофон…
            </p>
          ) : null}
          {recorderDebug ? (
            <section
              aria-label="Отладка записи"
              className="mb-4 rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-50"
            >
              <p className="font-semibold">Отладка записи</p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <div>
                  <dt className="inline text-amber-100/70">Статус: </dt>
                  <dd className="inline">{recordingStatus}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">Recording slot: </dt>
                  <dd className="inline">{recordingSlotId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">Row slot: </dt>
                  <dd className="inline">{recordingSlotId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">Длительность: </dt>
                  <dd className="inline">{formatTime(recordingElapsed)}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">Активна: </dt>
                  <dd className="inline">{isRecording ? "да" : "нет"}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">MediaRecorder: </dt>
                  <dd className="inline">{recorderDebugState.mediaRecorderState}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">Live tracks: </dt>
                  <dd className="inline">{recorderDebugState.activeStreamTrackCount}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">Stop clicks: </dt>
                  <dd className="inline">{recorderDebugState.stopClickCount}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">Last Stop click: </dt>
                  <dd className="inline">{recorderDebugState.lastStopClickAt ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">Last Stop action: </dt>
                  <dd className="inline">{recorderDebugState.lastStopAction}</dd>
                </div>
                <div>
                  <dt className="inline text-amber-100/70">Last guard: </dt>
                  <dd className="inline">
                    {recorderDebugState.lastStopGuardStatus ?? "—"} /{" "}
                    {recorderDebugState.lastStopRecorderPresent ? "present" : "missing"} /{" "}
                    {recorderDebugState.lastStopMediaRecorderState}
                  </dd>
                </div>
                <div><dt className="inline text-amber-100/70">Requested / recorder MIME: </dt><dd className="inline">{recorderDebugState.requestedMimeType ?? "—"} / {recorderDebugState.recorderMimeType ?? "—"}</dd></div>
                <div><dt className="inline text-amber-100/70">Blob / File / persist MIME: </dt><dd className="inline">{recorderDebugState.blobType ?? "—"} / {recorderDebugState.fileType ?? "—"} / {recorderDebugState.normalizedPersistenceMime ?? "—"}</dd></div>
                <div><dt className="inline text-amber-100/70">Mic requests: </dt><dd className="inline">{recorderDebugState.microphoneRequestCount} · {recorderDebugState.lastMicrophoneRequestStartedAt ?? "—"}</dd></div>
                <div><dt className="inline text-amber-100/70">getUserMedia: </dt><dd className="inline">{recorderDebugState.lastGetUserMediaSuccessAt ?? "—"} / {recorderDebugState.lastGetUserMediaErrorName ?? "—"}</dd></div>
                <div><dt className="inline text-amber-100/70">Recording error: </dt><dd className="inline">{recorderDebugState.lastRecordingErrorReason ?? "—"} / {recorderDebugState.currentRecordingError ?? "—"}</dd></div>
                <div><dt className="inline text-amber-100/70">Stop top P/C: </dt><dd className="inline">{recorderDebugState.topStopPointerDownCount}/{recorderDebugState.topStopClickCount}</dd></div>
                <div><dt className="inline text-amber-100/70">Stop sidebar P/T/C: </dt><dd className="inline">{recorderDebugState.sidebarStopPointerDownCount}/{recorderDebugState.sidebarStopTouchStartCount}/{recorderDebugState.sidebarStopClickCount}</dd></div>
                <div><dt className="inline text-amber-100/70">Stop timeline P/C: </dt><dd className="inline">{recorderDebugState.timelineStopPointerDownCount}/{recorderDebugState.timelineStopClickCount}</dd></div>
                <div><dt className="inline text-amber-100/70">Stop invoke/source: </dt><dd className="inline">{recorderDebugState.stopRecordingInvocationCount} / {recorderDebugState.lastStopSource ?? "—"}</dd></div>
                <div><dt className="inline text-amber-100/70">Sidebar rect / target: </dt><dd className="inline">{recorderDebugState.sidebarButtonRect ?? "—"} / {recorderDebugState.lastHitTarget ?? "—"}</dd></div>
              </dl>
            </section>
          ) : null}
          {audioDebug ? (
            <section
              aria-label="Отладка аудио"
              className="mb-4 rounded-lg border border-sky-300/30 bg-sky-400/10 px-4 py-3 text-xs text-sky-50"
            >
              <p className="font-semibold">Отладка аудио</p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <div><dt className="inline text-sky-100/70">Context: </dt><dd className="inline">{audioDebugState.contextState}</dd></div>
                <div><dt className="inline text-sky-100/70">Sample rate: </dt><dd className="inline">{audioDebugState.sampleRate ?? "—"}</dd></div>
                <div><dt className="inline text-sky-100/70">Context time: </dt><dd className="inline">{audioDebugState.contextCurrentTime ?? "—"}</dd></div>
                <div><dt className="inline text-sky-100/70">Active sources: </dt><dd className="inline">{audioDebugState.activeSourceCount}</dd></div>
                <div><dt className="inline text-sky-100/70">Output gain: </dt><dd className="inline">{audioDebugState.outputGain ?? "—"}</dd></div>
                <div><dt className="inline text-sky-100/70">Muted tracks: </dt><dd className="inline">{audioDebugState.mutedTrackCount}</dd></div>
                <div><dt className="inline text-sky-100/70">Play click: </dt><dd className="inline">{audioDebugState.lastPlayClickAt ?? "—"}</dd></div>
                <div><dt className="inline text-sky-100/70">Before / after resume: </dt><dd className="inline">{audioDebugState.stateBeforePlay ?? "—"} / {audioDebugState.stateAfterResume ?? "—"}</dd></div>
                <div><dt className="inline text-sky-100/70">Resume: </dt><dd className="inline">{audioDebugState.lastResumeResult}</dd></div>
                <div><dt className="inline text-sky-100/70">Resume error: </dt><dd className="inline">{audioDebugState.lastResumeError ?? "—"}</dd></div>
                <div><dt className="inline text-sky-100/70">Recorder / live tracks: </dt><dd className="inline">{recorderDebugState.mediaRecorderState} / {recorderDebugState.activeStreamTrackCount}</dd></div>
              </dl>
            </section>
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
            onClipGestureBegin={() => {
              gestureSnapshotRef.current = exportEditingState();
              pause();
            }}
            onClipGestureCommit={() => {
              const snapshot = gestureSnapshotRef.current;
              gestureSnapshotRef.current = null;
              if (snapshot) recordEditingHistory(snapshot);
            }}
            onClipGestureCancel={() => {
              gestureSnapshotRef.current = null;
            }}
            onClipLayoutChange={setClipLayout}
            onClipFadesChange={setClipFades}
            renderControls={renderTimelineControls}
            renderEmpty={renderTimelineEmptyState}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={slots.filter((slot) => slot.trackKind === "voice").length >= MAX_VOICE_TRACKS}
              onClick={() => addSlot("voice")}
              className="h-10 rounded-lg border border-dashed border-violet-300/40 px-3 text-sm font-semibold text-violet-100 disabled:opacity-40"
            >
              + Голос
            </button>
            <button
              type="button"
              disabled={slots.filter((slot) => slot.trackKind === "music").length >= MAX_MUSIC_TRACKS}
              onClick={() => addSlot("music")}
              className="h-10 rounded-lg border border-dashed border-sky-300/40 px-3 text-sm font-semibold text-sky-100 disabled:opacity-40"
            >
              + Музыка
            </button>
          </div>

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
                                  runEditingAction(() => removeTrack(track.id));
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
                                  runEditingAction(() => removeTrack(track.id));
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
              onClick={() => addSlot("voice")}
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
              const trackKind = event.currentTarget.dataset.trackKind as StudioTrackKind | undefined;
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              delete event.currentTarget.dataset.slotId;
              delete event.currentTarget.dataset.trackKind;
              if (!slotId || !file) {
                return;
              }
              void loadLocalFiles([file], trackKind ?? "music").then(([track]) => {
                if (track) {
                  setSlots((currentSlots) =>
                    currentSlots.map((slot) =>
                      slot.id === slotId
                        ? { ...slot, audioTrackId: track.id }
                        : slot,
                    ),
                  );
                  markSavedChange();
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
