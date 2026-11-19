/** t1578u: «АудиоЛад Бизнес» → «Сверка записей». Owner only. */
export const BUSINESS_EVIDENCE_HREF = "/admin/business-evidence";

export const EXTRACT_ERROR_TEXT: Record<string, string> = {
  bad_window: "Проверьте начало и конец периода.",
  window_too_long: "Период не длиннее 7 дней.",
  no_location: "Точка не найдена.",
  too_many_facts: "В периоде слишком много отметок. Выберите период короче.",
  db_error: "Не удалось прочитать журнал. Попробуйте ещё раз.",
  storage_error: "Не удалось сохранить выписку на сервере.",
  forbidden: "Нет доступа.",
};
