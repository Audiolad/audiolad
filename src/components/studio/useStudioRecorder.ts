"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getStudioRecorderMimeType,
  getStudioRecordingExtension,
  STUDIO_MICROPHONE_CONSTRAINTS,
  shouldFallbackToBasicMicrophoneRequest,
  validateStudioRecordedFile,
} from "@/lib/studio/recorder";

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
};

export function useStudioRecorder({
  createMicrophoneAnalyser,
  onRecordedFile,
}: UseStudioRecorderOptions) {
  const [recordingStatus, setRecordingStatus] = useState<
    "idle" | "recording" | "processing"
  >("idle");
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingSlotId, setRecordingSlotId] = useState<string | null>(null);
  const [recordingAnalyser, setRecordingAnalyser] = useState<AnalyserNode | null>(
    null,
  );
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(
    null,
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const analyserDisconnectRef = useRef<(() => void) | null>(null);
  const discardResultRef = useRef(false);
  const isDisposedRef = useRef(false);

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
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    setRecordingStatus("processing");
    recorder.stop();
  }, []);

  const startRecording = useCallback(
    async ({ slotId, startTime, onStartTransport }: StartStudioRecordingOptions) => {
      if (activeRecorder || isStartingRecorder || recordingStatus !== "idle") {
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

      setRecordingError(null);
      discardResultRef.current = false;
      isStartingRecorder = true;
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
          return;
        }
        streamRef.current = stream;
        const mimeType = getStudioRecorderMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        const chunks: BlobPart[] = [];
        recorderRef.current = recorder;
        activeRecorder = recorder;
        isStartingRecorder = false;
        startTimeRef.current = startTime;
        setRecordingSlotId(slotId);

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onerror = () => {
          setRecordingError("Не удалось записать звук с микрофона.");
          discardResultRef.current = true;
          stopElapsedTimer();
          releaseAnalyser();
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        };
        recorder.onstop = () => {
          activeRecorder = activeRecorder === recorder ? null : activeRecorder;
          recorderRef.current = null;
          stopElapsedTimer();
          releaseAnalyser();
          releaseStream();
          if (discardResultRef.current) {
            setRecordingStatus("idle");
            setRecordingSlotId(null);
            return;
          }

          const fileType = recorder.mimeType || mimeType || "audio/webm";
          const file = new File(
            chunks,
            `Запись ${++recordingNumber}.${getStudioRecordingExtension(fileType)}`,
            { type: fileType },
          );
          const validationError = validateStudioRecordedFile(file);
          if (validationError) {
            setRecordingError(validationError);
            setRecordingStatus("idle");
            setRecordingSlotId(null);
            return;
          }
          void onRecordedFile(file, startTimeRef.current, slotId)
            .catch(() => {
              setRecordingError("Не удалось добавить запись в проект.");
            })
            .finally(() => {
              setRecordingStatus("idle");
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
        setRecordingAnalyser(microphoneAnalysis.analyser);
        setRecordingStartTime(startTime);
        recorder.start();
        elapsedTimerRef.current = window.setInterval(updateElapsed, 250);
        setRecordingStatus("recording");
      } catch (error) {
        stopElapsedTimer();
        releaseAnalyser();
        releaseStream();
        recorderRef.current = null;
        activeRecorder = null;
        isStartingRecorder = false;
        setRecordingSlotId(null);
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
      recordingStatus,
      releaseAnalyser,
      releaseStream,
      stopElapsedTimer,
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
    };
  }, [releaseAnalyser, releaseStream, stopElapsedTimer]);

  return {
    isRecording: recordingStatus === "recording",
    isProcessingRecording: recordingStatus === "processing",
    recordingElapsed,
    recordingError,
    recordingSlotId,
    recordingAnalyser,
    recordingStartTime,
    startRecording,
    stopRecording,
  };
}
