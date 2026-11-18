export type AudioPrepareStatus = "queued" | "processing" | "failed";

export const AUDIO_PREPARE_PROCESSING_STATUS = "Аудио обрабатывается…";
export const AUDIO_PREPARE_PROCESSING_HINT =
  "Файл загружен. Подготавливаем его для прослушивания.";
/** t1529u: shown while a replacement file is processed for a track that already had audio. */
export const AUDIO_REPLACE_PROCESSING_HINT =
  "Новый файл загружен и обрабатывается. До конца обработки слушатели слышат прежнюю версию.";
export const AUDIO_PREPARE_FAILED_MESSAGE =
  "Не удалось подготовить аудиофайл. Попробуйте загрузить его ещё раз.";
export const AUDIO_PREPARE_PUBLISH_PROCESSING =
  "Аудио ещё обрабатывается. Дождитесь завершения подготовки файла.";
export const AUDIO_PREPARE_PUBLISH_FAILED =
  "Не удалось подготовить аудиофайл. Загрузите его повторно.";

export function mapProductNormalizeJobToPrepareStatus(
  status: string | null | undefined,
): AudioPrepareStatus | null {
  if (status === "queued" || status === "processing" || status === "failed") {
    return status;
  }
  return null;
}

export function isAudioPrepareInFlight(
  status: AudioPrepareStatus | null | undefined,
): boolean {
  return status === "queued" || status === "processing";
}
