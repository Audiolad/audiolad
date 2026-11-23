import type { AuthorAudioUploadProgress } from "./direct-audio-upload-client";

const BASE_LABEL = "Загрузка аудио…";

export const AUTHOR_AUDIO_LEAVE_DURING_UPLOAD_MESSAGE =
  "Аудио ещё загружается. Если выйти сейчас, загрузка прервётся.";

function clampPercent(progress: AuthorAudioUploadProgress): number {
  return Math.max(0, Math.min(100, Math.floor(progress.percent)));
}

/** Russian status line for one author audio upload. Uses the en dash only. */
export function formatAuthorAudioUploadLabel(
  progress: AuthorAudioUploadProgress | null | undefined,
): string {
  if (!progress) return BASE_LABEL;
  const percent = clampPercent(progress);
  if (progress.phase === "finalizing") {
    return percent >= 100 ? "Аудио загружено" : "Проверяем аудио…";
  }
  if (progress.phase === "reconnecting") {
    if (progress.retryInSeconds != null && progress.retryInSeconds > 0) {
      return `Связь прервалась – повторим через ${progress.retryInSeconds} с (${percent}%)`;
    }
    return `Восстанавливаем связь… ${percent}%`;
  }
  return `${BASE_LABEL} ${percent}%`;
}

/** Short label for the upload button itself. */
export function formatAuthorAudioUploadButtonLabel(
  progress: AuthorAudioUploadProgress | null | undefined,
): string {
  if (!progress) return "Загрузка…";
  const percent = clampPercent(progress);
  if (progress.phase === "finalizing") return "Проверяем…";
  if (progress.phase === "reconnecting") return `Нет связи… ${percent}%`;
  return `Загрузка… ${percent}%`;
}
