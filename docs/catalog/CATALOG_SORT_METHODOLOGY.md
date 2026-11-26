# Методика сортировки каталога (публичная выдача)

Версия: **2026-11-26.2**

Документ дублирует раздел админки «Методика расчёта популярности и рейтинга» и описывает фактическую реализацию в коде.

Константы в коде: `src/lib/catalog/sort-constants.ts`. Деплой: [CATALOG_SORT_DEPLOY.md](./CATALOG_SORT_DEPLOY.md).

## Новые

Сортировка по дате первой публикации (`sortTimestamp` / `published_at`), убывание. Tie-break: `publication_id` убывание.

## Популярные

Источник: `playback_usage_facts.listened_ms`, только факты с `occurred_at >= playback_usage_settings.listening_time_valid_from`.

- Группировка: `practice_id` + `COALESCE(session_id::text, listening_key)`.
- `listening_key` меняется при смене `audio_item_id`; для альбома факты одной аналитической `session_id` сливаются в одно прослушивание продукта.
- Сумма `listened_ms` по группе.
- Квалифицированная сессия: сумма **строго больше** 60 000 мс (ровно 60 с не считается).
- Метрика продукта: число квалифицированных сессий.
- Радио/автоплей: у каждого продукта свой `practice_id`; при общей `session_id` учёт идёт раздельно по продуктам, если каждый набрал >60 с.
- Tie-break: новее по дате публикации, затем `publication_id`.

RPC: `catalog_practice_qualified_listen_counts(p_practice_ids uuid[])`, `EXECUTE` только `service_role`.

MEDIA-TIME: `docs/playback-usage-listening-time.md`.

## По рейтингу

Сумма `stars` по `practice_ratings` с `excluded_at IS NULL`. Среднее не используется. При включённом `GUEST_RATINGS_INCLUDE_IN_AGGREGATE` добавляются гостевые строки `guest_practice_ratings` (unclaimed).

Tie-break: новее по дате публикации.

## Исторический порог

| Понятие | Значение |
|--------|----------|
| **Порог учёта популярности (авторитетно)** | `playback_usage_settings.listening_time_valid_from` в БД — `now()` при применении миграции `20261127120000_playback_usage_facts.sql` в данном окружении |
| **Эталон первых фактов на проде (аудит)** | не ранее `2026-09-26T00:00:00.000Z` (см. `docs/ratings/CATALOG_RATING_SORT_FILTER_SPEC.md`) — это не замена `listening_time_valid_from` |
| Backfill | нет |

До `listening_time_valid_from` популярность недомеряема (не ноль).

## Производительность (синтетика)

Скрипт `scripts/catalog-sort-rpc-perf-unit.mjs` проверяет чистый агрегатор (~26k сэмплов) в памяти; на проде RPC группирует в Postgres по индексу `playback_usage_facts_positive_practice_occurred_idx`.

## Изменения

| Версия | Суть |
|--------|------|
| 2026-11-26.2 | Бакет `session_id` для альбомов; деплой-док; уточнение дат |
| 2026-11-26.1 | Публичные сортировки Новые / Популярные / По рейтингу в каталоге |