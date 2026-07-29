import type {
  PrivateAudioDetailDto,
  PrivateAudioItemRow,
  PrivateAudioListItemDto,
  PrivateAudioProgressDto,
} from "@/lib/private-audio/types";
import { isProgressNearComplete } from "@/lib/private-audio/validation";

export function toProgressDto(input: {
  positionSeconds?: number | null;
  durationSeconds?: number | null;
  completed?: boolean | null;
  updatedAt?: string | null;
}): PrivateAudioProgressDto {
  const positionSeconds =
    typeof input.positionSeconds === "number" && input.positionSeconds >= 0
      ? input.positionSeconds
      : 0;
  const durationSeconds =
    typeof input.durationSeconds === "number" && input.durationSeconds > 0
      ? input.durationSeconds
      : null;
  const completed =
    input.completed === true ||
    isProgressNearComplete(positionSeconds, durationSeconds);

  return {
    positionSeconds,
    durationSeconds,
    completed,
    updatedAt: input.updatedAt ?? null,
  };
}

export function toListItemDto(
  row: PrivateAudioItemRow,
  progress: PrivateAudioProgressDto,
  coverUrl: string | null = null,
): PrivateAudioListItemDto {
  return {
    id: row.id,
    sourceType: row.source_type,
    title: row.title,
    authorText: row.author_text,
    durationSeconds: row.duration_seconds,
    audioSizeBytes: Number(row.audio_size_bytes),
    hasCover: Boolean(row.cover_path),
    coverUrl,
    progress: toProgressDto({
      ...progress,
      durationSeconds: progress.durationSeconds ?? row.duration_seconds,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDetailDto(
  row: PrivateAudioItemRow,
  progress: PrivateAudioProgressDto,
  coverUrl: string | null = null,
): PrivateAudioDetailDto {
  return {
    ...toListItemDto(row, progress, coverUrl),
    originalFilename: row.original_filename,
    rightsAcceptedAt: row.rights_accepted_at,
  };
}

export function formatPrivateDuration(
  durationSeconds: number | null | undefined,
): string | null {
  if (typeof durationSeconds !== "number" || durationSeconds <= 0) {
    return null;
  }

  const total = Math.round(durationSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }

  if (minutes > 0 && seconds === 0) {
    return `${minutes} мин`;
  }

  if (minutes > 0) {
    return `${minutes} мин ${seconds} с`;
  }

  return `${seconds} с`;
}

export function getPrivateProgressLabel(progress: PrivateAudioProgressDto): string {
  if (progress.completed) {
    return "Прослушано";
  }

  if (progress.positionSeconds <= 0) {
    return "Не начато";
  }

  if (
    typeof progress.durationSeconds === "number" &&
    progress.durationSeconds > 0
  ) {
    const percent = Math.min(
      99,
      Math.round((progress.positionSeconds / progress.durationSeconds) * 100),
    );
    return `${percent}%`;
  }

  return "Продолжить";
}
