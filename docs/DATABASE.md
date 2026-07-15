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

## playlists / playlist_items (PR1, 2026-07-15)

Миграция: `supabase/migrations/20260715270000_create_playlists.sql`.  
**На production пока не применялась** — только файл миграции + проверка на изолированной тестовой БД.

### Модель

- Элемент плейлиста ссылается на **`practice_id`** (целый аудиопродукт), не на `audio_item_id`.
- Программа из нескольких `audio_items` остаётся одной строкой в плейлисте.
- Наличие строки в `playlist_items` **не является entitlement** и не открывает доступ к продукту.
- `visibility`: только `private` | `public` (CHECK). Режим `unlisted` (доступ по ссылке без каталога) **зарезервирован на будущее**, в SQL/MVP не реализован.
- Приватный плейлист видит только владелец.
- Публичный плейлист читают `anon` и `authenticated`; мутации — только владелец.
- Содержимое публичного плейлиста схемой **не** валидируется; publish gate — будущий API/RPC (бесплатные + published + catalog-listed).
- Публичность плейлиста ≠ доступ к платным/личным материалам.

### playlists

| Колонка | Тип | Ограничения |
|---------|-----|-------------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | → `auth.users(id)` ON DELETE CASCADE |
| `title` | text NOT NULL | trim length 1..80 (`char_length(title) <= 80`) |
| `visibility` | text NOT NULL DEFAULT `private` | только `private` \| `public` |
| `slug` | text NULL | `private` → всегда NULL; `public` → непустой; UNIQUE среди NOT NULL |
| `published_at` | timestamptz NULL | `private` → всегда NULL; `public` → NULL или timestamp до/после publish |
| `created_at` / `updated_at` | timestamptz NOT NULL | DEFAULT `now()` (общей trigger-функции в проекте нет) |

CHECK согласованности:

- `playlists_visibility_slug_consistency_check` — private↔slug NULL, public↔непустой slug;
- `playlists_visibility_published_at_consistency_check` — private → `published_at IS NULL` (у public `published_at` может быть NULL).

Одинаковые `title` у одного пользователя разрешены.

### playlist_items

| Колонка | Тип | Ограничения |
|---------|-----|-------------|
| `id` | uuid PK | |
| `playlist_id` | uuid NOT NULL | → `playlists(id)` ON DELETE CASCADE |
| `practice_id` | uuid NOT NULL | → `practices(id)` ON DELETE CASCADE |
| `position` | integer NOT NULL | `>= 1`; UNIQUE `(playlist_id, position)` |
| `added_at` | timestamptz NOT NULL | DEFAULT `now()` |

UNIQUE `(playlist_id, practice_id)` — один продукт один раз в плейлисте.

### Лимиты MVP (серверная проверка в будущем API/RPC)

- максимум **50** плейлистов на пользователя;
- максимум **100** продуктов в одном плейлисте;
- длина названия **1–80** (частично в CHECK).

### Будущие маршруты

- владелец: `/playlists`, `/playlists/[id]`;
- публичный просмотр: `/p/[slug]`;
- демо `/playlist/morning-energy` не использовать для реальных данных.

### Мутации

Чтение своих/публичных строк возможно через RLS. Безопасные мутации с entitlement и правилами публикации — через **API routes / RPC**, не через незащищённый клиентский CRUD.

## Схема, триггеры, RLS

Таблица `profiles` задокументирована выше. Таблица `practices` — частично. `playlists` / `playlist_items` — в этом разделе. Остальные таблицы требуют изучения через Supabase Studio.

## Миграции

Инкрементальные файлы: `supabase/migrations/`. Baseline для пустых БД: `supabase/baseline/` (не применять к production).

## Резервное копирование

Будет заполнено позже.
