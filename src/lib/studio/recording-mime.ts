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
