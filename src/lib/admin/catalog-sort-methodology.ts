import {
  PLAYBACK_USAGE_METERING_MIGRATION_ID,
  PLAYBACK_USAGE_PRODUCTION_FIRST_FACTS_REFERENCE_ISO,
} from "@/lib/catalog/sort-constants";

export const CATALOG_SORT_METHODOLOGY_VERSION = "2026-11-26.4" as const;

export const CATALOG_SORT_METHODOLOGY_CHANGELOG = [
  {
    version: "2026-11-26.4",
    summary:
      "Публичная популярность: порог >= 40 с (было > 60 с); учёт только usage_kind=consumer (audiolad.ru), без coffee.audiolad.ru (usage_kind=business). Рейтинг, авторская статистика и финансы без изменений.",
  },
  {
    version: "2026-11-26.3",
    summary:
      "Публичный показ метрик на карточках каталога и PDP: те же прослушивания (>=40 с) и сумма звёзд, без изменения формул сортировки.",
  },
  {
    version: "2026-11-26.2",
    summary:
      "Популярность: бакет session_id для альбома; даты учёта и деплой-док.",
  },
  {
    version: "2026-11-26.1",
    summary:
      "Публичная сортировка каталога: Новые, Популярные (>=40 с на сессию), По рейтингу (сумма звёзд).",
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
      "Сортировка по числу реальных прослушиваний за всё измеряемое время на audiolad.ru: в агрегат попадают только строки playback_usage_facts с usage_kind = consumer (публичный listener / apply_playback_usage_heartbeat). Прослушивания coffee.audiolad.ru (кофейня, закрытый каталог АудиоЛад Бизнес, venue player → apply_business_playback_usage_heartbeat, usage_kind = business) в публичную популярность не входят, даже если practice_id совпадает с публичным продуктом. Одно прослушивание — одна группа (practice_id + coalesce(session_id, listening_key)), сумма listened_ms >= 40 с (40 000 мс включительно). listening_key сменяется при смене трека; в альбоме session_id держит один продуктовый зачёт. Радио/автоплей на audiolad.ru: у каждого practice_id свой consumer-счётчик. Гостевой демо-лимит 30 мин на coffee.audiolad.ru пишется в business_guest_listening, не в публичные счётчики. При равной популярности — сначала более новые продукты.",
  },
  {
    title: "По рейтингу",
    body:
      "Сортировка по сумме звёзд (1–5) всех действительных оценок practice_ratings с excluded_at IS NULL, без среднего. Гостевые оценки добавляются только если включён флаг GUEST_RATINGS_INCLUDE_IN_AGGREGATE. Продукты без оценок остаются в каталоге с нулём звёзд. При равной сумме — сначала более новые.",
  },
  {
    title: "Исторические данные",
    body:
      `Популярность опирается на playback_usage_facts не раньше listening_time_valid_from из playback_usage_settings (выставляется миграцией ${PLAYBACK_USAGE_METERING_MIGRATION_ID} при применении в окружении). Эталон первых фактов на проде по аудиту — не ранее ${PLAYBACK_USAGE_PRODUCTION_FIRST_FACTS_REFERENCE_ISO}; это не заменяет listening_time_valid_from. При смене порога публичной популярности пересчёт идёт по всей доступной измеряемой истории (RPC по фактам, без отдельного backfill-таблицы). Рейтинг — все активные practice_ratings на момент запроса.`,
  },
  {
    title: "Поддержка и авторам",
    body:
      "Если у продукта «мало прослушиваний» при видимой активности, проверьте дату включения учёта MEDIA-TIME и что сессия набрала >=40 с без разрыва listening_key. Правила начисления авторской статистики, порог рейтинговой квалификации и существующий учёт слушателей авторам этим релизом не меняются.",
  },
  {
    title: "Публичное отображение",
    body:
      "В каталоге (все режимы сортировки, включая «Новые»), на карточках MAX/VK и на странице продукта показываются те же два числа, что и в сортировках: ▶ — квалифицированные сессии прослушивания (>=40 с на группу practice_id + coalesce(session_id, listening_key)); ★ — сумма активных звёзд (practice_ratings и, при включённом флаге, гостевые оценки). Формулы, RPC и порядок сортировки для рейтинга не меняются; метрики подмешиваются в существующие ответы listing/catalog API пакетно по id продукта.",
  },
] as const;