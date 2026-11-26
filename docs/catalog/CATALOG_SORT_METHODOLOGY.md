# Методика сортировки каталога (публичная выдача)

Версия: **2026-11-26.1**

Документ дублирует раздел админки «Методика расчёта популярности и рейтинга» и описывает фактическую реализацию в коде.

## Новые

Сортировка по дате первой публикации (`sortTimestamp` / `published_at`), убывание. Tie-break: `publication_id` убывание.

## Популярные

Источник: `playback_usage_facts.listened_ms`, только факты с `occurred_at >= playback_usage_settings.listening_time_valid_from`.

- Группировка: `practice_id` + `listening_key`.
- Сумма `listened_ms` по группе.
- Квалифицированная сессия: сумма **строго больше** 60 000 мс (ровно 60 с не считается).
- Метрика продукта: число квалифицированных сессий.
- Tie-break: новее по дате публикации, затем `publication_id`.

RPC: `catalog_practice_qualified_listen_counts(p_practice_ids uuid[])`, `EXECUTE` только `service_role`.

Альбомы, радио, автоплей, pause/resume и seek следуют серверной модели `listening_key` и MEDIA-TIME (см. `docs/playback-usage-listening-time.md`).

## По рейтингу

Сумма `stars` по `practice_ratings` с `excluded_at IS NULL`. Среднее не используется. При включённом `GUEST_RATINGS_INCLUDE_IN_AGGREGATE` добавляются гостевые строки `guest_practice_ratings` (unclaimed).

Tie-break: новее по дате публикации.

## Исторический порог

`listening_time_valid_from` задаётся при применении `20261127120000_playback_usage_facts.sql`. До этой отметки популярность недомеряема (не ноль). Backfill нет.

## Изменения

| Версия | Суть |
|--------|------|
| 2026-11-26.1 | Публичные сортировки Новые / Популярные / По рейтингу в каталоге |