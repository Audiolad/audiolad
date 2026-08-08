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
  getStudioProjectDuration,
  getStudioReplacementProjectSize,
  getStudioTrackGain,
} from "@/lib/studio/audio-engine-math";
import {
  getStudioClipLayout,
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

const MAX_LOCAL_TRACKS = 5;
const MAX_LOCAL_PROJECT_SIZE_BYTES = 750 * 1024 * 1024;

export type StudioAudioStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "error";

export type StudioLocalTrack = {
  id: string;
  fileName: string;
  fileSize: number;
  startTime: number;
  offset: number;
  duration: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  volume: number;
  muted: boolean;
  status: "loading" | "ready" | "error";
  isReplacing: boolean;
  replacementError: string | null;
};

type StudioAudioContextValue = {
  tracks: StudioLocalTrack[];
  projectDuration: number;
  status: StudioAudioStatus;
  currentTime: number;
  projectError: string | null;
  createMicrophoneAnalyser: (
    stream: MediaStream,
  ) => { analyser: AnalyserNode; disconnect: () => void };
  loadLocalFiles: (files: Iterable<File>) => Promise<StudioLocalTrack[]>;
  ingestRecordedFile: (
    file: File,
    options: { startTime: number },
  ) => Promise<StudioLocalTrack | null>;
  replaceTrackAudio: (trackId: string, file: File) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (position: number) => void;
  seekRelative: (offset: number) => void;
  removeTrack: (trackId: string) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  toggleTrackMuted: (trackId: string) => void;
  setClipLayout: (
    trackId: string,
    layout: Partial<StudioClipLayout>,
  ) => void;
  setClipFades: (trackId: string, fades: Partial<StudioClipFades>) => void;
  getTrackBuffer: (trackId: string) => AudioBuffer | null;
  reset: () => void;
};

const StudioAudioContext = createContext<StudioAudioContextValue | null>(null);

type TrackRuntime = {
  file: File;
  buffer: AudioBuffer;
  gain: GainNode;
  outputGain: GainNode;
  source: AudioBufferSourceNode | null;
};

export { validateStudioLocalFile };

function formatDecodeError(error: unknown): string {
  void error;
  return "Браузеру не удалось открыть выбранное аудио.";
}

function getTrackId(file: File, index: number): string {
  return `${file.name}:${file.size}:${file.lastModified}:${index}:${crypto.randomUUID()}`;
}

export function StudioAudioProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<StudioLocalTrack[]>([]);
  const [status, setStatus] = useState<StudioAudioStatus>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [projectDuration, setProjectDuration] = useState(0);
  const [projectError, setProjectError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const trackRuntimesRef = useRef(new Map<string, TrackRuntime>());
  const tracksRef = useRef<StudioLocalTrack[]>([]);
  const positionRef = useRef(0);
  const startedAtContextTimeRef = useRef(0);
  const startedAtPositionRef = useRef(0);
  const projectDurationRef = useRef(0);
  const statusRef = useRef<StudioAudioStatus>("idle");
  const animationFrameRef = useRef<number | null>(null);
  const loadGenerationRef = useRef(0);
  const replacementGenerationRef = useRef(new Map<string, number>());

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
    projectDurationRef.current = getStudioProjectDuration(nextTracks);
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
      const source = runtime.source;
      runtime.source = null;
      if (!source) {
        continue;
      }

      source.onended = null;
      try {
        source.stop();
      } catch {
        // A source may already have reached its end.
      }
      source.disconnect();
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
        if (!runtime || position >= track.startTime + track.duration) {
          continue;
        }

        const elapsedClipTime = Math.max(position - track.startTime, 0);
        const remaining = track.duration - elapsedClipTime;
        if (remaining <= 0) {
          continue;
        }
        const source = context.createBufferSource();
        source.buffer = runtime.buffer;
        source.connect(runtime.gain);
        const sourceStartAt = startAt + Math.max(track.startTime - position, 0);
        const fades = clampStudioClipFades(track, track.duration);
        const fadeGain = runtime.gain.gain;
        fadeGain.cancelScheduledValues(sourceStartAt);
        fadeGain.setValueAtTime(
          getStudioFadeEnvelope(elapsedClipTime, track.duration, fades),
          sourceStartAt,
        );
        if (
          fades.fadeInDuration > elapsedClipTime &&
          fades.fadeInDuration < track.duration
        ) {
          fadeGain.linearRampToValueAtTime(
            1,
            sourceStartAt + (fades.fadeInDuration - elapsedClipTime),
          );
        }
        const fadeOutStart = track.duration - fades.fadeOutDuration;
        if (fadeOutStart > elapsedClipTime) {
          fadeGain.setValueAtTime(
            1,
            sourceStartAt + (fadeOutStart - elapsedClipTime),
          );
        }
        if (fades.fadeOutDuration > 0) {
          fadeGain.linearRampToValueAtTime(
            0,
            sourceStartAt + (track.duration - elapsedClipTime),
          );
        }
        runtime.source = source;
        source.onended = () => {
          if (runtime.source === source) {
            runtime.source = null;
          }
          source.disconnect();
        };
        source.start(
          startAt + Math.max(track.startTime - position, 0),
          track.offset + elapsedClipTime,
          remaining,
        );
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
      runtime.gain.disconnect();
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

  const reset = useCallback(() => {
    loadGenerationRef.current += 1;
    disposeResources();
    replaceTracks([]);
    positionRef.current = 0;
    startedAtContextTimeRef.current = 0;
    startedAtPositionRef.current = 0;
    setCurrentTime(0);
    setProjectError(null);
    setStatusValue("idle");
  }, [disposeResources, replaceTracks, setStatusValue]);

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
          const gain = context.createGain();
          gain.gain.value = 1;
          const outputGain = context.createGain();
          outputGain.gain.value = 1;
          gain.connect(outputGain);
          outputGain.connect(context.destination);
          trackRuntimesRef.current.set(id, {
            file,
            buffer,
            gain,
            outputGain,
            source: null,
          });
          const createdTrack: StudioLocalTrack = {
            id,
            fileName: file.name,
            fileSize: file.size,
            startTime: 0,
            offset: 0,
            duration: buffer.duration,
            fadeInDuration: 0,
            fadeOutDuration: 0,
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
      replaceTracks,
      setStatusValue,
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
        const gain = context.createGain();
        gain.gain.value = 1;
        const outputGain = context.createGain();
        outputGain.gain.value = 1;
        gain.connect(outputGain);
        outputGain.connect(context.destination);
        const track: StudioLocalTrack = {
          id: getTrackId(file, tracksRef.current.length),
          fileName: file.name,
          fileSize: file.size,
          startTime: Number.isFinite(startTime) && startTime >= 0 ? startTime : 0,
          offset: 0,
          duration: buffer.duration,
          fadeInDuration: 0,
          fadeOutDuration: 0,
          volume: 1,
          muted: false,
          status: "ready",
          isReplacing: false,
          replacementError: null,
        };
        trackRuntimesRef.current.set(track.id, {
          file,
          buffer,
          gain,
          outputGain,
          source: null,
        });
        replaceTracks([...tracksRef.current, track]);
        applyTrackGains();
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
    [applyTrackGains, getAudioContext, replaceTracks, setStatusValue],
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

        oldRuntime.source?.stop();
        oldRuntime.source?.disconnect();
        oldRuntime.gain.disconnect();
        oldRuntime.outputGain.disconnect();
        const gain = context.createGain();
        const outputGain = context.createGain();
        gain.connect(outputGain);
        outputGain.connect(context.destination);
        trackRuntimesRef.current.set(trackId, {
          file,
          buffer,
          gain,
          outputGain,
          source: null,
        });
        const nextTracks = tracksRef.current.map((item) =>
          item.id === trackId
            ? (() => {
                const layout = getStudioClipLayout(item, buffer.duration);
                return {
                  ...item,
                  ...layout,
                  ...clampStudioClipFades(item, layout.duration),
                  fileName: file.name,
                  fileSize: file.size,
                  isReplacing: false,
                  replacementError: null,
                };
              })()
            : item,
        );
        replaceTracks(nextTracks);
        applyTrackGains();
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
      getAudioContext,
      getPlaybackPosition,
      replaceTracks,
      setStatusValue,
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
      if (context.state === "suspended") {
        await context.resume();
      }

      cancelProgressLoop();
      stopSources();
      const restartPosition =
        positionRef.current >= projectDurationRef.current ? 0 : positionRef.current;
      startSourcesAtPosition(restartPosition);
    } catch (playError) {
      stopSources();
      cancelProgressLoop();
      setProjectError(formatDecodeError(playError));
      setStatusValue("error");
    }
  }, [cancelProgressLoop, setStatusValue, startSourcesAtPosition, stopSources]);

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

      const nextPosition = clampStudioAudioPosition(
        requestedPosition,
        projectDurationRef.current,
      );
      const wasPlaying = statusRef.current === "playing";

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
    (trackId: string, layout: Partial<StudioClipLayout>) => {
      const runtime = trackRuntimesRef.current.get(trackId);
      if (!runtime) {
        return;
      }
      if (statusRef.current === "playing") {
        pause();
      }
      updateTrack(trackId, (track) => {
        const nextLayout = getStudioClipLayout(
          {
            startTime: layout.startTime ?? track.startTime,
            offset: layout.offset ?? track.offset,
            duration: layout.duration ?? track.duration,
          },
          runtime.buffer.duration,
        );
        return {
          ...track,
          ...nextLayout,
          ...clampStudioClipFades(track, nextLayout.duration),
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
    (trackId: string, fades: Partial<StudioClipFades>) => {
      if (!trackRuntimesRef.current.has(trackId)) {
        return;
      }
      if (statusRef.current === "playing") {
        pause();
      }
      updateTrack(trackId, (track) => ({
        ...track,
        ...clampStudioClipFades(
          {
            fadeInDuration: fades.fadeInDuration ?? track.fadeInDuration,
            fadeOutDuration: fades.fadeOutDuration ?? track.fadeOutDuration,
          },
          track.duration,
        ),
      }));
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
      runtime?.gain.disconnect();
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
      getPlaybackPosition,
      replaceTracks,
      setStatusValue,
      startSourcesAtPosition,
      stopSources,
    ],
  );

  useEffect(() => {
    return () => {
      disposeResources();
    };
  }, [disposeResources]);

  const value = useMemo<StudioAudioContextValue>(
    () => ({
      tracks,
      projectDuration,
      status,
      currentTime,
      projectError,
      createMicrophoneAnalyser,
      loadLocalFiles,
      ingestRecordedFile,
      replaceTrackAudio,
      play,
      pause,
      seek,
      seekRelative,
      setTrackVolume,
      toggleTrackMuted,
      setClipLayout,
      setClipFades,
      getTrackBuffer,
      removeTrack,
      reset,
    }),
    [
      currentTime,
      createMicrophoneAnalyser,
      getTrackBuffer,
      ingestRecordedFile,
      loadLocalFiles,
      pause,
      play,
      projectDuration,
      projectError,
      replaceTrackAudio,
      removeTrack,
      reset,
      seek,
      seekRelative,
      setTrackVolume,
      status,
      setClipLayout,
      setClipFades,
      toggleTrackMuted,
      tracks,
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
