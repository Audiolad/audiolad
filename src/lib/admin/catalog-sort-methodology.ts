import {
  PLAYBACK_USAGE_METERING_MIGRATION_ID,
  PLAYBACK_USAGE_PRODUCTION_FIRST_FACTS_REFERENCE_ISO,
} from "@/lib/catalog/sort-constants";

export const CATALOG_SORT_METHODOLOGY_VERSION = "2026-11-26.2" as const;

export const CATALOG_SORT_METHODOLOGY_CHANGELOG = [
  {
    version: "2026-11-26.2",
    summary:
      "Популярность: бакет session_id для альбома; даты учёта и деплой-док.",
  },
  {
    version: "2026-11-26.1",
    summary:
      "Публичная сортировка каталога: Новые, Популярные (>60 с на сессию), По рейтингу (сумма звёзд).",
  },
] as const;

export const CATALOG_SORT_METHODOLOGY_SECTIONS = [
  {
    title: "Новые",
    body:
      "Порядок по дате первой публикации продукта, сначала самые новые. При равной дате — более новый publication_id. Закрытый каталог АудиоЛад Бизнес в выдачу не входит.",
  },
  {
    title: "Популярные",
    body:
      "Сортировка по числу реальных прослушиваний за всё измеряемое время. Одно прослушивание — одна группа (practice_id + coalesce(session_id, listening_key)), в которой сумма server-accepted listened_ms из playback_usage_facts строго больше 60 секунд. Ровно 60 секунд не считается. listening_key сменяется при смене трека; в альбоме analytics session_id держит один продуктовый зачёт. Радио и автоплей: у каждого practice_id свой счётчик; при общей session_id оба продукта могут получить по одному зачёту, если каждый набрал >60 с. Учитываются гости и авторизованные. При равной популярности — сначала более новые продукты.",
  },
  {
    title: "По рейтингу",
    body:
      "Сортировка по сумме звёзд (1–5) всех действительных оценок practice_ratings с excluded_at IS NULL, без среднего. Гостевые оценки добавляются только если включён флаг GUEST_RATINGS_INCLUDE_IN_AGGREGATE. Продукты без оценок остаются в каталоге с нулём звёзд. При равной сумме — сначала более новые.",
  },
  {
    title: "Исторические данные",
    body:
      `Популярность опирается на playback_usage_facts не раньше listening_time_valid_from из playback_usage_settings (выставляется миграцией ${PLAYBACK_USAGE_METERING_MIGRATION_ID} при применении в окружении). Эталон первых фактов на проде по аудиту — не ранее ${PLAYBACK_USAGE_PRODUCTION_FIRST_FACTS_REFERENCE_ISO}; это не заменяет listening_time_valid_from. Backfill нет. Рейтинг — все активные practice_ratings на момент запроса.`,
  },
  {
    title: "Поддержка и авторам",
    body:
      "Если у продукта «мало прослушиваний» при видимой активности, проверьте дату включения учёта MEDIA-TIME и что сессия превысила 60 с без разрыва listening_key. Правила начисления авторской статистики и существующий учёт слушателей авторам этим релизом не меняются.",
  },
] as const;