export const STUDIO_RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

export const STUDIO_MICROPHONE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

const RECORDING_EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
};

function getBaseMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0].trim().toLowerCase();
}

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

  return (
    STUDIO_RECORDER_MIME_TYPES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? null
  );
}

export function validateStudioRecordedFile(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  const mimeType = getBaseMimeType(file.type);
  if (!RECORDING_EXTENSION_BY_MIME[mimeType]) {
    return "Запись создана в неподдерживаемом аудиоформате.";
  }
  if (file.size === 0) {
    return "Запись не содержит аудиоданных.";
  }
  return null;
}

export function getStudioRecordingExtension(mimeType: string): string {
  return RECORDING_EXTENSION_BY_MIME[getBaseMimeType(mimeType)] ?? "webm";
}
