# Деплой сортировки каталога (популярность / рейтинг)

## 1. Миграция БД

1. Применить `supabase/migrations/20271126120000_catalog_listing_qualified_listen_counts.sql` на production **до** или **вместе с** выкладкой кода, который вызывает RPC `catalog_practice_qualified_listen_counts`.
2. Убедиться, что `playback_usage_settings.listening_time_valid_from` уже задан миграцией `20261127120000_playback_usage_facts.sql` (в каждом окружении — своё значение `now()` на момент применения).
3. Без RPC сортировка «Популярные» деградирует: метрики останутся нулевыми, ошибка логируется как `catalog_listing_sort_metrics_error`.

## 2. Приложение

1. Собрать и выкатить Next.js после успешного CI (`PR Repository Validation`).
2. Перезапуск PM2 `audiolad` — по согласованной runbook, не автоматически из агента.
3. Проверить вручную: `/catalog`, `/catalog?sort=popular`, `/catalog?sort=rating`, пагинация, MAX каталог (сортировка в теле POST).

## 3. Откат

| Слой | Действие |
|------|----------|
| Код | Откатить деплой на предыдущий коммит; сортировки `popular`/`rating` станут недоступны, URL с `sort=popular` парсятся, но метрики не грузятся. |
| RPC | `DROP FUNCTION catalog_practice_qualified_listen_counts` — только если откатываем фичу целиком; на факты `playback_usage_facts` не влияет. |
| Данные | Не требуется; миграция только добавляет функцию. |

## 4. Методика

См. [CATALOG_SORT_METHODOLOGY.md](./CATALOG_SORT_METHODOLOGY.md) — порог 60 с, `session_id` для альбома, дата учёта из `playback_usage_settings`.