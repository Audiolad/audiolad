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
  material_not_ready: "Добавьте аудиофайл или PDF-документ.",
  invalid_file_type: "Можно загрузить только MP3-файл.",
  invalid_file_size: "Файл слишком большой. Проверьте лимит размера.",
  invalid_request: "Проверьте правильность заполнения формы.",
  upload_failed: "Не удалось загрузить аудиофайл. Попробуйте ещё раз.",
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
    return "Не удалось загрузить аудиофайл. Проверьте формат и размер файла.";
  }

  if (code === "invalid_file_size") {
    return "Не удалось загрузить аудиофайл. Проверьте формат и размер файла.";
  }

  return "Не удалось загрузить аудиофайл. Проверьте формат и размер файла.";
}

export function getPersonalMaterialPdfUploadErrorMessage(code?: string): string {
  if (code === "invalid_file_type") {
    return "Можно загрузить только PDF-документ.";
  }

  if (code === "invalid_file_size") {
    return "PDF слишком большой. Максимальный размер — 20 МБ.";
  }

  return "Не удалось загрузить PDF. Проверьте формат и размер файла.";
}

export function getPersonalMaterialActivationErrorMessage(): string {
  return "Добавьте аудиофайл или PDF-документ";
}
