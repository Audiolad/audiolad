export const SEO_ANALYTICS_ERROR_MESSAGES: Record<string, string> = {
  file_required: "Выберите файл XLSX.",
  file_too_large: "Файл больше 8 МБ.",
  not_xlsx: "Нужен файл .xlsx Яндекс.Вебмастера.",
  missing_columns: "В файле нет обязательных колонок Query, Dates range, Impressions, Clicks, CTR %, Avg. position.",
  ambiguous_columns: "Одна и та же метрика указана в нескольких колонках.",
  invalid_period: "Период в колонке Dates range не распознан.",
  period_conflict: "В файле разные периоды. Импорт отменён, данные не записаны.",
  duplicate_normalized_query: "В файле повторяется нормализованный запрос. Импорт отменён, данные не записаны.",
  empty_query: "В файле есть пустой запрос. Импорт отменён, данные не записаны.",
  invalid_metrics: "Некорректные показы, клики или позиция. Импорт отменён, данные не записаны.",
  empty_export: "В файле нет строк с запросами.",
  unsupported_source: "Этот источник выгрузки пока не поддерживается.",
  invalid_filename: "У файла нет имени.",
  permission_denied: "Недостаточно прав seo.manage.",
  migration_required: "Таблица SEO-аналитики ещё не применена на базе. Импорт не записан.",
  import_failed: "Не удалось записать период. Данные не изменены.",
  preview_failed: "Не удалось прочитать файл.",
  seo_map_match_failed: "Файл прочитан, но не удалось сверить запросы с SEO-картой. Данные не импортированы.",
};

export function seoAnalyticsErrorMessage(code: string, fallback?: string): string {
  return SEO_ANALYTICS_ERROR_MESSAGES[code] ?? fallback ?? SEO_ANALYTICS_ERROR_MESSAGES.import_failed;
}
