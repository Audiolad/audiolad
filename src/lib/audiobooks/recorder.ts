"use client";

import { normalizeAudiobookMimeType } from "./storage";

export const AUDIOBOOK_RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
] as const;

export const AUDIOBOOK_MICROPHONE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export const AUDIOBOOK_RECORDER_AUTO_STOP_MS = 59 * 60 * 1000;
export const AUDIOBOOK_RECORDER_AUTO_STOP_MARGIN_MS = 5 * 1000;

export function selectAudiobookRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean,
) {
  return AUDIOBOOK_RECORDER_MIME_CANDIDATES.find(isTypeSupported) ?? null;
}

export function getAudiobookRecorderMimeType() {
  return typeof MediaRecorder === "undefined"
    ? null
    : selectAudiobookRecorderMimeType(MediaRecorder.isTypeSupported);
}

export function getAudiobookRecordingExtension(mimeType: string) {
  return normalizeAudiobookMimeType(mimeType) === "audio/mp4" ? "m4a" : "webm";
}

export function shouldFallbackToBasicAudiobookMicrophoneRequest(error: unknown) {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  return ["OverconstrainedError", "NotSupportedError", "TypeError"].includes(name);
}

export function validateAudiobookRecordedBlob(blob: Blob) {
  const mimeType = normalizeAudiobookMimeType(blob.type);
  if (!mimeType || !["audio/webm", "audio/mp4"].includes(mimeType)) {
    return "Запись создана в неподдерживаемом аудиоформате.";
  }
  if (!blob.size) return "Запись не содержит аудиоданных.";
  return null;
}
