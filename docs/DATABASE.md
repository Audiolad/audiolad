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

Доступ к REST API: Nginx проксирует `https://audiolad.ru/rest/v1/` на Supabase Kong (`127.0.0.1:8000`).

## Известные таблицы

### practices

Используется в `/catalog`. Запрос выбирает поля:

`id`, `title`, `slug`, `description`, `format`, `duration_minutes`, `price`, `is_free`, `status`

Фильтр: `status=eq.published`, сортировка: `created_at.desc`.

RLS включён. Политика SELECT: `Public can read published practices` — `status = 'published'`.

### profiles

Используется в `/profile` и `/profile/edit`.

#### Колонки

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | `uuid` | NOT NULL | — |
| `email` | `text` | YES | — |
| `full_name` | `text` | YES | — |
| `role` | `text` | NOT NULL | `'listener'` |
| `created_at` | `timestamptz` | YES | `now()` |

Primary key: `id`.

Foreign key: `profiles.id` → `auth.users(id)` ON DELETE CASCADE.

#### RLS

RLS **включён**.

| Политика | Команда | Условие |
|----------|---------|---------|
| Users can view own profile | SELECT | `auth.uid() = id` |
| Users can insert own profile | INSERT | `WITH CHECK (auth.uid() = id)` |
| Users can update own profile | UPDATE | `USING (auth.uid() = id)` |

DELETE-политики **нет**.

#### Триггер создания профиля

На `auth.users` AFTER INSERT:

```
on_auth_user_created → handle_new_user()
```

Функция `public.handle_new_user()` (SECURITY DEFINER) вставляет:

```sql
insert into public.profiles (id, email, role)
values (new.id, new.email, 'listener');
```

Триггер **не заполняет** `full_name`. У существующих пользователей `full_name` может быть NULL; приложение использует fallback на `user_metadata` и при сохранении записывает `full_name` вручную.

#### Связь с auth

`profiles.id` совпадает с `auth.users.id`. При регистрации `first_name`, `last_name`, `full_name` попадают в `user_metadata` через `signUp()`, но не копируются в `profiles.full_name` автоматически.

## Схема, триггеры, RLS

Таблица `profiles` задокументирована выше. Таблица `practices` — частично. Остальные таблицы требуют изучения через Supabase Studio.

## Миграции

Будет заполнено позже.

## Резервное копирование

Будет заполнено позже.
