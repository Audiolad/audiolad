"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AUDIOBOOK_MICROPHONE_CONSTRAINTS,
  AUDIOBOOK_RECORDER_AUTO_STOP_MARGIN_MS,
  AUDIOBOOK_RECORDER_AUTO_STOP_MS,
  getAudiobookRecorderMimeType,
  getAudiobookRecordingExtension,
  shouldFallbackToBasicAudiobookMicrophoneRequest,
} from "@/lib/audiobooks/recorder";
import {
  deleteAudiobookRecordingDraft,
  appendAudiobookRecordingChunk,
  listAudiobookRecordingDrafts,
  recoverInterruptedAudiobookRecordingDrafts,
  saveAudiobookRecordingDraft,
  type AudiobookRecordingDraft,
} from "@/lib/audiobooks/recorder-store";
import { syncPendingAudiobookRecordingDrafts } from "@/lib/audiobooks/recorder-sync";
import type { AudiobookFragment } from "@/lib/audiobooks/server";
import { AUDIOBOOK_LIMITS } from "@/lib/audiobooks/limits";

type RecorderStatus = "idle" | "arming" | "recording" | "stopping" | "saving";
const RECORDING_BYTE_SAFETY_MARGIN = 1024 * 1024;

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
  const draftRef = useRef<AudiobookRecordingDraft | null>(null);
  const bytesRef = useRef(0);
  const projectPendingBytesRef = useRef(0);
  const chunkSequenceRef = useRef(0);
  const persistedChunkCountRef = useRef(0);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceFailedRef = useRef(false);
  const storageLimitReachedRef = useRef(false);
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
    setDrafts((current) => current.map((draft) => (
      ["ready", "interrupted", "failed"].includes(draft.status)
        ? { ...draft, status: "syncing" }
        : draft
    )));
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
    try {
      recorder.requestData();
    } catch {
      // A final dataavailable event is also dispatched by stop().
    }
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
      const existingDrafts = await listAudiobookRecordingDrafts(projectId);
      projectPendingBytesRef.current = existingDrafts.reduce((total, draft) => total + draft.sizeBytes, 0);
      if (projectPendingBytesRef.current >= AUDIOBOOK_LIMITS.maxProjectSourceBytes) {
        throw new Error("project_recording_limit_reached");
      }
      const createdAt = Date.now();
      const draft: AudiobookRecordingDraft = {
        id: crypto.randomUUID(),
        projectId,
        chapterId,
        authorId,
        originalName: `Запись-${new Date(createdAt).toISOString().replace(/[:.]/g, "-")}.${getAudiobookRecordingExtension(requestedMimeType)}`,
        mimeType: requestedMimeType.split(";", 1)[0].toLowerCase(),
        durationMs: 0,
        sizeBytes: 0,
        chunkCount: 0,
        status: "recording",
        createdAt,
      };
      await saveAudiobookRecordingDraft(draft);
      draftRef.current = draft;
      bytesRef.current = 0;
      chunkSequenceRef.current = 0;
      persistedChunkCountRef.current = 0;
      persistenceFailedRef.current = false;
      storageLimitReachedRef.current = false;
      writeChainRef.current = Promise.resolve();
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
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size || !draftRef.current) return;
        const chunk = event.data;
        const sequence = chunkSequenceRef.current++;
        writeChainRef.current = writeChainRef.current.then(async () => {
          if (storageLimitReachedRef.current || persistenceFailedRef.current) return;
          const nextFragmentBytes = bytesRef.current + chunk.size;
          const nextProjectBytes = projectPendingBytesRef.current + nextFragmentBytes;
          const exceedsFragmentHardMax = nextFragmentBytes > AUDIOBOOK_LIMITS.maxFragmentBytes;
          const exceedsProjectHardMax = nextProjectBytes > AUDIOBOOK_LIMITS.maxProjectSourceBytes;
          if (exceedsFragmentHardMax || exceedsProjectHardMax) {
            storageLimitReachedRef.current = true;
            setError(exceedsFragmentHardMax
              ? "Достигнут лимит записи в 200 МБ."
              : "Достигнут лимит исходных файлов книги.");
            window.setTimeout(stopRecording, 0);
            return;
          }
          await appendAudiobookRecordingChunk(draft.id, sequence, chunk);
          bytesRef.current += chunk.size;
          persistedChunkCountRef.current += 1;
          const crossesFragmentSoftLimit = nextFragmentBytes > AUDIOBOOK_LIMITS.maxFragmentBytes - RECORDING_BYTE_SAFETY_MARGIN;
          const crossesProjectSoftLimit = nextProjectBytes > AUDIOBOOK_LIMITS.maxProjectSourceBytes - RECORDING_BYTE_SAFETY_MARGIN;
          if (crossesFragmentSoftLimit || crossesProjectSoftLimit) {
            storageLimitReachedRef.current = true;
            setError(crossesFragmentSoftLimit
              ? "Достигнут лимит записи в 200 МБ."
              : "Достигнут лимит исходных файлов книги.");
            window.setTimeout(stopRecording, 0);
          }
        }).catch(() => {
          persistenceFailedRef.current = true;
          setError("Не удалось сохранить запись на этом устройстве.");
          window.setTimeout(stopRecording, 0);
        });
      };
      recorder.onerror = () => {
        setError("Не удалось записать звук с микрофона.");
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.onstop = async () => {
        recorderRef.current = null;
        stopTimers();
        releaseStream();
        const durationMs = Math.max(0, performance.now() - startedAtRef.current);
        await writeChainRef.current;
        const completedDraft = draftRef.current;
        draftRef.current = null;
        if (!completedDraft || persistenceFailedRef.current) {
          if (completedDraft) {
            await saveAudiobookRecordingDraft({
              ...completedDraft,
              durationMs,
              sizeBytes: bytesRef.current,
              chunkCount: persistedChunkCountRef.current,
              status: "interrupted",
            }).catch(() => undefined);
          }
          setDrafts(await listAudiobookRecordingDrafts(projectId).catch(() => []));
          setRecorderStatus("idle");
          return;
        }
        setRecorderStatus("saving");
        const finalizedDraft = {
          ...completedDraft,
          durationMs,
          sizeBytes: bytesRef.current,
          chunkCount: persistedChunkCountRef.current,
          status: "ready" as const,
          readyAt: Date.now(),
        };
        try {
          await saveAudiobookRecordingDraft(finalizedDraft);
          setDrafts(await listAudiobookRecordingDrafts(projectId));
          setRecorderStatus("idle");
          if (!disposedRef.current) void sync();
        } catch {
          setError("Не удалось сохранить запись на этом устройстве.");
          setRecorderStatus("idle");
        }
      };
      recorder.start(1000);
      startedAtRef.current = performance.now();
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 250);
      autoStopRef.current = window.setTimeout(stopRecording, AUDIOBOOK_RECORDER_AUTO_STOP_MS - AUDIOBOOK_RECORDER_AUTO_STOP_MARGIN_MS);
      setRecorderStatus("recording");
    } catch (startError) {
      releaseStream();
      const draft = draftRef.current;
      draftRef.current = null;
      if (draft) await deleteAudiobookRecordingDraft(draft.id).catch(() => undefined);
      setRecorderStatus("idle");
      const name = startError instanceof DOMException || startError instanceof Error ? startError.name : "";
      const message = startError instanceof Error ? startError.message : "";
      setError(message === "project_recording_limit_reached"
        ? "Достигнут лимит исходных файлов книги."
        : name === "NotAllowedError" || name === "SecurityError"
        ? "Нет доступа к микрофону. Разрешите его использование в браузере."
        : name === "NotFoundError" ? "Микрофон не найден или недоступен." : "Не удалось включить микрофон для записи.");
    }
  }, [authorId, chapterId, projectId, releaseStream, setRecorderStatus, stopRecording, stopTimers, sync]);

  useEffect(() => {
    void recoverInterruptedAudiobookRecordingDrafts(projectId).then(setDrafts).catch(() => {
      setError("Не удалось открыть локальные черновики.");
    });
    return () => {
      disposedRef.current = true;
      stopTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.requestData();
        } catch {
          // stop() still requests final buffered data.
        }
        recorder.stop();
      } else {
        releaseStream();
      }
      statusRef.current = "idle";
    };
  }, [projectId, releaseStream, stopTimers]);

  return {
    status,
    isLocked: status !== "idle",
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
