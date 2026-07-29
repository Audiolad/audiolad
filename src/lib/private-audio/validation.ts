import {
  PRIVATE_AUDIO_LIMITS,
  type PrivateAudioSourceType,
} from "@/lib/private-audio/limits";

const ALLOWED_MP3_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/x-mp3",
  "application/octet-stream",
]);

const ALLOWED_COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isAllowedPrivateMp3File(file: File): boolean {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();

  if (!name.endsWith(".mp3")) {
    return false;
  }

  if (!mime) {
    return true;
  }

  return ALLOWED_MP3_MIME_TYPES.has(mime);
}

export function isAllowedPrivateCoverFile(file: File): boolean {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();

  if (
    !name.endsWith(".jpg") &&
    !name.endsWith(".jpeg") &&
    !name.endsWith(".png") &&
    !name.endsWith(".webp")
  ) {
    return false;
  }

  if (!mime) {
    return true;
  }

  return ALLOWED_COVER_MIME_TYPES.has(mime);
}

export function normalizePrivateTitle(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > PRIVATE_AUDIO_LIMITS.titleMaxLength) {
    return null;
  }

  return trimmed;
}

export function normalizePrivateAuthorText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > PRIVATE_AUDIO_LIMITS.authorTextMaxLength) {
    return null;
  }

  return trimmed;
}

export function isPrivateAudioSourceType(
  value: string,
): value is PrivateAudioSourceType {
  return (PRIVATE_AUDIO_LIMITS.sourceTypes as readonly string[]).includes(value);
}

export function wouldExceedPrivateAudioQuota(input: {
  currentItemCount: number;
  currentTotalBytes: number;
  additionalBytes: number;
  additionalItems?: number;
}): boolean {
  const nextItems = input.currentItemCount + (input.additionalItems ?? 1);
  const nextBytes = input.currentTotalBytes + input.additionalBytes;

  return (
    nextItems > PRIVATE_AUDIO_LIMITS.maxItemsPerUser ||
    nextBytes > PRIVATE_AUDIO_LIMITS.maxTotalBytesPerUser
  );
}

export function isProgressNearComplete(
  positionSeconds: number,
  durationSeconds: number | null | undefined,
): boolean {
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return false;
  }

  return (
    positionSeconds >=
    Math.max(durationSeconds - 15, Math.ceil(durationSeconds * 0.95))
  );
}

export function mergeNoRegressProgress(input: {
  currentPosition: number;
  currentCompleted: boolean;
  nextPosition: number;
  nextCompleted: boolean;
}): { positionSeconds: number; completed: boolean } {
  return {
    positionSeconds: Math.max(input.currentPosition, input.nextPosition),
    completed: input.currentCompleted || input.nextCompleted,
  };
}
