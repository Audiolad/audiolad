"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getStudioRecorderMimeType,
  getStudioRecordingExtension,
  STUDIO_MICROPHONE_CONSTRAINTS,
  shouldFallbackToBasicMicrophoneRequest,
  validateStudioRecordedFile,
} from "@/lib/studio/recorder";
import { isStudioPersistableRecordingMimeType } from "@/lib/studio/recording-mime";

let activeRecorder: MediaRecorder | null = null;
let isStartingRecorder = false;
let recordingNumber = 0;

type StartStudioRecordingOptions = {
  slotId: string;
  startTime: number;
  onStartTransport: () => Promise<void> | void;
};

type UseStudioRecorderOptions = {
  createMicrophoneAnalyser: (
    stream: MediaStream,
  ) => { analyser: AnalyserNode; disconnect: () => void };
  onRecordedFile: (
    file: File,
    startTime: number,
    slotId: string,
  ) => Promise<void>;
  debugEnabled?: boolean;
};

type StudioRecordingStatus = "idle" | "arming" | "recording" | "processing";
type StudioRecorderDebugAction =
  | "none"
  | "handler-entered"
  | "guard-return-status"
  | "guard-return-missing-recorder"
  | "guard-return-inactive-recorder"
  | "recorder-stop-called"
  | "onstop-fired"
  | "onerror-fired";
type StudioMediaRecorderState = MediaRecorder["state"] | "missing";

export type StudioRecorderDebugState = {
  mediaRecorderState: StudioMediaRecorderState;
  activeStreamTrackCount: number;
  stopClickCount: number;
  lastStopClickAt: string | null;
  lastStopGuardStatus: StudioRecordingStatus | null;
  lastStopRecorderPresent: boolean;
  lastStopMediaRecorderState: StudioMediaRecorderState;
  lastStopAction: StudioRecorderDebugAction;
};

const initialRecorderDebugState: StudioRecorderDebugState = {
  mediaRecorderState: "missing",
  activeStreamTrackCount: 0,
  stopClickCount: 0,
  lastStopClickAt: null,
  lastStopGuardStatus: null,
  lastStopRecorderPresent: false,
  lastStopMediaRecorderState: "missing",
  lastStopAction: "none",
};

export function useStudioRecorder({
  createMicrophoneAnalyser,
  onRecordedFile,
  debugEnabled = false,
}: UseStudioRecorderOptions) {
  const [recordingStatus, setRecordingStatus] =
    useState<StudioRecordingStatus>("idle");
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingSlotId, setRecordingSlotId] = useState<string | null>(null);
  const [recordingAnalyser, setRecordingAnalyser] = useState<AnalyserNode | null>(
    null,
  );
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(
    null,
  );
  const [recorderDebugState, setRecorderDebugState] =
    useState<StudioRecorderDebugState>(initialRecorderDebugState);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const analyserDisconnectRef = useRef<(() => void) | null>(null);
  const discardResultRef = useRef(false);
  const isDisposedRef = useRef(false);
  const recordingStatusRef = useRef<StudioRecordingStatus>("idle");
  const debugEnabledRef = useRef(debugEnabled);

  useEffect(() => {
    debugEnabledRef.current = debugEnabled;
  }, [debugEnabled]);

  const getMediaRecorderState = useCallback(
    (recorder: MediaRecorder | null): StudioMediaRecorderState =>
      recorder?.state ?? "missing",
    [],
  );

  const getActiveStreamTrackCount = useCallback(
    () =>
      streamRef.current?.getTracks().filter((track) => track.readyState === "live")
        .length ?? 0,
    [],
  );

  const updateRecorderDebug = useCallback(
    (update: (current: StudioRecorderDebugState) => StudioRecorderDebugState) => {
      if (!debugEnabledRef.current) return;
      setRecorderDebugState(update);
    },
    [],
  );

  const recordSidebarStopClick = useCallback(() => {
    updateRecorderDebug((current) => ({
      ...current,
      stopClickCount: current.stopClickCount + 1,
      lastStopClickAt: new Date().toISOString(),
    }));
  }, [updateRecorderDebug]);

  const setRecorderStatus = useCallback((nextStatus: StudioRecordingStatus) => {
    recordingStatusRef.current = nextStatus;
    setRecordingStatus(nextStatus);
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const releaseAnalyser = useCallback(() => {
    analyserDisconnectRef.current?.();
    analyserDisconnectRef.current = null;
    setRecordingAnalyser(null);
    setRecordingStartTime(null);
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    const guardStatus = recordingStatusRef.current;
    const recorderPresent = Boolean(recorder);
    const mediaRecorderState = getMediaRecorderState(recorder);
    const debugSnapshot = {
      lastStopGuardStatus: guardStatus,
      lastStopRecorderPresent: recorderPresent,
      lastStopMediaRecorderState: mediaRecorderState,
      mediaRecorderState,
      activeStreamTrackCount: getActiveStreamTrackCount(),
    };
    updateRecorderDebug((current) => ({
      ...current,
      ...debugSnapshot,
      lastStopAction: "handler-entered",
    }));
    if (guardStatus !== "recording") {
      updateRecorderDebug((current) => ({
        ...current,
        ...debugSnapshot,
        lastStopAction: "guard-return-status",
      }));
      return;
    }
    if (!recorder) {
      updateRecorderDebug((current) => ({
        ...current,
        ...debugSnapshot,
        lastStopAction: "guard-return-missing-recorder",
      }));
      return;
    }
    if (recorder.state === "inactive") {
      updateRecorderDebug((current) => ({
        ...current,
        ...debugSnapshot,
        lastStopAction: "guard-return-inactive-recorder",
      }));
      return;
    }
    updateRecorderDebug((current) => ({
      ...current,
      ...debugSnapshot,
      lastStopAction: "recorder-stop-called",
    }));
    setRecorderStatus("processing");
    recorder.stop();
  }, [
    getActiveStreamTrackCount,
    getMediaRecorderState,
    setRecorderStatus,
    updateRecorderDebug,
  ]);

  const startRecording = useCallback(
    async ({ slotId, startTime, onStartTransport }: StartStudioRecordingOptions) => {
      if (
        activeRecorder ||
        isStartingRecorder ||
        recordingStatusRef.current !== "idle"
      ) {
        setRecordingError("Запись уже выполняется в другой дорожке.");
        return;
      }
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        setRecordingError("Запись с микрофона не поддерживается этим браузером.");
        return;
      }
      const requestedMimeType = getStudioRecorderMimeType();
      if (!requestedMimeType) {
        setRecordingError("Запись с микрофона не поддерживается этим браузером.");
        return;
      }

      setRecordingError(null);
      discardResultRef.current = false;
      isStartingRecorder = true;
      setRecorderStatus("arming");
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: STUDIO_MICROPHONE_CONSTRAINTS,
          });
        } catch (error) {
          if (!shouldFallbackToBasicMicrophoneRequest(error)) {
            throw error;
          }
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        if (isDisposedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          isStartingRecorder = false;
          setRecorderStatus("idle");
          return;
        }
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream, { mimeType: requestedMimeType });
        if (!isStudioPersistableRecordingMimeType(recorder.mimeType)) {
          throw new DOMException(
            "Unsupported MediaRecorder MIME type",
            "NotSupportedError",
          );
        }
        const chunks: BlobPart[] = [];
        recorderRef.current = recorder;
        activeRecorder = recorder;
        isStartingRecorder = false;
        startTimeRef.current = startTime;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onerror = () => {
          updateRecorderDebug((current) => ({
            ...current,
            mediaRecorderState: getMediaRecorderState(recorder),
            activeStreamTrackCount: getActiveStreamTrackCount(),
            lastStopAction: "onerror-fired",
          }));
          setRecordingError("Не удалось записать звук с микрофона.");
          discardResultRef.current = true;
          stopElapsedTimer();
          releaseAnalyser();
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        };
        recorder.onstop = () => {
          updateRecorderDebug((current) => ({
            ...current,
            mediaRecorderState: getMediaRecorderState(recorder),
            activeStreamTrackCount: getActiveStreamTrackCount(),
            lastStopAction: "onstop-fired",
          }));
          activeRecorder = activeRecorder === recorder ? null : activeRecorder;
          recorderRef.current = null;
          stopElapsedTimer();
          releaseAnalyser();
          releaseStream();
          updateRecorderDebug((current) => ({
            ...current,
            mediaRecorderState: getMediaRecorderState(recorder),
            activeStreamTrackCount: getActiveStreamTrackCount(),
          }));
          if (discardResultRef.current) {
            setRecorderStatus("idle");
            setRecordingSlotId(null);
            return;
          }

          const fileType = recorder.mimeType;
          const file = new File(
            chunks,
            `Запись ${++recordingNumber}.${getStudioRecordingExtension(fileType)}`,
            { type: fileType },
          );
          const validationError = validateStudioRecordedFile(file);
          if (validationError) {
            setRecordingError(validationError);
            setRecorderStatus("idle");
            setRecordingSlotId(null);
            return;
          }
          void onRecordedFile(file, startTimeRef.current, slotId)
            .catch(() => {
              setRecordingError("Не удалось добавить запись в проект.");
            })
            .finally(() => {
              setRecorderStatus("idle");
              setRecordingSlotId(null);
            });
        };

        await onStartTransport();
        const startedAt = performance.now();
        const updateElapsed = () => {
          setRecordingElapsed((performance.now() - startedAt) / 1000);
        };
        setRecordingElapsed(0);
        const microphoneAnalysis = createMicrophoneAnalyser(stream);
        analyserDisconnectRef.current = microphoneAnalysis.disconnect;
        recorder.start();
        setRecordingSlotId(slotId);
        setRecordingAnalyser(microphoneAnalysis.analyser);
        setRecordingStartTime(startTime);
        elapsedTimerRef.current = window.setInterval(updateElapsed, 250);
        setRecorderStatus("recording");
        updateRecorderDebug((current) => ({
          ...current,
          mediaRecorderState: getMediaRecorderState(recorder),
          activeStreamTrackCount: getActiveStreamTrackCount(),
        }));
      } catch (error) {
        stopElapsedTimer();
        releaseAnalyser();
        releaseStream();
        recorderRef.current = null;
        activeRecorder = null;
        isStartingRecorder = false;
        setRecordingSlotId(null);
        setRecorderStatus("idle");
        const name = error instanceof DOMException ? error.name : "";
        setRecordingError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Нет доступа к микрофону. Разрешите его использование в браузере."
            : name === "NotFoundError"
              ? "Микрофон не найден или недоступен."
              : "Не удалось включить микрофон для записи.",
        );
      }
    },
    [
      createMicrophoneAnalyser,
      onRecordedFile,
      releaseAnalyser,
      releaseStream,
      setRecorderStatus,
      stopElapsedTimer,
      getActiveStreamTrackCount,
      getMediaRecorderState,
      updateRecorderDebug,
    ],
  );

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      discardResultRef.current = true;
      stopElapsedTimer();
      releaseAnalyser();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      releaseStream();
      if (activeRecorder === recorder) {
        activeRecorder = null;
      }
      isStartingRecorder = false;
      recordingStatusRef.current = "idle";
    };
  }, [releaseAnalyser, releaseStream, stopElapsedTimer]);

  return {
    recordingStatus,
    isArmingRecording: recordingStatus === "arming",
    isRecording: recordingStatus === "recording",
    isProcessingRecording: recordingStatus === "processing",
    recordingElapsed,
    recordingError,
    recordingSlotId,
    recordingAnalyser,
    recordingStartTime,
    recorderDebugState,
    recordSidebarStopClick,
    startRecording,
    stopRecording,
  };
}
