const MAX_LOCAL_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const SUPPORTED_FILE_EXTENSIONS = /\.(mp3|wav|m4a|aac)$/i;

export function validateStudioLocalFile(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  const hasAudioMimeType = file.type.startsWith("audio/");
  const hasSupportedExtension = SUPPORTED_FILE_EXTENSIONS.test(file.name);

  if (!hasAudioMimeType && !hasSupportedExtension) {
    return "Выберите аудиофайл MP3, WAV, M4A или AAC.";
  }
  if (file.size === 0) {
    return "Выбранный файл пуст.";
  }
  if (file.size > MAX_LOCAL_FILE_SIZE_BYTES) {
    return "Размер одной дорожки превышает лимит Studio — 200 МБ.";
  }
  return null;
}

export { MAX_LOCAL_FILE_SIZE_BYTES, SUPPORTED_FILE_EXTENSIONS };
