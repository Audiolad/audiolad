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

export const MATCHER_ERROR_TEXT: Record<string, string> = {
  busy: "Индекс уже собирается.",
  not_installed: "Движок сверки не установлен на сервере.",
  no_tracks: "В каталоге нет одобренных треков с мастер-файлом.",
  db_error: "Не удалось прочитать каталог. Попробуйте ещё раз.",
  spawn_failed: "Не удалось запустить фоновую задачу.",
  bad_file: "Неподдерживаемый файл. Подойдут mp3, m4a, wav, ogg, opus, flac, amr, 3gp, mp4, mov, webm.",
  too_large: "Файл слишком большой.",
  storage_error: "Не удалось сохранить файл на сервере.",
  need_location: "Чтобы сверить по времени, выберите точку.",
  no_location: "Точка не найдена.",
  bad_time: "Такого времени нет в часовом поясе точки.",
  not_found: "Проверка не найдена.",
  incomplete: "Файл загружен не полностью. Попробуйте ещё раз.",
  no_index: "Индекс каталога ещё не собран.",
  not_ready: "Проверка ещё не закончена.",
};

export const JOB_STATE_TEXT: Record<string, string> = {
  uploading: "загрузка",
  queued: "в очереди",
  waiting: "ждёт очереди",
  running: "идёт проверка",
  done: "готово",
  failed: "ошибка",
};
