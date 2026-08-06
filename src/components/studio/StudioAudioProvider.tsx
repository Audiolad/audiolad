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
} from "@/lib/studio/audio-engine-math";
import { requestPlatformAudioStopFromStudio } from "@/lib/audio/studio-audio-coordination";

const MAX_LOCAL_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const SUPPORTED_FILE_EXTENSIONS = /\.(mp3|wav|m4a|aac)$/i;

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
  duration: number;
  volume: number;
};

type StudioAudioContextValue = {
  track: StudioLocalTrack | null;
  status: StudioAudioStatus;
  currentTime: number;
  duration: number;
  error: string | null;
  loadLocalFile: (file: File) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (position: number) => void;
  setTrackVolume: (volume: number) => void;
  removeTrack: () => void;
  reset: () => void;
};

const StudioAudioContext = createContext<StudioAudioContextValue | null>(null);

export function validateStudioLocalFile(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  const hasAudioMimeType = file.type.startsWith("audio/");
  const hasSupportedExtension = SUPPORTED_FILE_EXTENSIONS.test(file.name);

  if (!hasAudioMimeType && !hasSupportedExtension) {
    return "Выберите аудиофайл MP3, WAV, M4A или AAC.";
  }

  if (file.size === 0) {
    return "Выбранный файл пуст.";
  }

  if (file.size > MAX_LOCAL_FILE_SIZE_BYTES) {
    return "Размер файла превышает временный лимит Studio — 200 МБ.";
  }

  return null;
}

function formatDecodeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return `Не удалось декодировать аудио: ${error.message}`;
  }

  return "Не удалось декодировать аудио в этом браузере.";
}

export function StudioAudioProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<StudioLocalTrack | null>(null);
  const [status, setStatus] = useState<StudioAudioStatus>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const positionRef = useRef(0);
  const startedAtContextTimeRef = useRef(0);
  const startedAtPositionRef = useRef(0);
  const durationRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const loadGenerationRef = useRef(0);
  const cleanupRef = useRef<() => void>(() => {});

  const cancelProgressLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const detachSource = useCallback(() => {
    const source = sourceRef.current;
    sourceRef.current = null;

    if (!source) {
      return;
    }

    source.onended = null;
    try {
      source.stop();
    } catch {
      // Stopping an already-ended source is harmless.
    }
    source.disconnect();
  }, []);

  const getPlaybackPosition = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || !sourceRef.current) {
      return positionRef.current;
    }

    return getStudioAudioPlaybackPosition({
      startedAtContextTime: startedAtContextTimeRef.current,
      startedAtPosition: startedAtPositionRef.current,
      contextTime: context.currentTime,
      duration: durationRef.current,
    });
  }, []);

  const updateVisiblePosition = useCallback(() => {
    const nextPosition = getPlaybackPosition();
    positionRef.current = nextPosition;
    setCurrentTime(nextPosition);
    return nextPosition;
  }, [getPlaybackPosition]);

  const startProgressLoop = useCallback(() => {
    cancelProgressLoop();

    const tick = () => {
      if (!sourceRef.current) {
        animationFrameRef.current = null;
        return;
      }

      updateVisiblePosition();
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
  }, [cancelProgressLoop, updateVisiblePosition]);

  const clearTrackResources = useCallback(
    (closeContext: boolean) => {
      cancelProgressLoop();
      detachSource();

      gainRef.current?.disconnect();
      gainRef.current = null;
      audioBufferRef.current = null;
      positionRef.current = 0;
      startedAtContextTimeRef.current = 0;
      startedAtPositionRef.current = 0;
      durationRef.current = 0;

      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (closeContext && context && context.state !== "closed") {
        void context.close().catch(() => {
          // Closing can be rejected by a browser during page teardown.
        });
      }
    },
    [cancelProgressLoop, detachSource],
  );

  const reset = useCallback(() => {
    loadGenerationRef.current += 1;
    clearTrackResources(true);
    setTrack(null);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    setStatus("idle");
  }, [clearTrackResources]);

  useEffect(() => {
    cleanupRef.current = reset;
  }, [reset]);

  const createSourceAtPosition = useCallback(
    (requestedPosition: number) => {
      const context = audioContextRef.current;
      const buffer = audioBufferRef.current;
      const gain = gainRef.current;

      if (!context || !buffer || !gain) {
        throw new Error("Локальная дорожка не готова к воспроизведению.");
      }

      const position = clampStudioAudioPosition(
        requestedPosition,
        buffer.duration,
      );
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      sourceRef.current = source;
      startedAtContextTimeRef.current = context.currentTime;
      startedAtPositionRef.current = position;
      positionRef.current = position;
      setCurrentTime(position);

      source.onended = () => {
        if (sourceRef.current !== source) {
          return;
        }

        sourceRef.current = null;
        cancelProgressLoop();
        positionRef.current = buffer.duration;
        setCurrentTime(buffer.duration);
        setStatus("ready");
        source.disconnect();
      };

      source.start(0, position);
      startProgressLoop();
    },
    [cancelProgressLoop, startProgressLoop],
  );

  const loadLocalFile = useCallback(
    async (file: File) => {
      const validationError = validateStudioLocalFile(file);
      if (validationError) {
        reset();
        setError(validationError);
        setStatus("error");
        return;
      }

      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      clearTrackResources(true);
      setTrack(null);
      setCurrentTime(0);
      setDuration(0);
      setError(null);
      setStatus("loading");

      let context: AudioContext | null = null;
      try {
        const arrayBuffer = await file.arrayBuffer();
        context = new AudioContext();
        const decoded = await context.decodeAudioData(arrayBuffer);

        if (generation !== loadGenerationRef.current) {
          void context.close();
          return;
        }

        if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) {
          void context.close();
          throw new Error("Длительность аудио некорректна.");
        }

        const gain = context.createGain();
        gain.gain.value = 1;
        gain.connect(context.destination);

        audioContextRef.current = context;
        audioBufferRef.current = decoded;
        gainRef.current = gain;
        durationRef.current = decoded.duration;
        setTrack({
          id: `${file.name}:${file.size}:${file.lastModified}`,
          fileName: file.name,
          fileSize: file.size,
          duration: decoded.duration,
          volume: 1,
        });
        setDuration(decoded.duration);
        setStatus("ready");
      } catch (decodeError) {
        if (generation !== loadGenerationRef.current) {
          return;
        }

        if (context && context.state !== "closed") {
          void context.close().catch(() => {
            // Decode failures can happen before the context becomes active.
          });
        }
        clearTrackResources(true);
        setError(formatDecodeError(decodeError));
        setStatus("error");
      }
    },
    [clearTrackResources, reset],
  );

  const play = useCallback(async () => {
    const context = audioContextRef.current;
    const buffer = audioBufferRef.current;
    if (!context || !buffer) {
      return;
    }

    try {
      if (context.state === "suspended") {
        await context.resume();
      }

      detachSource();
      const restartPosition =
        positionRef.current >= buffer.duration ? 0 : positionRef.current;
      createSourceAtPosition(restartPosition);
      setStatus("playing");
    } catch (playError) {
      detachSource();
      cancelProgressLoop();
      setError(formatDecodeError(playError));
      setStatus("error");
    }
  }, [cancelProgressLoop, createSourceAtPosition, detachSource]);

  const pause = useCallback(() => {
    if (!sourceRef.current) {
      return;
    }

    updateVisiblePosition();
    detachSource();
    cancelProgressLoop();
    setStatus("paused");
  }, [cancelProgressLoop, detachSource, updateVisiblePosition]);

  const seek = useCallback(
    (requestedPosition: number) => {
      if (!audioBufferRef.current) {
        return;
      }

      const nextPosition = clampStudioAudioPosition(
        requestedPosition,
        durationRef.current,
      );
      const wasPlaying = Boolean(sourceRef.current);

      if (wasPlaying) {
        detachSource();
        cancelProgressLoop();
        createSourceAtPosition(nextPosition);
      } else {
        positionRef.current = nextPosition;
        setCurrentTime(nextPosition);
      }
    },
    [cancelProgressLoop, createSourceAtPosition, detachSource],
  );

  const setTrackVolume = useCallback((requestedVolume: number) => {
    const volume = Math.min(Math.max(requestedVolume, 0), 1);
    if (gainRef.current) {
      gainRef.current.gain.value = volume;
    }
    setTrack((currentTrack) =>
      currentTrack ? { ...currentTrack, volume } : null,
    );
  }, []);

  useEffect(() => {
    requestPlatformAudioStopFromStudio();
  }, []);

  useEffect(() => {
    return () => {
      cleanupRef.current();
    };
  }, []);

  const value = useMemo<StudioAudioContextValue>(
    () => ({
      track,
      status,
      currentTime,
      duration,
      error,
      loadLocalFile,
      play,
      pause,
      seek,
      setTrackVolume,
      removeTrack: reset,
      reset,
    }),
    [
      currentTime,
      duration,
      error,
      loadLocalFile,
      pause,
      play,
      reset,
      seek,
      setTrackVolume,
      status,
      track,
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
};
