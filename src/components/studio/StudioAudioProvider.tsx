"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  clampStudioAudioPosition,
  getStudioAudioPlaybackPosition,
  getStudioAudioRelativeSeekPosition,
  getStudioReplacementProjectSize,
  getStudioTrackGain,
} from "@/lib/studio/audio-engine-math";
import {
  getStudioClipLayout,
  getStudioProjectDurationFromClips,
  getStudioRippleDeleteResult,
  splitStudioClip,
  type StudioClip,
  type StudioClipLayout,
} from "@/lib/studio/clip-math";
import {
  clampStudioClipFades,
  getStudioFadeEnvelope,
  type StudioClipFades,
} from "@/lib/studio/fade-math";
import {
  MAX_LOCAL_FILE_SIZE_BYTES,
  validateStudioLocalFile,
} from "@/lib/studio/local-file-validation";
import { validateStudioRecordedFile } from "@/lib/studio/recorder";
import {
  createStudioEditingSnapshot,
  getStudioPasteClips,
  type StudioClipClipboard,
  type StudioEditingSnapshot,
  type StudioTrackSnapshot,
} from "@/lib/studio/history";
import {
  uploadStudioProjectAsset,
  type StudioAssetSourceType,
} from "@/lib/studio/persistence-client";
import type { StudioProjectHydration } from "@/lib/studio/hydration";

const MAX_LOCAL_TRACKS = 5;
const MAX_LOCAL_PROJECT_SIZE_BYTES = 750 * 1024 * 1024;

export type StudioAudioStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "error";

export type StudioAudioDebugState = {
  contextState: string;
  sampleRate: number | null;
  contextCurrentTime: number | null;
  activeSourceCount: number;
  outputGain: number | null;
  mutedTrackCount: number;
  lastPlayClickAt: string | null;
  lastResumeAttemptAt: string | null;
  lastResumeResult: string;
  lastResumeError: string | null;
  stateBeforePlay: string | null;
  stateAfterResume: string | null;
};

export type StudioLocalTrack = {
  id: string;
  fileName: string;
  fileSize: number;
  assetId: string | null;
  assetPersistenceStatus: "pending" | "uploading" | "saved" | "error";
  clips: StudioClip[];
  volume: number;
  muted: boolean;
  status: "loading" | "ready" | "error";
  isReplacing: boolean;
  replacementError: string | null;
};

type StudioAudioContextValue = {
  tracks: StudioLocalTrack[];
  hasPersistenceProject: boolean;
  persistenceProjectName: string | null;
  persistenceProjectRevision: number | null;
  projectDuration: number;
  status: StudioAudioStatus;
  currentTime: number;
  projectError: string | null;
  audioDebugState: StudioAudioDebugState;
  createMicrophoneAnalyser: (
    stream: MediaStream,
  ) => { analyser: AnalyserNode; disconnect: () => void };
  loadLocalFiles: (files: Iterable<File>) => Promise<StudioLocalTrack[]>;
  ingestRecordedFile: (
    file: File,
    options: { startTime: number },
  ) => Promise<StudioLocalTrack | null>;
  replaceTrackAudio: (trackId: string, file: File) => Promise<void>;
  retryTrackAssetUpload: (trackId: string) => void;
  decodePersistedAsset: (blob: Blob) => Promise<AudioBuffer>;
  hydratePersistedProject: (
    hydration: StudioProjectHydration,
  ) => { failedAssetIds: string[] };
  play: () => Promise<void>;
  pause: () => void;
  seek: (position: number) => void;
  seekRelative: (offset: number) => void;
  removeTrack: (trackId: string) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  toggleTrackMuted: (trackId: string) => void;
  setClipLayout: (
    trackId: string,
    clipId: string,
    layout: Partial<StudioClipLayout>,
  ) => void;
  setClipFades: (
    trackId: string,
    clipId: string,
    fades: Partial<StudioClipFades>,
  ) => void;
  splitClip: (trackId: string, clipId: string, atTime: number) => string | null;
  removeClip: (trackId: string, clipId: string) => void;
  rippleDeleteClip: (trackId: string, clipId: string) => void;
  pasteClips: (
    trackId: string,
    clipboard: StudioClipClipboard,
    startTime: number,
  ) => string[];
  getTrackBuffer: (trackId: string) => AudioBuffer | null;
  exportEditingState: () => StudioEditingSnapshot;
  restoreEditingState: (
    snapshot: StudioEditingSnapshot,
  ) => { missingTrackIds: string[] };
  restoreTracks: (
    tracks: StudioTrackSnapshot[],
    position?: number,
  ) => { missingTrackIds: string[] };
  pruneRetainedAssets: (referencedTrackIds: Iterable<string>) => void;
  updateRetainedAssets: (referencedTrackIds: Iterable<string>) => void;
  reset: () => void;
};

const StudioAudioContext = createContext<StudioAudioContextValue | null>(null);

type TrackRuntime = {
  file: File;
  buffer: AudioBuffer;
  sourceType: StudioAssetSourceType;
  outputGain: GainNode;
  sources: Map<string, { source: AudioBufferSourceNode; envelopeGain: GainNode }>;
};

type TrackAsset = Pick<TrackRuntime, "file" | "buffer" | "sourceType">;

export { validateStudioLocalFile };

function formatDecodeError(error: unknown): string {
  void error;
  return "Браузеру не удалось открыть выбранное аудио.";
}

function getTrackId(file: File, index: number): string {
  return `${file.name}:${file.size}:${file.lastModified}:${index}:${crypto.randomUUID()}`;
}

export function StudioAudioProvider({
  children,
  persistenceProjectId,
  debugEnabled = false,
}: {
  children: ReactNode;
  /** Opt in only from a future persisted project route. */
  persistenceProjectId?: string;
  debugEnabled?: boolean;
}) {
  const [tracks, setTracks] = useState<StudioLocalTrack[]>([]);
  const [status, setStatus] = useState<StudioAudioStatus>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [projectDuration, setProjectDuration] = useState(0);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [audioDebugState, setAudioDebugState] = useState<StudioAudioDebugState>({
    contextState: "missing",
    sampleRate: null,
    contextCurrentTime: null,
    activeSourceCount: 0,
    outputGain: null,
    mutedTrackCount: 0,
    lastPlayClickAt: null,
    lastResumeAttemptAt: null,
    lastResumeResult: "none",
    lastResumeError: null,
    stateBeforePlay: null,
    stateAfterResume: null,
  });
  const [persistenceContext, setPersistenceContext] = useState<{
    name: string | null;
    revision: number | null;
  }>({ name: null, revision: null });

  const audioContextRef = useRef<AudioContext | null>(null);
  const trackRuntimesRef = useRef(new Map<string, TrackRuntime>());
  const assetVaultRef = useRef(new Map<string, TrackAsset>());
  const tracksRef = useRef<StudioLocalTrack[]>([]);
  const positionRef = useRef(0);
  const startedAtContextTimeRef = useRef(0);
  const startedAtPositionRef = useRef(0);
  const projectDurationRef = useRef(0);
  const statusRef = useRef<StudioAudioStatus>("idle");
  const animationFrameRef = useRef<number | null>(null);
  const loadGenerationRef = useRef(0);
  const replacementGenerationRef = useRef(new Map<string, number>());
  const assetUploadGenerationRef = useRef(new Map<string, number>());
  const assetUploadControllersRef = useRef(new Map<string, AbortController>());
  const debugEnabledRef = useRef(debugEnabled);

  useEffect(() => {
    debugEnabledRef.current = debugEnabled;
  }, [debugEnabled]);

  const updateAudioDebug = useCallback((
    update: (current: StudioAudioDebugState) => StudioAudioDebugState,
  ) => {
    if (debugEnabledRef.current) setAudioDebugState(update);
  }, []);

  const getAudioDebugSnapshot = useCallback(() => {
    const context = audioContextRef.current;
    const runtimes = [...trackRuntimesRef.current.values()];
    return {
      contextState: context?.state ?? "missing",
      sampleRate: context?.sampleRate ?? null,
      contextCurrentTime: context?.currentTime ?? null,
      activeSourceCount: runtimes.reduce((count, runtime) => count + runtime.sources.size, 0),
      outputGain: runtimes[0]?.outputGain.gain.value ?? null,
      mutedTrackCount: tracksRef.current.filter((track) => track.muted).length,
    };
  }, []);

  const cancelProgressLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }

    const nextContext = new AudioContext();
    audioContextRef.current = nextContext;
    return nextContext;
  }, []);

  const createTrackRuntime = useCallback(
    (asset: TrackAsset): TrackRuntime => {
      const context = getAudioContext();
      const outputGain = context.createGain();
      outputGain.connect(context.destination);
      return { ...asset, outputGain, sources: new Map() };
    },
    [getAudioContext],
  );

  const createMicrophoneAnalyser = useCallback(
    (stream: MediaStream) => {
      const context = getAudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      return {
        analyser,
        disconnect: () => {
          source.disconnect();
          analyser.disconnect();
        },
      };
    },
    [getAudioContext],
  );

  const setStatusValue = useCallback((nextStatus: StudioAudioStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const replaceTracks = useCallback((nextTracks: StudioLocalTrack[]) => {
    tracksRef.current = nextTracks;
    projectDurationRef.current = getStudioProjectDurationFromClips(nextTracks);
    setTracks(nextTracks);
    setProjectDuration(projectDurationRef.current);
  }, []);

  const applyTrackGains = useCallback(() => {
    for (const track of tracksRef.current) {
      const runtime = trackRuntimesRef.current.get(track.id);
      if (runtime) {
        runtime.outputGain.gain.value = getStudioTrackGain({
          volume: track.volume,
          muted: track.muted,
        });
      }
    }
  }, []);

  const stopSources = useCallback(() => {
    for (const runtime of trackRuntimesRef.current.values()) {
      for (const { source, envelopeGain } of runtime.sources.values()) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // A source may already have reached its end.
        }
        source.disconnect();
        envelopeGain.disconnect();
      }
      runtime.sources.clear();
    }
  }, []);

  const getPlaybackPosition = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || statusRef.current !== "playing") {
      return positionRef.current;
    }

    return getStudioAudioPlaybackPosition({
      startedAtContextTime: startedAtContextTimeRef.current,
      startedAtPosition: startedAtPositionRef.current,
      contextTime: context.currentTime,
      duration: projectDurationRef.current,
    });
  }, []);

  const updateVisiblePosition = useCallback(() => {
    const nextPosition = getPlaybackPosition();
    positionRef.current = nextPosition;
    setCurrentTime(nextPosition);
    return nextPosition;
  }, [getPlaybackPosition]);

  const finishPlayback = useCallback(() => {
    cancelProgressLoop();
    stopSources();
    positionRef.current = projectDurationRef.current;
    setCurrentTime(projectDurationRef.current);
    setStatusValue("ready");
  }, [cancelProgressLoop, setStatusValue, stopSources]);

  const startProgressLoop = useCallback(() => {
    cancelProgressLoop();

    const tick = () => {
      if (statusRef.current !== "playing") {
        animationFrameRef.current = null;
        return;
      }

      const position = updateVisiblePosition();
      if (position >= projectDurationRef.current) {
        finishPlayback();
        return;
      }
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
  }, [cancelProgressLoop, finishPlayback, updateVisiblePosition]);

  const startSourcesAtPosition = useCallback(
    (requestedPosition: number) => {
      const context = audioContextRef.current;
      if (!context || tracksRef.current.length === 0) {
        return;
      }

      const position = clampStudioAudioPosition(
        requestedPosition,
        projectDurationRef.current,
      );
      const startAt = context.currentTime;
      for (const track of tracksRef.current) {
        const runtime = trackRuntimesRef.current.get(track.id);
        if (!runtime) {
          continue;
        }
        for (const clip of track.clips) {
          if (position >= clip.startTime + clip.duration) continue;
          const elapsedClipTime = Math.max(position - clip.startTime, 0);
          const remaining = clip.duration - elapsedClipTime;
          if (remaining <= 0) continue;
          const source = context.createBufferSource();
          const envelopeGain = context.createGain();
          source.buffer = runtime.buffer;
          source.connect(envelopeGain);
          envelopeGain.connect(runtime.outputGain);
          const sourceStartAt = startAt + Math.max(clip.startTime - position, 0);
          const fades = clampStudioClipFades(clip, clip.duration);
          const fadeGain = envelopeGain.gain;
          fadeGain.setValueAtTime(
            getStudioFadeEnvelope(elapsedClipTime, clip.duration, fades),
            sourceStartAt,
          );
          if (fades.fadeInDuration > elapsedClipTime) {
            fadeGain.linearRampToValueAtTime(1, sourceStartAt + (fades.fadeInDuration - elapsedClipTime));
          }
          const fadeOutStart = clip.duration - fades.fadeOutDuration;
          if (fadeOutStart > elapsedClipTime) {
            fadeGain.setValueAtTime(1, sourceStartAt + (fadeOutStart - elapsedClipTime));
          }
          if (fades.fadeOutDuration > 0) {
            fadeGain.linearRampToValueAtTime(0, sourceStartAt + (clip.duration - elapsedClipTime));
          }
          runtime.sources.set(clip.id, { source, envelopeGain });
          source.onended = () => {
            if (runtime.sources.get(clip.id)?.source === source) {
              runtime.sources.delete(clip.id);
            }
            source.disconnect();
            envelopeGain.disconnect();
          };
          source.start(
            sourceStartAt,
            clip.offset + elapsedClipTime,
            remaining,
          );
        }
      }

      startedAtContextTimeRef.current = startAt;
      startedAtPositionRef.current = position;
      positionRef.current = position;
      setCurrentTime(position);
      setStatusValue("playing");
      startProgressLoop();
    },
    [setStatusValue, startProgressLoop],
  );

  const disposeResources = useCallback(() => {
    cancelProgressLoop();
    stopSources();
    for (const runtime of trackRuntimesRef.current.values()) {
      runtime.outputGain.disconnect();
    }
    trackRuntimesRef.current.clear();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => {
        // Browsers can reject close during page teardown.
      });
    }
  }, [cancelProgressLoop, stopSources]);

  const cancelTrackAssetUpload = useCallback((trackId: string) => {
    assetUploadGenerationRef.current.set(
      trackId,
      (assetUploadGenerationRef.current.get(trackId) ?? 0) + 1,
    );
    assetUploadControllersRef.current.get(trackId)?.abort();
    assetUploadControllersRef.current.delete(trackId);
  }, []);

  const reset = useCallback(() => {
    loadGenerationRef.current += 1;
    for (const trackId of assetUploadControllersRef.current.keys()) {
      cancelTrackAssetUpload(trackId);
    }
    for (const [trackId, runtime] of trackRuntimesRef.current) {
      assetVaultRef.current.set(trackId, {
        file: runtime.file,
        buffer: runtime.buffer,
        sourceType: runtime.sourceType,
      });
    }
    disposeResources();
    replaceTracks([]);
    positionRef.current = 0;
    startedAtContextTimeRef.current = 0;
    startedAtPositionRef.current = 0;
    setCurrentTime(0);
    setProjectError(null);
    setStatusValue("idle");
  }, [cancelTrackAssetUpload, disposeResources, replaceTracks, setStatusValue]);

  const updateTrack = useCallback(
    (trackId: string, update: (track: StudioLocalTrack) => StudioLocalTrack) => {
      const nextTracks = tracksRef.current.map((track) =>
        track.id === trackId ? update(track) : track,
      );
      replaceTracks(nextTracks);
      applyTrackGains();
    },
    [applyTrackGains, replaceTracks],
  );

  const startTrackAssetUpload = useCallback((trackId: string) => {
    if (!persistenceProjectId) return;
    const asset = assetVaultRef.current.get(trackId);
    const track = tracksRef.current.find((item) => item.id === trackId);
    if (!asset || !track) return;

    cancelTrackAssetUpload(trackId);
    const generation = assetUploadGenerationRef.current.get(trackId) ?? 0;
    const controller = new AbortController();
    assetUploadControllersRef.current.set(trackId, controller);
    updateTrack(trackId, (item) => ({
      ...item,
      assetPersistenceStatus: "uploading",
    }));

    void uploadStudioProjectAsset({
      projectId: persistenceProjectId,
      file: asset.file,
      sourceType: asset.sourceType,
      signal: controller.signal,
    }).then(
      (uploadedAsset) => {
        if (
          assetUploadGenerationRef.current.get(trackId) !== generation ||
          assetUploadControllersRef.current.get(trackId) !== controller
        ) {
          return;
        }
        assetUploadControllersRef.current.delete(trackId);
        updateTrack(trackId, (item) => ({
          ...item,
          assetId: uploadedAsset.id,
          assetPersistenceStatus: "saved",
        }));
      },
      () => {
        if (
          controller.signal.aborted ||
          assetUploadGenerationRef.current.get(trackId) !== generation ||
          assetUploadControllersRef.current.get(trackId) !== controller
        ) {
          return;
        }
        assetUploadControllersRef.current.delete(trackId);
        updateTrack(trackId, (item) => ({
          ...item,
          assetPersistenceStatus: "error",
        }));
      },
    );
  }, [cancelTrackAssetUpload, persistenceProjectId, updateTrack]);

  const retryTrackAssetUpload = useCallback((trackId: string) => {
    const track = tracksRef.current.find((item) => item.id === trackId);
    if (track?.assetPersistenceStatus === "error") {
      startTrackAssetUpload(trackId);
    }
  }, [startTrackAssetUpload]);

  const decodePersistedAsset = useCallback(
    async (blob: Blob) => {
      const buffer = await getAudioContext().decodeAudioData(await blob.arrayBuffer());
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) {
        throw new Error("invalid persisted audio duration");
      }
      return buffer;
    },
    [getAudioContext],
  );

  const hydratePersistedProject = useCallback(
    (hydration: StudioProjectHydration) => {
      loadGenerationRef.current += 1;
      cancelProgressLoop();
      stopSources();
      for (const runtime of trackRuntimesRef.current.values()) {
        runtime.outputGain.disconnect();
      }
      trackRuntimesRef.current.clear();
      assetVaultRef.current.clear();

      const hydratedTracks: StudioLocalTrack[] = hydration.state.tracks.map((track) => {
        const asset = hydration.assets.get(track.assetId);
        const failure = hydration.failures.get(track.assetId);
        if (asset) {
          const runtime = createTrackRuntime({
            file: asset.file,
            buffer: asset.buffer,
            sourceType: asset.metadata.sourceType,
          });
          trackRuntimesRef.current.set(track.id, runtime);
          assetVaultRef.current.set(track.id, {
            file: asset.file,
            buffer: asset.buffer,
            sourceType: asset.metadata.sourceType,
          });
        }
        const metadata = asset?.metadata;
        return {
          id: track.id,
          fileName: metadata?.originalName ?? track.name,
          fileSize: metadata?.sizeBytes ?? 0,
          assetId: track.assetId,
          assetPersistenceStatus: "saved",
          clips: track.clips.map((clip) => ({ ...clip })),
          volume: track.volume,
          muted: track.muted,
          status: asset ? "ready" : "error",
          isReplacing: false,
          replacementError: failure?.message ?? (asset ? null : "Не удалось загрузить аудио дорожки."),
        };
      });
      replaceTracks(hydratedTracks);
      applyTrackGains();
      const position = Number.isFinite(hydration.state.currentTime)
        ? Math.max(hydration.state.currentTime, 0)
        : 0;
      positionRef.current = position;
      startedAtContextTimeRef.current = 0;
      startedAtPositionRef.current = position;
      setCurrentTime(position);
      setProjectError(
        hydration.failures.size > 0
          ? "Часть аудиодорожек не удалось загрузить. Остальные дорожки доступны."
          : null,
      );
      setPersistenceContext({
        name: hydration.project.name,
        revision: hydration.project.revision,
      });
      setStatusValue(
        hydratedTracks.some((track) => track.status === "ready")
          ? "paused"
          : hydratedTracks.length === 0
            ? "idle"
            : "error",
      );
      return { failedAssetIds: [...hydration.failures.keys()] };
    },
    [
      applyTrackGains,
      cancelProgressLoop,
      createTrackRuntime,
      replaceTracks,
      setStatusValue,
      stopSources,
    ],
  );

  const loadLocalFiles = useCallback(
    async (fileInput: Iterable<File>) => {
      const files = Array.from(fileInput);
      const validationError = files.map(validateStudioLocalFile).find(Boolean);
      if (validationError) {
        setProjectError(validationError);
        if (tracksRef.current.length === 0) {
          setStatusValue("error");
        }
        return [];
      }

      if (files.length === 0) {
        return [];
      }

      if (tracksRef.current.length + files.length > MAX_LOCAL_TRACKS) {
        setProjectError(`В проект можно добавить не больше ${MAX_LOCAL_TRACKS} дорожек.`);
        return [];
      }

      const totalSize =
        tracksRef.current.reduce((sum, track) => sum + track.fileSize, 0) +
        files.reduce((sum, file) => sum + file.size, 0);
      if (totalSize > MAX_LOCAL_PROJECT_SIZE_BYTES) {
        setProjectError("Общий размер дорожек не может превышать 750 МБ.");
        return [];
      }

      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      const statusBeforeLoad = statusRef.current;
      if (statusBeforeLoad !== "playing") {
        setStatusValue("loading");
      }
      setProjectError(null);

      const context = getAudioContext();
      const decodedTracks: Array<{ file: File; buffer: AudioBuffer }> = [];

      try {
        for (const file of files) {
          const decoded = await context.decodeAudioData(await file.arrayBuffer());
          if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) {
            throw new Error(`Некорректная длительность файла «${file.name}».`);
          }
          decodedTracks.push({ file, buffer: decoded });
        }

        if (generation !== loadGenerationRef.current) {
          return [];
        }

        const nextTracks = [...tracksRef.current];
        const createdTracks: StudioLocalTrack[] = [];
        for (const [index, { file, buffer }] of decodedTracks.entries()) {
          const id = getTrackId(file, index);
          const outputGain = context.createGain();
          outputGain.gain.value = 1;
          outputGain.connect(context.destination);
          trackRuntimesRef.current.set(id, {
            file,
            buffer,
            sourceType: "upload",
            outputGain,
            sources: new Map(),
          });
          assetVaultRef.current.set(id, { file, buffer, sourceType: "upload" });
          const createdTrack: StudioLocalTrack = {
            id,
            fileName: file.name,
            fileSize: file.size,
            assetId: null,
            assetPersistenceStatus: "pending",
            clips: [{
              id: crypto.randomUUID(),
              startTime: 0,
              offset: 0,
              duration: buffer.duration,
              fadeInDuration: 0,
              fadeOutDuration: 0,
            }],
            volume: 1,
            muted: false,
            status: "ready",
            isReplacing: false,
            replacementError: null,
          };
          nextTracks.push(createdTrack);
          createdTracks.push(createdTrack);
        }
        replaceTracks(nextTracks);
        applyTrackGains();
        if (persistenceProjectId) {
          for (const track of createdTracks) {
            startTrackAssetUpload(track.id);
          }
        }
        if (statusBeforeLoad === "playing") {
          const playbackPosition = getPlaybackPosition();
          cancelProgressLoop();
          stopSources();
          startSourcesAtPosition(playbackPosition);
        } else {
          setStatusValue(statusBeforeLoad === "paused" ? "paused" : "ready");
        }
        return createdTracks;
      } catch (decodeError) {
        if (generation !== loadGenerationRef.current) {
          return [];
        }

        setProjectError(formatDecodeError(decodeError));
        if (tracksRef.current.length === 0) {
          setStatusValue("error");
        } else if (statusBeforeLoad !== "playing") {
          setStatusValue(statusBeforeLoad);
        }
        return [];
      }
    },
    [
      applyTrackGains,
      cancelProgressLoop,
      getAudioContext,
      getPlaybackPosition,
      persistenceProjectId,
      replaceTracks,
      setStatusValue,
      startTrackAssetUpload,
      startSourcesAtPosition,
      stopSources,
    ],
  );

  const ingestRecordedFile = useCallback(
    async (file: File, { startTime }: { startTime: number }) => {
      const validationError = validateStudioRecordedFile(file);
      if (validationError) {
        setProjectError(validationError);
        return null;
      }
      if (tracksRef.current.length >= MAX_LOCAL_TRACKS) {
        setProjectError(`В проект можно добавить не больше ${MAX_LOCAL_TRACKS} дорожек.`);
        return null;
      }
      const projectSize =
        tracksRef.current.reduce((sum, track) => sum + track.fileSize, 0) +
        file.size;
      if (projectSize > MAX_LOCAL_PROJECT_SIZE_BYTES) {
        setProjectError("Общий размер дорожек не может превышать 750 МБ.");
        return null;
      }

      const statusBeforeIngest = statusRef.current;
      if (statusBeforeIngest !== "playing") {
        setStatusValue("loading");
      }
      setProjectError(null);
      const context = getAudioContext();

      try {
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) {
          throw new Error("invalid recorded audio duration");
        }
        const outputGain = context.createGain();
        outputGain.gain.value = 1;
        outputGain.connect(context.destination);
        const track: StudioLocalTrack = {
          id: getTrackId(file, tracksRef.current.length),
          fileName: file.name,
          fileSize: file.size,
          assetId: null,
          assetPersistenceStatus: "pending",
          clips: [{
            id: crypto.randomUUID(),
            startTime: Number.isFinite(startTime) && startTime >= 0 ? startTime : 0,
            offset: 0,
            duration: buffer.duration,
            fadeInDuration: 0,
            fadeOutDuration: 0,
          }],
          volume: 1,
          muted: false,
          status: "ready",
          isReplacing: false,
          replacementError: null,
        };
        trackRuntimesRef.current.set(track.id, {
          file,
          buffer,
          sourceType: "recording",
          outputGain,
          sources: new Map(),
        });
        assetVaultRef.current.set(track.id, { file, buffer, sourceType: "recording" });
        replaceTracks([...tracksRef.current, track]);
        applyTrackGains();
        if (persistenceProjectId) {
          startTrackAssetUpload(track.id);
        }
        if (statusBeforeIngest !== "playing") {
          setStatusValue(statusBeforeIngest === "paused" ? "paused" : "ready");
        }
        return track;
      } catch (decodeError) {
        setProjectError(
          `Не удалось обработать запись. ${formatDecodeError(decodeError)}`,
        );
        if (tracksRef.current.length === 0) {
          setStatusValue("error");
        } else if (statusBeforeIngest !== "playing") {
          setStatusValue(statusBeforeIngest);
        }
        return null;
      }
    },
    [
      applyTrackGains,
      getAudioContext,
      persistenceProjectId,
      replaceTracks,
      setStatusValue,
      startTrackAssetUpload,
    ],
  );

  const replaceTrackAudio = useCallback(
    async (trackId: string, file: File) => {
      const track = tracksRef.current.find((item) => item.id === trackId);
      const runtime = trackRuntimesRef.current.get(trackId);
      if (!track || !runtime || track.isReplacing) {
        return;
      }

      const validationError = validateStudioLocalFile(file);
      if (validationError) {
        updateTrack(trackId, (item) => ({
          ...item,
          replacementError: `Не удалось заменить аудио. ${validationError}`,
        }));
        return;
      }

      const projectSize = tracksRef.current.reduce(
        (total, item) => total + item.fileSize,
        0,
      );
      if (
        getStudioReplacementProjectSize(projectSize, track.fileSize, file.size) >
        MAX_LOCAL_PROJECT_SIZE_BYTES
      ) {
        updateTrack(trackId, (item) => ({
          ...item,
          replacementError:
            "Не удалось заменить аудио. Общий размер дорожек не может превышать 750 МБ.",
        }));
        return;
      }

      const position = getPlaybackPosition();
      if (statusRef.current === "playing") {
        stopSources();
        cancelProgressLoop();
        positionRef.current = position;
        setCurrentTime(position);
        setStatusValue("paused");
      }

      const generation = (replacementGenerationRef.current.get(trackId) ?? 0) + 1;
      replacementGenerationRef.current.set(trackId, generation);
      cancelTrackAssetUpload(trackId);
      updateTrack(trackId, (item) => ({
        ...item,
        isReplacing: true,
        replacementError: null,
      }));

      const context = getAudioContext();

      try {
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) {
          throw new Error("invalid audio duration");
        }

        if (replacementGenerationRef.current.get(trackId) !== generation) {
          return;
        }

        const currentTrack = tracksRef.current.find((item) => item.id === trackId);
        const oldRuntime = trackRuntimesRef.current.get(trackId);
        if (!currentTrack || !oldRuntime) {
          return;
        }

        for (const { source, envelopeGain } of oldRuntime.sources.values()) {
          source.stop();
          source.disconnect();
          envelopeGain.disconnect();
        }
        oldRuntime.outputGain.disconnect();
        const outputGain = context.createGain();
        outputGain.connect(context.destination);
        trackRuntimesRef.current.set(trackId, {
          file,
          buffer,
          sourceType: "upload",
          outputGain,
          sources: new Map(),
        });
        assetVaultRef.current.set(trackId, { file, buffer, sourceType: "upload" });
        const nextTracks = tracksRef.current.map((item) =>
          item.id === trackId
            ? (() => {
                return {
                  ...item,
                  clips: item.clips.map((clip) => {
                    const layout = getStudioClipLayout(clip, buffer.duration);
                    return {
                      ...clip,
                      ...layout,
                      ...clampStudioClipFades(clip, layout.duration),
                    };
                  }),
                  fileName: file.name,
                  fileSize: file.size,
                  assetId: null,
                  assetPersistenceStatus: "pending" as const,
                  isReplacing: false,
                  replacementError: null,
                };
              })()
            : item,
        );
        replaceTracks(nextTracks);
        applyTrackGains();
        if (persistenceProjectId) {
          startTrackAssetUpload(trackId);
        }
        const nextPosition = clampStudioAudioPosition(
          positionRef.current,
          projectDurationRef.current,
        );
        positionRef.current = nextPosition;
        setCurrentTime(nextPosition);
        setStatusValue(
          nextPosition >= projectDurationRef.current ? "ready" : "paused",
        );
      } catch (error) {
        if (replacementGenerationRef.current.get(trackId) !== generation) {
          return;
        }

        updateTrack(trackId, (item) => ({
          ...item,
          isReplacing: false,
          replacementError: `Не удалось заменить аудио. ${formatDecodeError(error)}`,
        }));
      }
    },
    [
      applyTrackGains,
      cancelProgressLoop,
      cancelTrackAssetUpload,
      getAudioContext,
      getPlaybackPosition,
      persistenceProjectId,
      replaceTracks,
      setStatusValue,
      startTrackAssetUpload,
      stopSources,
      updateTrack,
    ],
  );

  const play = useCallback(async () => {
    const context = audioContextRef.current;
    if (!context || tracksRef.current.length === 0) {
      return;
    }

    try {
      const beforePlay = context.state;
      updateAudioDebug((current) => ({
        ...current,
        ...getAudioDebugSnapshot(),
        lastPlayClickAt: new Date().toISOString(),
        stateBeforePlay: beforePlay,
      }));
      if (context.state === "suspended") {
        updateAudioDebug((current) => ({
          ...current,
          lastResumeAttemptAt: new Date().toISOString(),
          lastResumeResult: "pending",
          lastResumeError: null,
        }));
        try {
          await context.resume();
          updateAudioDebug((current) => ({
            ...current,
            ...getAudioDebugSnapshot(),
            lastResumeResult: "resolved",
            stateAfterResume: context.state,
          }));
        } catch (error) {
          updateAudioDebug((current) => ({
            ...current,
            ...getAudioDebugSnapshot(),
            lastResumeResult: "rejected",
            lastResumeError: error instanceof Error ? error.name : "unknown",
            stateAfterResume: context.state,
          }));
          throw error;
        }
      }

      cancelProgressLoop();
      stopSources();
      const restartPosition =
        positionRef.current >= projectDurationRef.current ? 0 : positionRef.current;
      startSourcesAtPosition(restartPosition);
      updateAudioDebug((current) => ({ ...current, ...getAudioDebugSnapshot() }));
    } catch (playError) {
      stopSources();
      cancelProgressLoop();
      setProjectError(formatDecodeError(playError));
      setStatusValue("error");
    }
  }, [
    cancelProgressLoop,
    getAudioDebugSnapshot,
    setStatusValue,
    startSourcesAtPosition,
    stopSources,
    updateAudioDebug,
  ]);

  const pause = useCallback(() => {
    if (statusRef.current !== "playing") {
      return;
    }

    updateVisiblePosition();
    stopSources();
    cancelProgressLoop();
    setStatusValue(
      positionRef.current >= projectDurationRef.current ? "ready" : "paused",
    );
  }, [cancelProgressLoop, setStatusValue, stopSources, updateVisiblePosition]);

  const seek = useCallback(
    (requestedPosition: number) => {
      if (tracksRef.current.length === 0) {
        return;
      }

      const wasPlaying = statusRef.current === "playing";
      const nextPosition = wasPlaying
        ? clampStudioAudioPosition(
            requestedPosition,
            projectDurationRef.current,
          )
        : Number.isFinite(requestedPosition)
          ? Math.max(requestedPosition, 0)
          : 0;

      if (wasPlaying) {
        stopSources();
        cancelProgressLoop();
        if (nextPosition >= projectDurationRef.current) {
          positionRef.current = projectDurationRef.current;
          setCurrentTime(projectDurationRef.current);
          setStatusValue("ready");
        } else {
          startSourcesAtPosition(nextPosition);
        }
      } else {
        positionRef.current = nextPosition;
        setCurrentTime(nextPosition);
        if (nextPosition >= projectDurationRef.current) {
          setStatusValue("ready");
        }
      }
    },
    [cancelProgressLoop, setStatusValue, startSourcesAtPosition, stopSources],
  );

  const seekRelative = useCallback(
    (offset: number) => {
      seek(
        getStudioAudioRelativeSeekPosition(
          getPlaybackPosition(),
          offset,
          projectDurationRef.current,
        ),
      );
    },
    [getPlaybackPosition, seek],
  );

  const setTrackVolume = useCallback(
    (trackId: string, requestedVolume: number) => {
      const volume = Math.min(Math.max(requestedVolume, 0), 1);
      updateTrack(trackId, (track) => ({ ...track, volume }));
    },
    [updateTrack],
  );

  const toggleTrackMuted = useCallback(
    (trackId: string) => {
      updateTrack(trackId, (track) => ({ ...track, muted: !track.muted }));
    },
    [updateTrack],
  );

  const setClipLayout = useCallback(
    (trackId: string, clipId: string, layout: Partial<StudioClipLayout>) => {
      const runtime = trackRuntimesRef.current.get(trackId);
      if (!runtime) {
        return;
      }
      if (statusRef.current === "playing") {
        pause();
      }
      updateTrack(trackId, (track) => {
        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) return clip;
            const nextLayout = getStudioClipLayout(
              {
                startTime: layout.startTime ?? clip.startTime,
                offset: layout.offset ?? clip.offset,
                duration: layout.duration ?? clip.duration,
              },
              runtime.buffer.duration,
            );
            return {
              ...clip,
              ...nextLayout,
              ...clampStudioClipFades(clip, nextLayout.duration),
            };
          }),
        };
      });
      const nextPosition = clampStudioAudioPosition(
        positionRef.current,
        projectDurationRef.current,
      );
      positionRef.current = nextPosition;
      setCurrentTime(nextPosition);
    },
    [pause, updateTrack],
  );

  const setClipFades = useCallback(
    (trackId: string, clipId: string, fades: Partial<StudioClipFades>) => {
      if (!trackRuntimesRef.current.has(trackId)) {
        return;
      }
      if (statusRef.current === "playing") {
        pause();
      }
      updateTrack(trackId, (track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id !== clipId
            ? clip
            : {
                ...clip,
                ...clampStudioClipFades(
                  {
                    fadeInDuration: fades.fadeInDuration ?? clip.fadeInDuration,
                    fadeOutDuration: fades.fadeOutDuration ?? clip.fadeOutDuration,
                  },
                  clip.duration,
                ),
              },
        ),
      }));
    },
    [pause, updateTrack],
  );

  const splitClip = useCallback(
    (trackId: string, clipId: string, atTime: number) => {
      const track = tracksRef.current.find((item) => item.id === trackId);
      const clip = track?.clips.find((item) => item.id === clipId);
      if (!track || !clip) return null;
      const split = splitStudioClip(clip, atTime, crypto.randomUUID());
      if (!split) return null;
      pause();
      updateTrack(trackId, (item) => ({
        ...item,
        clips: item.clips.flatMap((candidate) =>
          candidate.id === clipId ? [split.left, split.right] : [candidate],
        ),
      }));
      return split.right.id;
    },
    [pause, updateTrack],
  );

  const removeClip = useCallback(
    (trackId: string, clipId: string) => {
      pause();
      updateTrack(trackId, (track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.id !== clipId),
      }));
    },
    [pause, updateTrack],
  );

  const rippleDeleteClip = useCallback(
    (trackId: string, clipId: string) => {
      const track = tracksRef.current.find((item) => item.id === trackId);
      const result = track
        ? getStudioRippleDeleteResult(track.clips, clipId)
        : null;
      if (!result) {
        return;
      }

      const position = getPlaybackPosition();
      pause();
      updateTrack(trackId, (item) => ({
        ...item,
        clips: result.clips,
      }));

      const removedEnd = result.removedClip.startTime + result.removedClip.duration;
      const nextPosition =
        position >= removedEnd
          ? position - result.removedClip.duration
          : position > result.removedClip.startTime
            ? result.removedClip.startTime
            : position;
      positionRef.current = nextPosition;
      setCurrentTime(nextPosition);
    },
    [getPlaybackPosition, pause, updateTrack],
  );

  const pasteClips = useCallback(
    (
      trackId: string,
      clipboard: StudioClipClipboard,
      startTime: number,
    ): string[] => {
      const runtime = trackRuntimesRef.current.get(trackId);
      if (
        !runtime ||
        clipboard.sourceTrackId !== trackId ||
        clipboard.clips.length === 0
      ) {
        return [];
      }
      const clips = getStudioPasteClips({
        clipboard,
        targetStartTime: startTime,
        targetBufferDuration: runtime.buffer.duration,
        createClipId: () => crypto.randomUUID(),
      });
      if (clips.length === 0) {
        return [];
      }

      pause();
      updateTrack(trackId, (track) => ({
        ...track,
        clips: [...track.clips, ...clips],
      }));
      return clips.map((clip) => clip.id);
    },
    [pause, updateTrack],
  );

  const getTrackBuffer = useCallback((trackId: string): AudioBuffer | null => {
    return trackRuntimesRef.current.get(trackId)?.buffer ?? null;
  }, []);

  const removeTrack = useCallback(
    (trackId: string) => {
      if (!tracksRef.current.some((track) => track.id === trackId)) {
        return;
      }

      const wasPlaying = statusRef.current === "playing";
      const position = getPlaybackPosition();
      cancelProgressLoop();
      stopSources();
      const runtime = trackRuntimesRef.current.get(trackId);
      cancelTrackAssetUpload(trackId);
      if (runtime) {
        assetVaultRef.current.set(trackId, {
          file: runtime.file,
          buffer: runtime.buffer,
          sourceType: runtime.sourceType,
        });
      }
      runtime?.outputGain.disconnect();
      trackRuntimesRef.current.delete(trackId);
      replaceTracks(tracksRef.current.filter((track) => track.id !== trackId));
      const nextPosition = clampStudioAudioPosition(
        position,
        projectDurationRef.current,
      );
      positionRef.current = nextPosition;
      setCurrentTime(nextPosition);

      if (tracksRef.current.length === 0) {
        setStatusValue("idle");
      } else if (wasPlaying && nextPosition < projectDurationRef.current) {
        startSourcesAtPosition(nextPosition);
      } else {
        setStatusValue(
          nextPosition >= projectDurationRef.current ? "ready" : "paused",
        );
      }
    },
    [
      cancelProgressLoop,
      cancelTrackAssetUpload,
      getPlaybackPosition,
      replaceTracks,
      setStatusValue,
      startSourcesAtPosition,
      stopSources,
    ],
  );

  const exportEditingState = useCallback((): StudioEditingSnapshot => {
    const snapshotTracks: StudioTrackSnapshot[] = tracksRef.current.map(
      (track) => ({
        id: track.id,
        fileName: track.fileName,
        fileSize: track.fileSize,
        assetId: track.assetId,
        assetPersistenceStatus: track.assetPersistenceStatus,
        clips: track.clips,
        volume: track.volume,
        muted: track.muted,
      }),
    );
    return createStudioEditingSnapshot({
      tracks: snapshotTracks,
      slots: [],
      selectedClipId: null,
      position: getPlaybackPosition(),
    });
  }, [getPlaybackPosition]);

  const restoreEditingState = useCallback(
    (
      snapshot: StudioEditingSnapshot,
    ): { missingTrackIds: string[] } => {
      cancelProgressLoop();
      stopSources();
      for (const runtime of trackRuntimesRef.current.values()) {
        runtime.outputGain.disconnect();
      }
      trackRuntimesRef.current.clear();

      const missingTrackIds: string[] = [];
      const restoredTracks: StudioLocalTrack[] = [];
      for (const track of snapshot.tracks) {
        const asset = assetVaultRef.current.get(track.id);
        if (!asset) {
          missingTrackIds.push(track.id);
          continue;
        }
        const runtime = createTrackRuntime(asset);
        trackRuntimesRef.current.set(track.id, runtime);
        restoredTracks.push({
          ...track,
          clips: track.clips.map((clip) => ({ ...clip })),
          status: "ready",
          isReplacing: false,
          replacementError: null,
        });
      }

      replaceTracks(restoredTracks);
      applyTrackGains();
      const position = Number.isFinite(snapshot.position)
        ? Math.max(snapshot.position, 0)
        : 0;
      positionRef.current = position;
      startedAtContextTimeRef.current = 0;
      startedAtPositionRef.current = position;
      setCurrentTime(position);
      setStatusValue(
        restoredTracks.length === 0
          ? "idle"
          : position >= projectDurationRef.current
            ? "ready"
            : "paused",
      );
      return { missingTrackIds };
    },
    [
      applyTrackGains,
      cancelProgressLoop,
      createTrackRuntime,
      replaceTracks,
      setStatusValue,
      stopSources,
    ],
  );

  const pruneRetainedAssets = useCallback(
    (referencedTrackIds: Iterable<string>) => {
      const retained = new Set(referencedTrackIds);
      for (const track of tracksRef.current) {
        retained.add(track.id);
      }
      for (const trackId of assetVaultRef.current.keys()) {
        if (!retained.has(trackId)) {
          assetVaultRef.current.delete(trackId);
        }
      }
    },
    [],
  );

  const restoreTracks = useCallback(
    (
      tracksToRestore: StudioTrackSnapshot[],
      position = positionRef.current,
    ) =>
      restoreEditingState({
        tracks: tracksToRestore,
        slots: [],
        selectedClipId: null,
        position,
      }),
    [restoreEditingState],
  );

  const updateRetainedAssets = pruneRetainedAssets;

  useEffect(() => {
    const uploadControllers = assetUploadControllersRef.current;
    return () => {
      for (const controller of uploadControllers.values()) {
        controller.abort();
      }
      disposeResources();
    };
  }, [disposeResources]);

  const value = useMemo<StudioAudioContextValue>(
    () => ({
      tracks,
      hasPersistenceProject: Boolean(persistenceProjectId),
      persistenceProjectName: persistenceContext.name,
      persistenceProjectRevision: persistenceContext.revision,
      projectDuration,
      status,
      currentTime,
      projectError,
      audioDebugState,
      createMicrophoneAnalyser,
      loadLocalFiles,
      ingestRecordedFile,
      replaceTrackAudio,
      retryTrackAssetUpload,
      decodePersistedAsset,
      hydratePersistedProject,
      play,
      pause,
      seek,
      seekRelative,
      setTrackVolume,
      toggleTrackMuted,
      setClipLayout,
      setClipFades,
      splitClip,
      removeClip,
      rippleDeleteClip,
      pasteClips,
      getTrackBuffer,
      removeTrack,
      exportEditingState,
      restoreEditingState,
      restoreTracks,
      pruneRetainedAssets,
      updateRetainedAssets,
      reset,
    }),
    [
      currentTime,
      createMicrophoneAnalyser,
      decodePersistedAsset,
      getTrackBuffer,
      exportEditingState,
      ingestRecordedFile,
      loadLocalFiles,
      pause,
      play,
      persistenceProjectId,
      persistenceContext,
      projectDuration,
      projectError,
      audioDebugState,
      replaceTrackAudio,
      retryTrackAssetUpload,
      hydratePersistedProject,
      removeTrack,
      reset,
      seek,
      seekRelative,
      setTrackVolume,
      status,
      setClipLayout,
      setClipFades,
      splitClip,
      removeClip,
      rippleDeleteClip,
      pasteClips,
      pruneRetainedAssets,
      restoreEditingState,
      restoreTracks,
      toggleTrackMuted,
      tracks,
      updateRetainedAssets,
    ],
  );

  return (
    <StudioAudioContext.Provider value={value}>
      {children}
    </StudioAudioContext.Provider>
  );
}

export function useStudioAudio(): StudioAudioContextValue {
  const value = useContext(StudioAudioContext);
  if (!value) {
    throw new Error("useStudioAudio must be used within StudioAudioProvider.");
  }

  return value;
}

export const studioAudioLimits = {
  maxLocalFileSizeBytes: MAX_LOCAL_FILE_SIZE_BYTES,
  maxLocalTracks: MAX_LOCAL_TRACKS,
  maxLocalProjectSizeBytes: MAX_LOCAL_PROJECT_SIZE_BYTES,
};
