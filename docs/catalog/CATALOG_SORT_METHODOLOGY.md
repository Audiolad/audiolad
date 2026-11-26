# Методика сортировки каталога (публичная выдача)

Версия: **2026-11-26.4**

Документ дублирует раздел админки «Методика расчёта популярности и рейтинга» и описывает фактическую реализацию в коде.

Константы в коде: `src/lib/catalog/sort-constants.ts`. Деплой: [CATALOG_SORT_DEPLOY.md](./CATALOG_SORT_DEPLOY.md).

## Новые

Сортировка по дате первой публикации (`sortTimestamp` / `published_at`), убывание. Tie-break: `publication_id` убывание.

## Популярные

Источник: `playback_usage_facts.listened_ms` с `usage_kind = consumer` (audiolad.ru), только факты с `occurred_at >= playback_usage_settings.listening_time_valid_from`. Исключены факты `usage_kind = business` (coffee.audiolad.ru venue player / закрытый каталог Бизнес). В фактах нет hostname; контекст кодируется `usage_kind` и B2B-атрибуцией при записи.

- Группировка: `practice_id` + `COALESCE(session_id::text, listening_key)`.
- `listening_key` меняется при смене `audio_item_id`; для альбома факты одной аналитической `session_id` сливаются в одно прослушивание продукта.
- Сумма `listened_ms` по группе.
- Квалифицированная сессия: сумма **не меньше** 40 000 мс (40 с включительно).
- Метрика продукта: число квалифицированных сессий.
- Радио/автоплей: у каждого продукта свой `practice_id`; при общей `session_id` учёт идёт раздельно по продуктам, если каждый набрал >=40 с.
- Tie-break: новее по дате публикации, затем `publication_id`.

RPC: `catalog_practice_qualified_listen_counts(p_practice_ids uuid[])`, `EXECUTE` только `service_role`. Порог обновляется миграцией `20271126140000_catalog_qualified_listen_40s_threshold.sql` (ранее `20271126120000` — строго >60 с).

MEDIA-TIME: `docs/playback-usage-listening-time.md`.

## По рейтингу

Сумма `stars` по `practice_ratings` с `excluded_at IS NULL`. Среднее не используется. При включённом `GUEST_RATINGS_INCLUDE_IN_AGGREGATE` добавляются гостевые строки `guest_practice_ratings` (unclaimed).

Tie-break: новее по дате публикации.

## Исторический порог

| Понятие | Значение |
|--------|----------|
| **Порог учёта популярности (авторитетно)** | `playback_usage_settings.listening_time_valid_from` в БД — `now()` при применении миграции `20261127120000_playback_usage_facts.sql` в данном окружении |
| **Эталон первых фактов на проде (аудит)** | не ранее `2026-09-26T00:00:00.000Z` (см. `docs/ratings/CATALOG_RATING_SORT_FILTER_SPEC.md`) — это не замена `listening_time_valid_from` |
| Пересчёт при смене 60→40 с | полная измеряемая история `playback_usage_facts` через RPC (без materialized cache / backfill-таблицы) |

До `listening_time_valid_from` популярность недомеряема (не ноль).

## Производительность (синтетика)

Скрипт `scripts/catalog-sort-rpc-perf-unit.mjs` проверяет чистый агрегатор (~26k сэмплов) в памяти; на проде RPC группирует в Postgres по индексу `playback_usage_facts_positive_practice_occurred_idx`.

## Публичное отображение

На карточках каталога (все сортировки), в MAX/VK и на PDP показываются **те же** метрики, что используют сортировки «Популярные» и «По рейтингу», без изменения формул рейтинга: **▶** — число квалифицированных сессий (>=40 с); **★** — сумма активных звёзд. Загрузка — пакетно в существующих API listing/catalog.

## Изменения

| Версия | Суть |
|--------|------|
| 2026-11-26.4 | Публичная популярность: порог 60 с strict → 40 с inclusive; RPC `20271126140000` |
| 2026-11-26.3 | Публичный показ метрик на карточках и PDP |
| 2026-11-26.2 | Бакет `session_id` для альбомов; деплой-док; уточнение дат |
| 2026-11-26.1 | Публичные сортировки Новые / Популярные / По рейтингу в каталоге |