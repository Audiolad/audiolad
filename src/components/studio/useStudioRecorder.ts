"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getStudioRecorderMimeType,
  getStudioRecordingExtension,
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
  onRecordedFile: (
    file: File,
    startTime: number,
    slotId: string,
  ) => Promise<void>;
};

export function useStudioRecorder({
  onRecordedFile,
}: UseStudioRecorderOptions) {
  const [recordingStatus, setRecordingStatus] = useState<
    "idle" | "recording" | "processing"
  >("idle");
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingSlotId, setRecordingSlotId] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef(0);
  const elapsedFrameRef = useRef<number | null>(null);
  const discardResultRef = useRef(false);
  const isDisposedRef = useRef(false);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedFrameRef.current !== null) {
      window.cancelAnimationFrame(elapsedFrameRef.current);
      elapsedFrameRef.current = null;
    }
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        };
        recorder.onstop = () => {
          activeRecorder = activeRecorder === recorder ? null : activeRecorder;
          recorderRef.current = null;
          stopElapsedTimer();
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
          elapsedFrameRef.current = window.requestAnimationFrame(updateElapsed);
        };
        setRecordingElapsed(0);
        elapsedFrameRef.current = window.requestAnimationFrame(updateElapsed);
        recorder.start();
        setRecordingStatus("recording");
      } catch (error) {
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
    [onRecordedFile, recordingStatus, releaseStream, stopElapsedTimer],
  );

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      discardResultRef.current = true;
      stopElapsedTimer();
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
  }, [releaseStream, stopElapsedTimer]);

  return {
    isRecording: recordingStatus === "recording",
    isProcessingRecording: recordingStatus === "processing",
    recordingElapsed,
    recordingError,
    recordingSlotId,
    startRecording,
    stopRecording,
  };
}
