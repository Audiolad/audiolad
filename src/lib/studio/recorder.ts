import {
  STUDIO_RECORDER_MIME_CANDIDATES,
  isStudioPersistableRecordingMimeType,
  normalizeStudioMimeType,
  selectStudioRecorderMimeType,
} from "./recording-mime";

export { STUDIO_RECORDER_MIME_CANDIDATES as STUDIO_RECORDER_MIME_TYPES };

export const STUDIO_MICROPHONE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

const RECORDING_EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
};

export function shouldFallbackToBasicMicrophoneRequest(error: unknown): boolean {
  const name =
    error instanceof DOMException || error instanceof Error ? error.name : "";
  return ["OverconstrainedError", "NotSupportedError", "TypeError"].includes(
    name,
  );
}

export function getStudioRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  return selectStudioRecorderMimeType(MediaRecorder.isTypeSupported);
}

export function validateStudioRecordedFile(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  const mimeType = normalizeStudioMimeType(file.type);
  if (
    !isStudioPersistableRecordingMimeType(file.type) ||
    !RECORDING_EXTENSION_BY_MIME[mimeType]
  ) {
    return "Запись создана в неподдерживаемом аудиоформате.";
  }
  if (file.size === 0) {
    return "Запись не содержит аудиоданных.";
  }
  return null;
}

export function getStudioRecordingExtension(mimeType: string): string {
  return RECORDING_EXTENSION_BY_MIME[normalizeStudioMimeType(mimeType)] ?? "webm";
}
