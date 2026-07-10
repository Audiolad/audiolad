# DATABASE.md

База данных проекта «АудиоЛад».

## Платформа

- Self-hosted Supabase на сервере Timeweb Cloud (Docker).
- Supabase Studio: http://72.56.232.160:8000
- Облачный supabase.com не используется как рабочая база.

## Подключение из приложения

Переменные окружения (имена без значений):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Клиенты: `src/lib/supabase/client.ts` (браузер), `src/lib/supabase/server.ts` (сервер).

## Известные таблицы

### practices

Используется в `/catalog`. Запрос выбирает поля:

`id`, `title`, `slug`, `description`, `format`, `duration_minutes`, `price`, `is_free`, `status`

Фильтр: `status=eq.published`, сортировка: `created_at.desc`.

### profiles

При регистрации пользователя автоматически создаётся запись профиля. Детали схемы (поля, триггеры, RLS) — будут заполнены позже.

## Схема, триггеры, RLS

Будет заполнено позже. Требуется изучение через Supabase Studio.

## Миграции

Будет заполнено позже.

## Резервное копирование

Будет заполнено позже.
