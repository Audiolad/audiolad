/**
 * Admin Ratings analytics copy and methodology notes (Stage 3).
 *
 * Temporal windows use practice_ratings.created_at (FIRST rating), not
 * practice_rating_events.occurred_at. Example A: created yesterday, now
 * stars=5 → in 7d/30d with contribution 5. Example B: created a year ago,
 * edited today to 5 → all-time 5; not in the 7d/30d first-rating cohort.
 */

export const ADMIN_RATINGS_TEMPORAL_NOTE =
  "Окна 7/30 дней считают первую оценку (practice_ratings.created_at). Вклад — текущие звёзды, не дельты журнала. Оценка год назад, правленная сегодня, входит только во «всё время».";

export const ADMIN_RATINGS_AVG_NOTE =
  "Средняя оценка — внутренняя админ-метрика (totalStars / ratingCount). На публичных карточках среднее не показывается.";

export const ADMIN_RATINGS_EXCLUDED_NOTE =
  "Агрегаты считают только активные строки (excluded_at IS NULL). Исключённые видны отдельно. Кнопок «Исключить / Вернуть» в этом этапе нет: analytics.view — право чтения, истории exclude/restore в схеме нет.";

export const ADMIN_RATINGS_DIAGNOSTICS_NOTE =
  "Блок «Требует внимания» только наблюдает сигналы (совпадающий IP-сигнал, совпадающий device-сигнал, повышенная активность). Это не «фрод» и ничего не исключает автоматически.";

export const ADMIN_RATINGS_JOURNAL_NOTE =
  "Журнал — audit событий first|changed. Источник текущей оценки — practice_ratings, не события. Период журнала фильтрует occurred_at.";

export const ADMIN_RATINGS_PREVIEW_UX_BACKLOG =
  "Известный UX-backlog (не дыра в безопасности): paid preview корректно отвечает 403 rating_not_eligible, а PDP показывает общее «Не удалось сохранить оценку…». UI оценки в Stage 3 не меняем.";

export const ADMIN_RATINGS_MODERATION_FOLLOWUP =
  "Exclude/Restore с обязательной причиной — follow-up: нужны право записи (не analytics.view) и аудит циклов exclude/restore. Текущие колонки excluded_at/reason/by хранят только актуальное состояние.";
