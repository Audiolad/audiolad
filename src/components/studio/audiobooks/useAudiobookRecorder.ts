"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AUDIOBOOK_MICROPHONE_CONSTRAINTS,
  AUDIOBOOK_RECORDER_AUTO_STOP_MARGIN_MS,
  AUDIOBOOK_RECORDER_AUTO_STOP_MS,
  getAudiobookRecorderMimeType,
  getAudiobookRecordingExtension,
  shouldFallbackToBasicAudiobookMicrophoneRequest,
  validateAudiobookRecordedBlob,
} from "@/lib/audiobooks/recorder";
import {
  deleteAudiobookRecordingDraft,
  listAudiobookRecordingDrafts,
  saveAudiobookRecordingDraft,
  type AudiobookRecordingDraft,
} from "@/lib/audiobooks/recorder-store";
import { syncPendingAudiobookRecordingDrafts } from "@/lib/audiobooks/recorder-sync";
import type { AudiobookFragment } from "@/lib/audiobooks/server";

type RecorderStatus = "idle" | "arming" | "recording" | "stopping" | "saving";

export function useAudiobookRecorder({
  authorId,
  projectId,
  chapterId,
  onSynced,
}: {
  authorId: string;
  projectId: string;
  chapterId: string;
  onSynced: (fragment: AudiobookFragment) => void;
}) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  const [drafts, setDrafts] = useState<AudiobookRecordingDraft[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const disposedRef = useRef(false);
  const statusRef = useRef<RecorderStatus>("idle");
  const setRecorderStatus = useCallback((next: RecorderStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const stopTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
  }, []);
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);
  const sync = useCallback(async () => {
    setPendingDraftCount((count) => count + 1);
    try {
      await syncPendingAudiobookRecordingDrafts(projectId, onSynced);
    } finally {
      setPendingDraftCount(0);
      setDrafts(await listAudiobookRecordingDrafts(projectId));
    }
  }, [onSynced, projectId]);
  const discardDraft = useCallback(async (draftId: string) => {
    await deleteAudiobookRecordingDraft(draftId);
    setDrafts(await listAudiobookRecordingDrafts(projectId));
  }, [projectId]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (statusRef.current !== "recording" || !recorder || recorder.state === "inactive") return;
    setRecorderStatus("stopping");
    stopTimers();
    recorder.stop();
  }, [setRecorderStatus, stopTimers]);

  const startRecording = useCallback(async () => {
    if (statusRef.current !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Запись с микрофона не поддерживается этим браузером.");
      return;
    }
    const requestedMimeType = getAudiobookRecorderMimeType();
    if (!requestedMimeType) {
      setError("Запись с микрофона не поддерживается этим браузером.");
      return;
    }
    setError(null);
    setRecorderStatus("arming");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIOBOOK_MICROPHONE_CONSTRAINTS });
      } catch (requestError) {
        if (!shouldFallbackToBasicAudiobookMicrophoneRequest(requestError)) throw requestError;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      if (disposedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: requestedMimeType });
      const chunks: BlobPart[] = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        setError("Не удалось записать звук с микрофона.");
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.onstop = () => {
        recorderRef.current = null;
        stopTimers();
        releaseStream();
        const durationMs = Math.max(0, performance.now() - startedAtRef.current);
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const validationError = validateAudiobookRecordedBlob(blob);
        if (validationError) {
          setError(validationError);
          setRecorderStatus("idle");
          return;
        }
        setRecorderStatus("saving");
        const mimeType = blob.type.split(";", 1)[0].toLowerCase();
        const createdAt = Date.now();
        const draft = {
          id: crypto.randomUUID(),
          projectId,
          chapterId,
          authorId,
          originalName: `Запись-${new Date(createdAt).toISOString().replace(/[:.]/g, "-")}.${getAudiobookRecordingExtension(mimeType)}`,
          mimeType,
          blob,
          durationMs,
          createdAt,
        };
        void saveAudiobookRecordingDraft(draft)
          .then(sync)
          .catch(() => setError("Не удалось сохранить запись на этом устройстве."))
          .finally(() => setRecorderStatus("idle"));
      };
      recorder.start();
      startedAtRef.current = performance.now();
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 250);
      autoStopRef.current = window.setTimeout(stopRecording, AUDIOBOOK_RECORDER_AUTO_STOP_MS - AUDIOBOOK_RECORDER_AUTO_STOP_MARGIN_MS);
      setRecorderStatus("recording");
    } catch (startError) {
      releaseStream();
      setRecorderStatus("idle");
      const name = startError instanceof DOMException ? startError.name : "";
      setError(name === "NotAllowedError" || name === "SecurityError"
        ? "Нет доступа к микрофону. Разрешите его использование в браузере."
        : name === "NotFoundError" ? "Микрофон не найден или недоступен." : "Не удалось включить микрофон для записи.");
    }
  }, [authorId, chapterId, projectId, releaseStream, setRecorderStatus, stopRecording, stopTimers, sync]);

  useEffect(() => {
    queueMicrotask(() => { void sync(); });
    const onOnline = () => { void sync(); };
    window.addEventListener("online", onOnline);
    return () => {
      disposedRef.current = true;
      window.removeEventListener("online", onOnline);
      stopTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      releaseStream();
      statusRef.current = "idle";
    };
  }, [releaseStream, stopTimers, sync]);

  return {
    status,
    isLocked: status === "arming" || status === "recording" || status === "stopping",
    elapsedMs,
    error,
    pendingDraftCount,
    drafts,
    startRecording,
    stopRecording,
    sync,
    discardDraft,
  };
}
