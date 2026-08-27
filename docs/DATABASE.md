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

Единая сущность аудиопродукта (практика, музыка или аудиопост). Используется в `/catalog` и кабинете автора.

Ключевые поля каталога: `id`, `title`, `slug`, `description`, `format`, `duration_minutes`, `price`, `is_free`, `status`, `product_kind`, `publication_class`, `music_usage_permission`, `catalog_visibility`, `is_catalog_listed`.

`catalog_visibility` — источник истины (`listed` | `unlisted` | `selected_users`). `is_catalog_listed` остаётся совместимым флагом и синхронизируется триггером: `listed` → true, `unlisted`/`selected_users` → false. Backfill: `is_catalog_listed=true` → `listed`, `false` → `unlisted` (никогда `selected_users`). Колонка без DEFAULT: legacy INSERT `is_catalog_listed=false` без `catalog_visibility` становится `unlisted`, а обычный INSERT без обоих полей — `listed` (через default `is_catalog_listed=true`).

Обычный каталог `/catalog` и `/api/catalog`: guest видит только `listed`; авторизованный — `listed` плюс свои `selected_users` по allowlist `practice_visibility_users`. `unlisted` в каталоге нет. Карточка скрывается, если у зрителя есть активный `user_practices` или `library_saves` (это не одно и то же; оба только убирают карточку из обычного каталога). Источник решения ordinary catalog — `applyOrdinaryCatalogEligibility`; legacy post-filter `is_catalog_listed === true` туда не применяется. Если viewer state (allowlist / grants / saves) недоступен, ordinary catalog отвечает ошибкой, а не «у пользователя ничего нет». Публичные витрины (главная, sitemap, editorial, страница автора) остаются listed-only.

Режим «Только по ссылке» = `published` + `unlisted`. Режим «Только выбранным пользователям» = `published` + `selected_users` + строка в `practice_visibility_users`. Allowlist означает только видимость, не grant и не запись в `user_practices`. `approve_and_publish_practice` / `publish_audio_product` сохраняют выбранное `is_catalog_listed` (миграция `20260805194500_preserve_catalog_listed_on_publish.sql`); starters остаются unlisted. Unpublish ставит `is_catalog_listed=false`; триггер переводит `listed` → `unlisted` и оставляет `selected_users`.

Сортировка каталога: `created_at.desc`.

RLS включён. Политика SELECT: `Public can read published practices` — `status = 'published' AND catalog_visibility IN ('listed', 'unlisted')`. `selected_users` читают allowlist / автор / admin / entitled (отдельные политики). `is_practice_author_member(uuid,uuid)` имеет `EXECUTE` у `authenticated` (нужно для RLS) и не имеет у `anon`. `audio_items`, gallery и `practice_topics` публично читаются только если `can_current_viewer_read_practice` разрешает родителя. Allowlist-таблица: клиентский SELECT своих/авторских строк, записи только через SECURITY DEFINER RPC.

Публичные discovery RPC: `get_public_quick_offer` отдаёт только `listed`; `get_public_promo_page` не делает `selected_users` публичным из‑за `guest_access_enabled` (гость не видит продукт; allowlisted/author/admin/entitled — да). Публичный SELECT `author_featured_products` и `playlist_items` не раскрывает `product_id` / слот для `selected_users`; публичные плейлисты остаются listed-only, кабинет автора и управление плейлистами сохраняются.

#### practice_visibility_users (2026-08-27)

Миграции: `20260830120100_practice_catalog_visibility_modes.sql`, `20260830120200_create_practice_order_visibility.sql`, `20260830120300_public_playlist_selected_visibility.sql`, `20260830120400_fix_visibility_allowlist_author_policy.sql`.

| Колонка | Тип | Правила |
|---------|-----|---------|
| `practice_id` | uuid NOT NULL | FK `practices(id)` ON DELETE CASCADE |
| `user_id` | uuid NOT NULL | FK `auth.users(id)` ON DELETE CASCADE |
| `created_by` | uuid NULL | FK `auth.users(id)` ON DELETE SET NULL |
| `created_at` | timestamptz | default now() |

UNIQUE `(practice_id, user_id)`. Это только VISIBILITY: пользователь может увидеть `selected_users` продукт. Не purchase, не grant, не claim, не library save. Lookup автора — exact email или exact UUID через `lookup_practice_visibility_user` (rate limit 20 / 10 мин, generic not-found). Не использовать editorial search / service-role ilike.

#### product_kind / music_usage_permission (2026-07-29, audio_post 2026-08-05)

Миграции: `20260729200000_practice_product_kind_music.sql`, `20260805120000_practice_product_kind_audio_post.sql`.

| Колонка | Тип | Правила |
|---------|-----|---------|
| `product_kind` | text NOT NULL DEFAULT `practice` | `practice` \| `music` \| `audio_post`; после первой публикации (`published_at IS NOT NULL`) смена запрещена триггером. Phase 1: legacy shadow рядом с `publication_class`. |
| `music_usage_permission` | text NULL | для `practice` и `audio_post` всегда NULL; для `music` при публикации обязательно `listen_only` \| `platform_reuse_allowed` |

#### publication_class (2026-08-25, Phase 1)

Миграция: `20260825133000_practice_publication_class.sql`.

| Колонка | Тип | Правила |
|---------|-----|---------|
| `publication_class` | text NULL | `practice` \| `course` \| `audiobook` \| `release` \| `post`; NULL = старая запись, класс читается из `product_kind`. Backfill нет. |

Новые черновики кабинета пишут оба поля. Тень `product_kind`:

- `practice` / `course` / `audiobook` → `practice`
- `release` → `music`
- `post` → `audio_post`

Course / audiobook не выводятся из `format`. Section / Module tables в Phase 2A нет.

#### Course content foundation (2026-08-26, Phase 2A)

Миграция: `20260827120000_course_content_foundation.sql`.

Одна публикация → уроки → блоки. `publication_id = practices.id`. Parent
обязан иметь явный `publication_class = 'course'` (BEFORE INSERT/UPDATE
trigger `enforce_course_content_parent_is_course`). Legacy NULL+practice
не считается курсом. Backfill / `UPDATE practices` / смена
`publication_class` / авто-уроки из `audio_items` — нет.

| Таблица | Назначение |
|---------|------------|
| `course_lessons` | Уроки курса: `title`, `position >= 0`. Индекс `(publication_id, position, id)`. Лимита 30 нет. |
| `course_lesson_blocks` | Блоки `audio` \| `text` \| `file`. `asset_id` полиморфный (audio → `audio_items.id` того же курса, file → `publication_files.id`). text: `asset_id IS NULL`, payload `{ text: string }`. |
| `publication_files` | Приватные файлы. Phase 2A: `mime = 'application/pdf'`, `size_bytes <= 20MiB`. Колонки публичного URL нет. |
| `course_completion_ctas` | 1:1 CTA курса (`publication_id` PK). `title`, `description`, `button_text`, `url`, `enabled`. Не `promo_*` и не блок урока. |

**Доступ:** наличие строки урока / блока / файла / CTA **никогда** не даёт
чтение. Learner SELECT policy нет. RLS: ENABLE, REVOKE PUBLIC/anon, нет
public SELECT, author members (`owner`/`editor`) CRUD, `service_role` ALL.
Чтение слушателем — только server + service role после
`canAccessCourseContent` (`user_practices` entitlement / автор / platform
admin). Будущий learner API обязан сначала резолвить родительский курс,
затем helper, затем читать. GET-by-lesson-id без parent check запрещён;
эндпоинта в этом PR нет.

**Storage:** private bucket `publication-files` (не `personal-materials`,
не `practice-audio`, не public). Нет storage SELECT для anon/authenticated.
Валидация PDF переиспользует magic `%PDF-` / MIME / 20MB cap из
personal-materials, но объекты пишутся только в `publication-files`.

#### publication_gallery_slides (2026-08-25, Phase 1B Product Gallery)

Миграция: `20260825150000_publication_gallery_slides.sql`.

Одна таблица extra-слайдов 1:1 для Product Gallery. Это не галерея каждого класса публикаций.

| Колонка | Тип | Правила |
|---------|-----|---------|
| `publication_id` | uuid NOT NULL | FK `practices.id` ON DELETE CASCADE |
| `image_url` | text NOT NULL | публичный URL в `practice-covers` |
| `image_manifest` | jsonb NOT NULL | тот же shape, что `practices.cover_image` |
| `position` | integer NOT NULL | 0..29; каталог читает `position ASC, id ASC` |
| `alt` | text NULL | до 200 символов, без переносов |

Лимит 30 слайдов — CHECK + INSERT trigger. RLS: public SELECT для published; author members CRUD.

Eligibility только в приложении через `isProductGalleryEligible` / `resolvePublicationClass`: `practice` / `course` / `audiobook` (включая legacy NULL+`practice`). `release` и `post` не создают и не показывают слайды. Колонки класса на слайдах нет. Cover остаётся на `practices`. Backfill / `UPDATE practices` нет.

Трек vs альбом для музыки не хранится отдельным полем: 1 `audio_item` → «Музыкальный трек», ≥2 → «Музыкальный альбом».

Для `audio_post`: всегда бесплатный (`is_free=true`, `price=0`), публичный формат «Аудиопост», ровно один `audio_item` на уровне publish readiness / UX (не CHECK на число треков). Поле `description` для `audio_post` необязательно (`assert_practice_moderation_ready` / TS publish readiness); для `practice` и `music` описание по-прежнему обязательно. Миграция: `20260805193000_audio_post_optional_description.sql`.

#### promo_* — универсальная внутренняя рекомендация (2026-08-05)

Миграция: `20260805120000_practice_product_kind_audio_post.sql`.

| Колонка | Тип | Правила |
|---------|-----|---------|
| `promo_enabled` | boolean NOT NULL DEFAULT false | показывать блок «следующий шаг» |
| `promo_title` | text NULL | заголовок |
| `promo_text` | text NULL | короткий текст |
| `promo_button_text` | text NULL | текст кнопки |
| `promo_url` | text NULL | internal `/...` или безопасный external URL |
| `promo_open_in_new_tab` | boolean NOT NULL DEFAULT false | только для external |

На MVP блок включается в UI только для `audio_post`. Поля универсальны для будущего использования на других типах.

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
| `author_project_limit_override` | `integer` | YES | — |
| `author_premium_enabled` | `boolean` | NOT NULL | `false` |

Primary key: `id`.

Foreign key: `profiles.id` → `auth.users(id)` ON DELETE CASCADE.

#### Лимит авторских проектов (2026-07-30)

Миграция: `20260730120000_author_multi_project_limits.sql`.

Эффективный лимит owned-проектов (`author_members.role = 'owner'`):

`admin_override ?? (premium → 3) ?? 1`

Создание проекта: RPC `create_author_project` (advisory lock + проверка лимита).  
JWT-сессии не могут сами менять `author_project_limit_override` / `author_premium_enabled` (триггер-защита).

Проект в продуктовой модели = строка `authors` + membership; отдельной таблицы projects нет.

#### author_contacts (2026-08-27)

Миграция: `20260829130000_author_contacts.sql`.

Внешние контакты/ссылки автора. Не колонки `telegram_url` / `max_url` на `authors`: у автора может быть несколько контактов, список платформ будет расти.

| Колонка | Тип | Правила |
|---------|-----|---------|
| `id` | uuid PK | `gen_random_uuid()` |
| `author_id` | uuid | FK → `authors.id` ON DELETE CASCADE |
| `platform` | text | `telegram` \| `max` \| `custom`; CHECK расширяется при новых платформах |
| `title` | text | авторский заголовок, 1–120 символов |
| `description` | text NULL | короткий текст, max 120; пустое значение = NULL |
| `url` | text | `https://…` или `mailto:email@domain` |
| `icon_url` / `icon_path` / `icon_image` | text / text / jsonb | загруженная иконка в `author-assets`; NULL = стандартная иконка платформы |
| `sort_order` | integer | 0–5, unique `(author_id, sort_order)` |
| `is_visible` | boolean | `false` скрывает контакт с публичной страницы |
| `created_at` / `updated_at` | timestamptz | |

Max 6 контактов на автора (`sort_order < 6`).

RLS: публичный SELECT только `is_visible = true`. Members (`owner`/`editor`) — полный CRUD своих контактов. `anon`/`authenticated` SELECT; `authenticated`/`service_role` ALL.

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

- Элемент плейлиста всегда имеет **`practice_id`** (аудиопродукт). С 2026-08-18 музыкальный трек дополнительно хранит **`audio_item_id`**.
- Программа из нескольких `audio_items` по-прежнему может быть одной строкой (`audio_item_id IS NULL`).
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
| `is_editorial` | boolean NOT NULL DEFAULT false | PR editorial: `true` только для публичных плейлистов АудиоЛада; наполнение через RPC `add_editorial_playlist_practices` (platform admin) |

CHECK согласованности:

- `playlists_visibility_slug_consistency_check` — private↔slug NULL, public↔непустой slug;
- `playlists_visibility_published_at_consistency_check` — private → `published_at IS NULL` (у public `published_at` может быть NULL);
- `playlists_editorial_requires_public_check` — `is_editorial = true` → `visibility = public`.

**Редакционные плейлисты:** `profiles.role = platform_admin` (функция `is_platform_admin()`). Обычные личные плейлисты по-прежнему наполняются только из Аудиотеки / entitlement. Редакционный плейлист не выдаёт доступ к платным материалам.

Одинаковые `title` у одного пользователя разрешены.

### playlist_items

| Колонка | Тип | Ограничения |
|---------|-----|-------------|
| `id` | uuid PK | |
| `playlist_id` | uuid NOT NULL | → `playlists(id)` ON DELETE CASCADE |
| `practice_id` | uuid NOT NULL | → `practices(id)` ON DELETE CASCADE |
| `audio_item_id` | uuid NULL | → `audio_items(id)` ON DELETE CASCADE; 2026-08-18 |
| `position` | integer NOT NULL | `>= 1`; UNIQUE `(playlist_id, position)` |
| `added_at` | timestamptz NOT NULL | DEFAULT `now()` |

UNIQUE `(playlist_id, practice_id)` originally meant one product once.  
Since `20260818180000_playlist_item_audio_track.sql`:

- `audio_item_id IS NULL` — legacy whole-product row; unique `(playlist_id, practice_id)` among those rows.
- `audio_item_id IS NOT NULL` — concrete published track; unique `(playlist_id, audio_item_id)`.
- Trigger `playlist_items_audio_matches_practice` requires the track to belong to `practice_id`.
- Music editorial adds store the track id. Old rows stay NULL and keep playing as the whole product.
- Practices / programs with several `audio_items` can still be stored as one product row.

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

- владелец: `/playlists`, `/playlists/[id]` (PR3.2+ на production: просмотр + delete item + covers + reorder);
- публичный просмотр: `/p/[slug]` (PR5 на production);
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
- Drag-and-drop — нет. Play All / queue corrective — только app-layer (без миграции / без изменений entitlement / `user_practices` / progress schema).

### Public page (PR5) — на production

- Маршрут `/p/[slug]`; migration не требуется.
- Gate: `visibility = 'public'` AND `published_at IS NOT NULL` AND valid slug; иначе `notFound()`.
- Загрузка: session/anon Supabase client + RLS (`loadPublicPlaylistBySlug`, React `cache()`); без новой RPC.
- Service role только для signed custom cover после public gate; path через `isValidPlaylistCoverPath(userId, playlistId)`.
- Bucket `playlist-covers` остаётся private.
- Drift/unavailable item остаётся в позиции («Материал сейчас недоступен»); без audio signed URL / entitlement / `user_practices` / progress / `updated_at` writes.
- Copy link в owner UI только при public + slug + `published_at`.

### Description length (2026-08-16)

`playlists.description` — optional text for the whole table (user and platform). New limit: `char_length(description) <= 300` (`playlists_description_length_check`). Migration `20260816120000_playlist_description_max_300.sql` is fail-closed: it errors if any existing row is longer than 300 and does not truncate text. **Not applied to production.**

### Playlist catalog foundation (Stage 1, 2026-08-25)

Миграция: `supabase/migrations/20260825163000_playlist_catalog_foundation.sql`.

Плейлист остаётся существующей сущностью `public.playlists`. Это **не** новый `kind` продукта. Витрина `/playlists/catalog` — отдельный listing-поток (`class: "playlist"`). Личные `/playlists` и `/playlists/[id]` не меняются.

Добавлены только поля витрины на `playlists`:

| Колонка | Тип | Правила |
|---------|-----|---------|
| `items_count` | integer NOT NULL DEFAULT 0 | денормализованный count `playlist_items` |
| `duration_seconds` | integer NOT NULL DEFAULT 0 | сумма длительностей: track → `audio_items.duration_seconds`; whole-product → сумма треков продукта |
| `saves_count` | integer NOT NULL DEFAULT 0 | денормализованный count `playlist_saves` |
| `listed_at` | timestamptz NULL | NULL = не в витрине. Editorial publish (`owner_type=platform`, `is_editorial`) ставит `listed_at = listed_at ?? published_at`. User-owned publish поле не трогает |

Индекс newest: `(listed_at DESC, id DESC) WHERE listed_at IS NOT NULL` (`playlists_listed_at_idx`).

Индекс popular (Stage 5A.2): `(saves_count DESC, listed_at DESC, id DESC) WHERE listed_at IS NOT NULL` (`playlists_saves_count_listed_at_idx`, миграция `20260825165000_playlist_catalog_popular_index.sql`). Trigger `touch_playlist_saves_count` не менялся.

Для platform editorial publish `listed_at` выставляется вместе с публикацией (`listed_at ?? published_at`, helper `resolveListedAtOnPublish`). User-owned publish по-прежнему не ставит `listed_at`. Trigger `playlists_clear_listed_at_when_unlisted` обнуляет `listed_at`, если плейлист перестаёт быть public + published + slug. One-shot backfill уже опубликованных editorial: `20260825166000_editorial_playlist_listed_at_backfill.sql`.

Агрегаты поддерживает `refresh_playlist_listing_aggregates(uuid)` + trigger на `playlist_items`. `saves_count` обновляет trigger на `playlist_saves`. `updated_at` и entitlement не трогаются.

#### public.playlist_saves

Отдельно от `library_saves` (сохранение продукта в Аудиотеку). Save плейлиста ≠ право слушать его элементы.

| Колонка | Тип | Правила |
|---------|-----|---------|
| `user_id` | uuid NOT NULL | FK `auth.users(id)` ON DELETE CASCADE |
| `playlist_id` | uuid NOT NULL | FK `playlists(id)` ON DELETE CASCADE |
| `created_at` | timestamptz NOT NULL | default `now()` |

UNIQUE `(user_id, playlist_id)`. Индексы: `(user_id, created_at DESC)`, `(playlist_id)`.

RLS: пользователь видит / создаёт / удаляет только свои строки.
`GRANT SELECT, INSERT, DELETE` → `authenticated`. Нет UPDATE. Нет claim RPC.

Stage 5B: `GET /api/playlists/saved` читает `playlist_saves` с inner join на listed public playlists. Новый индекс не добавлялся — используется `(user_id, created_at DESC)`.

### Playlist topics (Stage 4B.1, 2026-08-25)

Миграция: `supabase/migrations/20260825164000_playlist_topics.sql`.

Плейлисты используют существующий словарь `public.topics`. Новый словарь категорий, свободные tags и `direction_id` не используются.

#### public.playlist_topics

| Колонка | Тип | Правила |
|---------|-----|---------|
| `playlist_id` | uuid NOT NULL | FK `playlists(id)` ON DELETE CASCADE |
| `topic_id` | uuid NOT NULL | FK `topics(id)` ON DELETE CASCADE |
| `created_at` | timestamptz NOT NULL | default `now()` |

PK `(playlist_id, topic_id)`. Индекс: `(topic_id)`.

Темы необязательны: listed/public плейлист без строк в `playlist_topics` остаётся в общей выдаче.

RLS: SELECT для anon/authenticated только у public + published + listed + slug. Прямого INSERT/UPDATE/DELETE у клиентов нет.

Запись только через RPC `set_playlist_topics(playlist_id, topic_keys[])`: полная замена набора, только `is_active` keys, max 3, дубликаты и неизвестный key — ошибка, пустой набор допустим. Authenticated caller должен быть `is_platform_staff`; user-owned editor не реализован.

### Мутации

Чтение своих/публичных строк возможно через RLS. Безопасные мутации — через **API routes** (`/api/playlists`, `/api/playlists/[id]`, `/api/playlists/membership`, `DELETE /api/playlists/[id]/items/[practiceId]`, `POST .../items/[practiceId]/move`) и SECURITY DEFINER RPC (membership, covers CAS/mosaic, move).

Delete одного item: ownership через `getOwnedPlaylistById` + RLS; не требует entitlement; не пишет в `user_practices`; gaps в `position` допустимы; `updated_at` обновляется при реальном удалении.

Reorder (PR4): атомарный swap соседних `playlist_items.position` по `practice_id`; mosaic после refresh отражает новый top-4.

Public slug генерируется только сервером (транслит названия + короткий hex-suffix). При `private → public` сервер проверяет элементы по той же модели, что `claim_free_practice`: `status=published`, `is_catalog_listed IS TRUE`, `is_free IS TRUE`, `price` null или не `> 0`.

## practices / audio_items — обложки (per-track covers)

Миграция: `supabase/migrations/20260716181000_per_track_covers.sql`.  
**На production пока не применялась.**

### practices (дополнительно)

| Колонка | Тип | Default | Назначение |
|---------|-----|---------|------------|
| `use_shared_cover` | boolean NOT NULL | `true` | При `true` плеер использует `cover_url` продукта для всех треков. При `false` допускается override через `audio_items.cover_url`. |
| `cover_url` | text | — | Обязательная общая обложка продукта (public URL, bucket `practice-covers`). |

### audio_items (дополнительно)

| Колонка | Тип | Default | Назначение |
|---------|-----|---------|------------|
| `cover_url` | text NULL | — | Необязательная обложка трека. Используется только при `practices.use_shared_cover = false`. |

### Storage paths (`practice-covers`, public)

`practice-covers` — общий public bucket (`storage.buckets.public = true`). Поэтому
URL `/storage/v1/object/public/practice-covers/...` обходят RLS `storage.objects`.
После появления `selected_users` это известное ограничение: известный путь обложки
selected продукта пока можно запросить напрямую. Закрытие требует отдельного
перехода bucket в private и замены существующих public URL на server-signed delivery;
row-aware Storage policy в public bucket это не исправляет. Не считать обложку
секретной до отдельной миграции этой архитектуры.

- Общая обложка: `practices/{practiceId}/cover.{jpg|png|webp}`
- Обложка трека: `practices/{practiceId}/track-covers/{audioItemId}.{jpg|png|webp}`

RLS: существующие политики author members на `practices/{practiceId}/...` — без новой Storage-миграции.

### Fallback при воспроизведении

1. Если `use_shared_cover = false` и у трека есть `cover_url` → обложка трека (cache-bust: `audio_items.updated_at`).
2. Иначе → `practices.cover_url` (cache-bust: `practices.updated_at`).
3. Иначе → gradient + symbol в UI.

Каталог, карточки продукта и список содержания используют только `practices.cover_url`.

### API

- `POST/DELETE /api/author/products/[id]/audio/[audioId]/cover` — upload/delete обложки трека (только при `use_shared_cover = false`).
- `PATCH /api/author/products/[id]` — поле `use_shared_cover`.

## Platform RBAC (внутренняя команда)

Миграция: `supabase/migrations/20260725120000_platform_rbac_foundation.sql`.

Отдельная модель доступа для сотрудников платформы. **Не смешивать** с `author_members.role` (`owner` / `editor` авторского пространства).

### Таблицы

| Таблица | Назначение |
|--------|------------|
| `platform_permissions` | Коды разрешений (`admin_panel.access`, `dashboard.view`, …) |
| `platform_roles` | Роли команды: `owner`, `admin`, `editor`, `support`, `analyst`, `finance` |
| `platform_role_permissions` | Наборы permissions для ролей |
| `platform_user_roles` | Many-to-many: пользователь → роли команды |

### Решение о доступе

- Приложение и SQL используют `has_platform_permission(user_id, permission_code)`.
- Роль `owner` даёт все текущие и будущие permissions (bypass в функции).
- Legacy `profiles.role` (`platform_owner` / `platform_admin`) временно учитывается внутри `has_platform_permission` и при миграции копируется в `platform_user_roles`.
- Колонка `profiles.role` **сохраняется**; отказ от legacy — отдельный этап.

### RLS

- Чтение справочников ролей/permissions — `authenticated`.
- Чтение `platform_user_roles` — свои строки или при наличии `team.view`.
- Мутации назначений — через `service_role` / SQL (UI назначения ролей пока нет).

## private_audio_items (MVP, 2026-07-29)

Миграция: `supabase/migrations/20260729190000_private_audio_items.sql`.

Listener-owned private audio (ручная загрузка MP3). Не связано с `practices`, `audio_items`, `user_practices`, `personal_materials`.

### private_audio_items

| Колонка | Тип | Назначение |
|---------|-----|------------|
| `owner_user_id` | uuid | владелец (`auth.users`), CASCADE |
| `source_type` | text | MVP: только `manual_upload` |
| `title` / `author_text` | text | метаданные слушателя |
| `audio_path` / `cover_path` | text | пути в private bucket `private-audio-items` |
| `rights_accepted_at` | timestamptz | подтверждение права на личное использование |

RLS: authenticated SELECT только своих строк. INSERT/UPDATE/DELETE — через server API + service role.

Прогресс: `private_audio_item_progress` + RPC `get/upsert_private_audio_item_progress` (no-regress).

Storage: bucket `private-audio-items` (private, без browser policies).

## remove_library_practice (Аудиотека, 2026-08-04)

Миграция: `supabase/migrations/20260804130000_remove_library_practice.sql` — **применена к production**.

RPC `public.remove_library_practice(p_practice_id uuid)`:

- `SECURITY DEFINER`, `search_path = public, pg_temp`;
- `user_id` только из `auth.uid()` (параметра `user_id` нет);
- удаляет **только** строку `user_practices` с `access_source = 'free_claim'`;
- `starter` / `purchase` / `gift` / `subscription` / `program` / `admin` → `not_removable`;
- не трогает плейлисты, прогресс, историю;
- `EXECUTE` только у `authenticated` (не у `anon`).

API: `POST /api/library/remove` `{ practice_id }` → success / `not_in_library` / `not_removable` / `unauthorized` / `internal_error`.

## library_saves + preview window (каталог, фундамент Phase 1)

Миграция: `supabase/migrations/20260823200000_library_saves_and_preview_window.sql`.

Save ≠ право слушать. Сердце / bookmark только сохраняет продукт в Аудиотеку.
Покупка по-прежнему выдаёт доступ через `user_practices` / `orders`.
Не добавляет `favorites`, не использует `access_source=saved`, не меняет entitlement.

### public.library_saves

| Колонка | Тип | Правила |
|---------|-----|---------|
| `user_id` | uuid NOT NULL | FK `auth.users(id)` ON DELETE CASCADE |
| `practice_id` | uuid NOT NULL | FK `practices(id)` ON DELETE CASCADE |
| `created_at` | timestamptz NOT NULL | default `now()` |

UNIQUE `(user_id, practice_id)`. Индексы: `(user_id, created_at DESC)`, `(practice_id)`.

RLS: пользователь видит / создаёт / удаляет только свои строки.
`GRANT SELECT, INSERT, DELETE` → `authenticated`. Нет UPDATE. Нет claim RPC.

### audio_items preview window

На существующей таблице `audio_items` (поле `is_preview` уже было):

| Колонка | Тип | Правила |
|---------|-----|---------|
| `preview_start_ms` | integer NULL | миллисекунды; вместе с `preview_end_ms` или оба NULL |
| `preview_end_ms` | integer NULL | длительность окна 30 000–90 000 мс включительно |

Существующие строки не ломаются: оба поля NULL. UI выбора preview в этом этапе нет.

## external_identities (MAX Mini App, этап 2)

Миграция: `supabase/migrations/20260822200000_external_identities.sql`.

Таблица внешних идентификаторов мессенджера. На этапе 2 пишется только
после серверной HMAC-проверки `initData`. Строка **не** создаёт
`auth.users` и **не** связывает MAX id с аккаунтом АудиоЛада.

### public.external_identities

| Колонка | Тип | Назначение |
|---------|-----|------------|
| `id` | uuid PK | `gen_random_uuid()` |
| `provider` | text NOT NULL | этап 2: `'max'`; non-empty trimmed |
| `provider_user_id` | text NOT NULL | десятичная целочисленная строка MAX `user.id`, не UUID |
| `user_id` | uuid NULL | FK `auth.users(id)` ON DELETE CASCADE; этап 2 всегда NULL |
| `created_at` / `updated_at` | timestamptz | defaults `now()` |
| `last_verified_at` | timestamptz | обновляется при каждом успешном touch |
| `linked_at` | timestamptz NULL | этап 3; touch не выставляет и не затирает |

UNIQUE `(provider, provider_user_id)`. Частичный UNIQUE
`(provider, user_id) WHERE user_id IS NOT NULL`.

RLS включён, политик нет. `REVOKE ALL` у `PUBLIC` / `anon` / `authenticated`.
Запись только через RPC.

### RPC `public.touch_external_identity(p_provider, p_provider_user_id)`

- `SECURITY DEFINER`, `search_path = public, pg_temp`.
- `REVOKE ALL FROM PUBLIC/anon/authenticated`; `GRANT EXECUTE` только `service_role`.
- Атомарно: `INSERT ... ON CONFLICT (provider, provider_user_id) DO UPDATE SET last_verified_at = now(), updated_at = now()`.
- UPDATE **не** трогает `user_id` и `linked_at`.
- Возвращает `{ linked boolean }` (`user_id IS NOT NULL`).
- Пустые provider / provider_user_id — ошибка.

Приложение: `src/lib/max/touch-external-identity.ts` через
`createServiceRoleClient()`. Маршрут `POST /api/max/session/verify` после
успешного HMAC вызывает RPC и отвечает `{ ok: true, linked }`.

Откат до появления связей этапа 3: `DROP FUNCTION public.touch_external_identity(text, text); DROP TABLE public.external_identities;`. Прикладного destructive rollback нет.

### RPC `public.link_external_identity` (этап 3A)

Миграция: `supabase/migrations/20260823120000_link_external_identity.sql`.
Этап 3B **не** добавляет миграцию и не меняет схему: клиент вызывает уже
существующий `POST /api/max/session/link`.

## Прайс и акции (base price + promotions, 2026-08-23)

Миграции: `20260823180000_practice_price_promotions.sql`, `20260823181000_create_practice_order_price_promotions.sql`, `20260823183000_price_promotion_oneshot_bind.sql`, `20260823190000_start_practice_price_promotion_qualify_identifiers.sql`, `20260830120000_personal_timer_promotion_copy.sql`.

Деньги:

- Базовая цена продукта — `practices.price`, целое число рублей (не float).
- Платежи и снимки заказа — целое число копеек: `amount_minor = price * 100`.
- Диапазон платной цены: 49–100 000 ₽. Рекомендованные чипы (199/299/888/…) только подставляют значение.

`practices.price` остаётся базовой/листовой ценой. Вторая цена на продукте не заводится. Акции — отдельная сущность `practice_price_promotions`. Не путать с `promotion_campaigns` (маркетинговые UTM-кампании).

### practice_price_promotions

| Колонка | Тип | Правила |
|---------|-----|---------|
| `id` | uuid PK | `gen_random_uuid()` |
| `practice_id` | uuid NOT NULL | → `practices(id)` ON DELETE CASCADE |
| `name` | text | 1–80 символов |
| `promotion_type` | text | `calendar` \| `personal_countdown` |
| `sale_price` | integer | 49–100000, должна быть строго ниже `practices.price` на resolve |
| `starts_at` / `ends_at` | timestamptz | обязательны для `calendar`, `ends_at > starts_at` |
| `duration_seconds` | integer | обязателен для `personal_countdown`, 60–2 592 000 |
| `above_timer_text` | text NULL | опциональный текст над таймером; 1–280 после trim; `NULL` → дефолт с `{time_left}` |
| `below_button_text` | text NULL | опциональный текст под CTA; 1–280 после trim; `NULL` → дефолт с `{full_price}` |
| `is_active` | boolean | default true |
| `start_token` | text UNIQUE | универсальный триггер персонального таймера |
| `created_at` / `updated_at` | timestamptz | |

RLS: публичный SELECT активных акций опубликованных практик; авторы CRUD своих. Купоны / проценты / сегменты / стекинг не реализованы и схемой не блокируются.

### practice_price_promotion_starts

Персональное окно посетителя после триггера. Каталог эти строки не использует.

| Колонка | Тип | Правила |
|---------|-----|---------|
| `id` | uuid PK | |
| `promotion_id` | uuid | → promotions ON DELETE CASCADE |
| `visitor_id` | text | cookie `audiolad_price_visitor` (httpOnly UUID) |
| `user_id` | uuid NULL | → `auth.users`, ON DELETE SET NULL |
| `started_at` / `expires_at` | timestamptz | `expires_at > started_at` |

Уникальность: `(promotion_id, visitor_id)` и частичный unique `(promotion_id, user_id) WHERE user_id IS NOT NULL`. Персональный таймер одноразовый для пары (акция, посетитель/пользователь): повторный `?promo=` / start после expiry не создаёт новое окно и не продлевает `started_at` / `expires_at`. Тот же токен может стартовать другого посетителя. Таблица недоступна anon/authenticated; чтение/запись только через SECURITY DEFINER RPC.

Гость → логин: cookie `audiolad_price_visitor` биндится на `user_id` (`bind_practice_price_promotion_starts`) без нового окна. Resolve/checkout смотрят visitor_id OR user_id, но только исходное окно (самое раннее `started_at`). Истёкшее окно не оживает.

### Снимки заказа

На `orders` при создании:

- `price_minor_snapshot` / `amount_minor` — итоговая сумма к оплате (копейки)
- `base_price_minor_snapshot` — базовая цена на момент создания (NOT NULL, backfill из старого snapshot)
- `promotion_price_minor_snapshot` — цена акции или NULL
- `promotion_id` / `promotion_type` — или оба NULL. FK `promotion_id` ON DELETE SET NULL.

История не переписывается при поздней смене цены/акции.

### RPC

- `resolve_practice_effective_price(practice_id, surface, visitor_id, user_id, now)` — `catalog` игнорирует personal countdown; иначе lowest `sale_price` wins, без стекинга. При наличии visitor+user сначала bind. Personal: только исходное окно. GRANT anon+authenticated.
- `start_practice_price_promotion(start_token, visitor_id, user_id)` — одноразовый старт; если строка уже есть, возвращает исходные `started_at` / `expires_at` (в том числе после expiry). `INSERT … ON CONFLICT DO NOTHING`. Колонки таблицы в теле функции квалифицируются алиасами (`starts.promotion_id` и т.д.), чтобы OUT-поля `RETURNS TABLE` не конфликтовали с INSERT/RETURNING. GRANT anon+authenticated.
- `bind_practice_price_promotion_starts(visitor_id, user_id)` — вешает `user_id` на самое раннее guest-окно cookie. Не создаёт и не продлевает окно. GRANT authenticated. Вызывается из start/resolve/auth callback.
- `create_practice_order(..., p_expected_amount_minor, p_price_visitor_id)` — резолвит цену на сервере; при расхождении с `expected` → `price_changed` (не создаёт заказ). Pending reuse фиксирует сумму уже созданного заказа.

### quick_offers / quick_offer_materials (2026-08-23)

Миграция: `20260823191000_quick_offers.sql` (restamp of unapplied `20260823140000_quick_offers.sql`; never present in production history).

Переиспользуемый шаблон продающей страницы «Быстрый оффер» (`template_key = catalog/quick-offer`).

Отдельной таблицы скидок в проекте нет. Обычная цена оплаты живёт в `practices.price`. `quick_offers.promo_price` — цена витрины/оффера в рублях, применяется только на этой странице, пока активно окно таймера посетителя. Checkout не принимает сумму от клиента: `create_practice_order` создаёт pending-заказ, затем `apply_quick_offer_amount` переписывает `amount_minor` / `price_minor_snapshot` на сервере.

| Таблица | Назначение |
|---------|------------|
| `quick_offers` | Оффер автора: продукт, slug, обложка, описание, promo_price, CTA, timer, status |
| `quick_offer_materials` | Упорядоченные карточки 3:4. Подпись = автономер + `format_label` (≤ 6 символов, без переносов) |

RLS: `user_can_read_author_promotion(author_id)` (owner/editor или platform admin). Публичное чтение только через `get_public_quick_offer(slug)` — `status = published` и продукт с `catalog_visibility = listed`. `selected_users` и `unlisted` не раскрываются через public quick offer. Direct-link acquisition unlisted не меняется.

Ownership: триггер `enforce_quick_offer_product_owner` запрещает привязать чужой `practices.author_id`.

Публичный маршрут: `/offers/[slug]`.

### operational_email_deliveries — listener welcome

Таблица `public.operational_email_deliveries` (миграция `20260722103000_operational_email_deliveries.sql`) хранит прямые SMTP-попытки с уникальным `dedup_key`. `message_type` — свободный text, без CHECK на набор типов.

Одноразовое welcome-письмо слушателя переиспользует эту таблицу:

| Поле | Значение |
|------|----------|
| `message_type` | `listener_welcome` |
| `dedup_key` | `listener_welcome:{user_id}` |
| `application_id` | NULL (не заявка автора) |

Claim (INSERT) выполняется до SMTP. Повторный вызов с тем же `user_id` не отправляет письмо. Не использовать author sale / moderation outbox workers для welcome.

## Схема, триггеры, RLS

Таблица `profiles` задокументирована выше. Таблица `practices` — частично. `playlists` / `playlist_items` — в этом разделе. Остальные таблицы требуют изучения через Supabase Studio.

## Миграции

Инкрементальные файлы: `supabase/migrations/`. Baseline для пустых БД: `supabase/baseline/` (не применять к production).

## Резервное копирование

Будет заполнено позже.
