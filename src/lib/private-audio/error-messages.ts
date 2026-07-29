export function getPrivateAudioErrorMessage(code: string): string {
  switch (code) {
    case "unauthorized":
      return "Войдите в аккаунт, чтобы продолжить.";
    case "not_found":
      return "Аудиоматериал не найден.";
    case "invalid_file_type":
      return "Загрузите аудиофайл в формате MP3.";
    case "invalid_cover_type":
      return "Обложка должна быть в формате JPG, PNG или WebP.";
    case "empty_file":
      return "Файл пустой. Выберите другой аудиофайл.";
    case "file_too_large":
      return "Размер аудиофайла не должен превышать 50 МБ.";
    case "cover_too_large":
      return "Размер обложки не должен превышать 5 МБ.";
    case "invalid_audio_duration":
      return "Не удалось прочитать аудиофайл. Проверьте, что это корректный MP3.";
    case "invalid_title":
      return "Укажите название длиной до 120 символов.";
    case "invalid_author_text":
      return "Поле «Автор или источник» не должно превышать 120 символов.";
    case "rights_required":
      return "Подтвердите право на личное использование материала.";
    case "quota_exceeded":
      return "Достигнут лимит: не больше 5 материалов и 250 МБ в сумме.";
    case "cover_process_failed":
      return "Не удалось обработать обложку. Выберите другое изображение.";
    case "storage_upload_failed":
      return "Не удалось сохранить файл. Попробуйте ещё раз.";
    default:
      return "Не удалось выполнить действие. Попробуйте ещё раз.";
  }
}
