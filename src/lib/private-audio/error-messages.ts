export function getPrivateAudioErrorMessage(
  code: string,
  opId?: string | null,
): string {
  switch (code) {
    case "unauthorized":
      return "Войдите в аккаунт, чтобы продолжить.";
    case "not_found":
      return "Аудиоматериал не найден.";
    case "invalid_file_type":
      return "Этот формат файла не поддерживается.";
    case "invalid_cover_type":
      return "Обложка должна быть в формате JPG, PNG или WebP.";
    case "empty_file":
      return "Файл пустой. Выберите другой аудиофайл.";
    case "file_too_large":
    case "request_entity_too_large":
      return "Файл превышает допустимый размер.";
    case "cover_too_large":
      return "Размер обложки не должен превышать 5 МБ.";
    case "invalid_audio_duration":
      return "Не удалось прочитать MP3-файл.";
    case "invalid_title":
      return "Укажите название длиной до 120 символов.";
    case "invalid_author_text":
      return "Поле «Автор или источник» не должно превышать 120 символов.";
    case "rights_required":
      return "Подтвердите право на личное использование материала.";
    case "quota_exceeded":
      return "Достигнут лимит личных материалов.";
    case "cover_process_failed":
      return "Не удалось обработать обложку. Выберите другое изображение.";
    case "storage_upload_failed":
      return "Не удалось загрузить файл. Попробуйте ещё раз.";
    default: {
      const ref = opId?.trim() ? ` Код ошибки: ${opId.trim()}.` : "";
      return `Не удалось загрузить файл.${ref}`;
    }
  }
}
