export const STUDIO_RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
] as const;

export const STUDIO_PERSISTABLE_RECORDING_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
] as const;

export function normalizeStudioMimeType(value: string): string {
  return value.split(";", 1)[0].trim().toLowerCase();
}

export function selectStudioRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | null {
  return (
    STUDIO_RECORDER_MIME_CANDIDATES.find((mimeType) =>
      isTypeSupported(mimeType),
    ) ?? null
  );
}

export function isStudioPersistableRecordingMimeType(value: string): boolean {
  return STUDIO_PERSISTABLE_RECORDING_MIME_TYPES.includes(
    normalizeStudioMimeType(value) as (typeof STUDIO_PERSISTABLE_RECORDING_MIME_TYPES)[number],
  );
}

const STUDIO_UPLOAD_MIME_ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/x-aac": "audio/aac",
};

const STUDIO_UPLOAD_EXTENSION_MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".webm": "audio/webm",
};

function getStudioFilenameExtension(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return "";
  }
  return base.slice(dot).toLowerCase();
}

export function canonicalizeStudioUploadMimeType(input: {
  name: string;
  type: string;
}): string {
  const normalized = normalizeStudioMimeType(input.type);
  const aliased = STUDIO_UPLOAD_MIME_ALIASES[normalized];
  if (aliased) {
    return aliased;
  }
  if (normalized === "" || normalized === "application/octet-stream") {
    const inferred = STUDIO_UPLOAD_EXTENSION_MIME_TYPES[getStudioFilenameExtension(input.name)];
    if (inferred) {
      return inferred;
    }
  }
  return normalized;
}
