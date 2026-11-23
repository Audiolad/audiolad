import type { StudioAssetUploadProgress } from "./persistence-client";

const BASE_LABEL = "Сохранение аудио…";

export const STUDIO_LEAVE_DURING_UPLOAD_MESSAGE =
  "Аудио ещё загружается. Если выйти сейчас, загрузка прервётся.";

/** Short Russian status for one audio upload. Uses the en dash only. */
export function formatStudioAssetUploadLabel(
  progress: StudioAssetUploadProgress | null | undefined,
): string {
  if (!progress) return BASE_LABEL;
  const percent = Math.max(0, Math.min(100, Math.floor(progress.percent)));
  if (progress.phase === "finalizing") return "Проверяем аудио…";
  if (progress.phase === "reconnecting") {
    if (progress.retryInSeconds != null && progress.retryInSeconds > 0) {
      return `Связь прервалась – повторим через ${progress.retryInSeconds} с (${percent}%)`;
    }
    return `Восстанавливаем связь… ${percent}%`;
  }
  return `${BASE_LABEL} ${percent}%`;
}

/** Combined progress of several uploads, weighted by bytes. */
export function aggregateStudioAssetUploadProgress(
  items: Iterable<StudioAssetUploadProgress>,
): StudioAssetUploadProgress | null {
  let uploaded = 0;
  let total = 0;
  let count = 0;
  let reconnecting: StudioAssetUploadProgress | null = null;
  let allFinalizing = true;
  for (const item of items) {
    count += 1;
    uploaded += item.uploadedBytes;
    total += item.totalBytes;
    if (item.phase === "reconnecting" && !reconnecting) reconnecting = item;
    if (item.phase !== "finalizing") allFinalizing = false;
  }
  if (count === 0) return null;
  const percent = total > 0 ? Math.min(99, Math.floor((uploaded / total) * 100)) : 0;
  return {
    phase: reconnecting ? "reconnecting" : allFinalizing ? "finalizing" : "uploading",
    uploadedBytes: uploaded,
    totalBytes: total,
    percent,
    retryInSeconds: reconnecting?.retryInSeconds ?? null,
  };
}
