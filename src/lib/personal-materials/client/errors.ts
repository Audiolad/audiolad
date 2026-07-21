export class PersonalMaterialClientError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Войдите в аккаунт, чтобы продолжить.",
  forbidden: "У вас нет доступа к этому авторскому пространству.",
  not_found: "Материал не найден.",
  material_not_editable: "Черновик больше нельзя редактировать.",
  material_not_ready: "Сначала загрузите аудиофайл.",
  invalid_file_type: "Выберите аудиофайл в формате MP3.",
  file_too_large: "Размер файла превышает 50 МБ.",
  empty_file: "Выбранный файл пустой.",
  invalid_audio_duration: "Не удалось определить длительность MP3-файла.",
  invalid_request: "Проверьте правильность заполнения формы.",
  storage_upload_failed: "Не удалось загрузить файл. Повторите попытку.",
  upload_failed: "Не удалось загрузить файл. Повторите попытку.",
  conflict: "Действие сейчас недоступно для этого материала.",
  internal_error: "Не удалось выполнить действие. Попробуйте ещё раз.",
  load_failed: "Не удалось загрузить данные. Попробуйте ещё раз.",
};

export function mapPersonalMaterialClientError(
  code: string | undefined,
  status: number,
): PersonalMaterialClientError {
  const normalized = code?.trim() || "internal_error";
  return new PersonalMaterialClientError(normalized, status);
}

export function getPersonalMaterialErrorMessage(error: unknown): string {
  if (error instanceof PersonalMaterialClientError) {
    return ERROR_MESSAGES[error.code] ?? ERROR_MESSAGES.internal_error;
  }

  return ERROR_MESSAGES.internal_error;
}

export function getPersonalMaterialListErrorMessage(): string {
  return "Не удалось загрузить список материалов. Попробуйте ещё раз.";
}

export function getPersonalMaterialUploadErrorMessage(code?: string): string {
  if (code === "invalid_file_type") {
    return ERROR_MESSAGES.invalid_file_type;
  }

  if (code === "file_too_large" || code === "invalid_file_size") {
    return ERROR_MESSAGES.file_too_large;
  }

  if (code === "empty_file") {
    return ERROR_MESSAGES.empty_file;
  }

  if (code === "not_found") {
    return "Личный материал не найден.";
  }

  if (code === "forbidden") {
    return "У вас нет доступа к этому материалу.";
  }

  if (code === "storage_upload_failed" || code === "upload_failed") {
    return ERROR_MESSAGES.storage_upload_failed;
  }

  if (code === "internal_error") {
    return "Не удалось загрузить файл из-за ошибки сервера. Повторите попытку позже.";
  }

  if (code === "invalid_audio_duration") {
    return ERROR_MESSAGES.invalid_audio_duration;
  }

  return "Не удалось загрузить файл из-за ошибки сервера. Повторите попытку позже.";
}

export function getPersonalMaterialActivationErrorMessage(): string {
  return "Сначала загрузите аудиофайл";
}
