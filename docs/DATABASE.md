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
| `cover_path` | text NULL | PR3.3: storage path в private bucket `playlist-covers`; NULL = automatic mosaic |
| `cover_updated_at` | timestamptz NULL | PR3.3: время последней загрузки/замены custom cover |

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

### Лимиты MVP (API + RPC)

- максимум **50** плейлистов на пользователя (`POST /api/playlists`);
- максимум **100** продуктов в одном плейлисте (`set_practice_playlist_membership`);
- длина названия **1–80** (CHECK + API).

### Membership (PR3.1)

- Элемент плейлиста = `practice_id` (целый продукт).
- `playlist_items` **не** выдаёт entitlement / listen-доступ.
- Атомарная смена набора плейлистов: RPC `public.set_practice_playlist_membership(uuid, uuid[])`
  (`supabase/migrations/20260715280000_playlist_membership_rpc.sql`) — **применена к production**.
- Порядок: ownership → gates (только для add) → locks → **preflight** gates/limits → delete → insert → `updated_at` (`clock_timestamp()` только при реальном изменении).
- Private add: действующий доступ как у `resolveProductAccess`.
- Public add: условия `claim_free_practice` / `isPracticeEligibleForPublicPlaylist`.
- Remove из public/private разрешён даже если продукт больше не проходит gate.
- Position нового элемента: `MAX(position)+1` под `FOR UPDATE`.
- API: `GET/PUT /api/playlists/membership`.

### Будущие маршруты

- владелец: `/playlists`, `/playlists/[id]` (PR3.2+ на production: просмотр + delete item + covers; **PR4 reorder ↑↓ — в рабочей копии, не на production**);
- публичный просмотр: `/p/[slug]` (ещё не реализован);
- демо `/playlist/morning-energy` не использовать для реальных данных.

### Covers (PR3.3) — на production

- Поля: `cover_path`, `cover_updated_at` (nullable).
- Private bucket `playlist-covers` (JPEG/PNG/WebP, max 5 MB); path `{user_id}/{playlist_id}/{uuid}.webp`.
- Нет browser Storage policies — upload/delete/signed URL только через server API после ownership.
- CAS RPC `replace_playlist_cover_path(uuid, text, text)` (SECURITY DEFINER, `FOR UPDATE`); EXECUTE: authenticated + service_role; anon denied.
- Mosaic RPC `get_owned_playlist_mosaic_covers()` (SECURITY DEFINER, owner-only); anon denied.
- Custom cover приоритетнее automatic mosaic (0/1/2/3/4+ на UI).
- Удаление плейлиста очищает storage object после успешного DELETE строки.
- Migrations: `20260716120000_playlist_covers.sql`, `20260716121000_playlist_cover_path_cas.sql`.

### Reorder (PR4) — на production

- RPC `public.move_playlist_item(p_playlist_id uuid, p_practice_id uuid, p_direction text)` → `(moved, from_position, to_position)`.
- Клиент шлёт только `direction: "up" | "down"`; не принимает массив positions / произвольную позицию / `user_id`.
- Ownership через `auth.uid()`; playlist row `FOR UPDATE`; swap двух соседей по `position ASC`.
- Temp = `max(position)+1` под lock; при `max >= 2147483647` → `reorder_conflict` без частичного изменения.
- `playlists.updated_at` только при фактическом move; no-op на границе → `moved=false`, `updated_at` не трогается.
- Не пишет в `user_practices`, не меняет entitlement / progress / `audio_items.position`.
- Недоступный материал можно перемещать.
- API: `POST /api/playlists/[id]/items/[practiceId]/move` (session client, без service role).
- Migration: `20260716140000_move_playlist_item.sql` (применена к production).
- Drag-and-drop, Play All, `/p/[slug]` — нет.

### Мутации

Чтение своих/публичных строк возможно через RLS. Безопасные мутации — через **API routes** (`/api/playlists`, `/api/playlists/[id]`, `/api/playlists/membership`, `DELETE /api/playlists/[id]/items/[practiceId]`, `POST .../items/[practiceId]/move`) и SECURITY DEFINER RPC (membership, covers CAS/mosaic, move).

Delete одного item: ownership через `getOwnedPlaylistById` + RLS; не требует entitlement; не пишет в `user_practices`; gaps в `position` допустимы; `updated_at` обновляется при реальном удалении.

Reorder (PR4): атомарный swap соседних `playlist_items.position` по `practice_id`; mosaic после refresh отражает новый top-4.

Public slug генерируется только сервером (транслит названия + короткий hex-suffix). При `private → public` сервер проверяет элементы по той же модели, что `claim_free_practice`: `status=published`, `is_catalog_listed IS TRUE`, `is_free IS TRUE`, `price` null или не `> 0`.

## Схема, триггеры, RLS

Таблица `profiles` задокументирована выше. Таблица `practices` — частично. `playlists` / `playlist_items` — в этом разделе. Остальные таблицы требуют изучения через Supabase Studio.

## Миграции

Инкрементальные файлы: `supabase/migrations/`. Baseline для пустых БД: `supabase/baseline/` (не применять к production).

## Резервное копирование

Будет заполнено позже.
