# ARCHITECTURE.md

Архитектура приложения «АудиоЛад».

## Обзор

```
Браузер → Nginx (audiolad.ru) → Next.js :3000 (PM2: audiolad)
              ↓                           ↓
    /auth/v1/, /rest/v1/            proxy.ts (сессия)
              ↓                           ↓
         Supabase Kong              Self-hosted Supabase (Docker)
```

## Физическая инфраструктура

Подтверждённая структура на сервере Timeweb Cloud:

```
Timeweb Cloud
├── Nginx
│   ├── /auth/v1/ → Supabase Kong :8000
│   ├── /rest/v1/ → Supabase Kong :8000
│   └── /         → Next.js :3000
├── PM2
│   └── Next.js, процесс audiolad, порт 3000
└── Docker
    └── self-hosted Supabase
        ├── supabase-kong (API gateway)
        ├── supabase-rest (PostgREST)
        ├── supabase-auth (GoTrue)
        ├── supabase-db (Postgres)
        └── supabase-studio
```

## Основной поток запроса

```
Браузер
  → Nginx
  → Next.js (или Supabase Kong для /auth/v1/ и /rest/v1/)
  → серверная или клиентская логика приложения
  → Supabase
  → база данных
  → ответ пользователю
```

Конкретный путь зависит от маршрута и типа компонента (client component, server component, прокси сессии).

## Слои приложения

| Слой | Расположение | Назначение |
|------|--------------|------------|
| Страницы | `src/app/**/page.tsx` | UI и маршрутизация (App Router) |
| Server Actions | `src/app/**/actions.ts` | Серверные мутации (профиль) |
| Компоненты | `src/components/` | Переиспользуемые UI-блоки |
| Supabase-клиенты | `src/lib/supabase/` | browser, server, proxy |
| Прокси сессии | `proxy.ts` | Точка входа для обновления сессии |
| Статика | `public/` | Изображения, иконки, manifest |

## Маршруты

### Подключены к Supabase

| Маршрут | Тип | Интеграция |
|---------|-----|------------|
| `/auth/sign-up` | client | `supabase.auth.signUp()` |
| `/auth/sign-in` | client | `supabase.auth.signInWithPassword()` |
| `/catalog` | server | Listing через adapter → CatalogCard; legacy fetch всё ещё `practices` |
| `/profile` | server | `getUser()` + чтение `public.profiles` |
| `/profile/edit` | server + action | Чтение профиля, сохранение через Server Action |

### Только UI (демо-данные)

`/`, `/my-practices`, `/favorites`, `/history`, `/downloads`, `/purchases`, `/playlists`, `/playlists/new`, `/playlist/morning-energy`, `/authors`, `/authors/*`, `/author-dashboard`, `/author-dashboard/**`, `/practice/personal-boundaries`, `/player/personal-boundaries`, `/program/inner-support`, `/checkout/personal-boundaries`, `/settings`.

### Плейлисты

- Схема PR1 + CRUD PR2: list/create/rename/delete/visibility.
- Чтение: Server Component + user session + RLS.
- Мутации CRUD: `POST/PATCH/DELETE /api/playlists` (не прямой клиентский CRUD).
- Membership PR3.1: `GET/PUT /api/playlists/membership` + RPC `set_practice_playlist_membership`.
- Entry point добавления: меню `···` в Аудиотеке (`/my-practices`) → `AddToPlaylistSheet`.
- Private add требует entitlement (`resolveProductAccess`); public add — free catalog rules; плейлист не даёт listen-доступ.
- Public slug серверный (`slugifyTitle` + random suffix).
- `/playlists/new` → redirect `/playlists`.
- PR3.2 на production (`fafe6a5`): `/playlists/[id]` — items, listen, delete item.
- PR3.3 на production (`cbd4db1`, release `20260716-042225-cbd4db1`): custom cover + automatic mosaic; CAS `replace_playlist_cover_path`; private `playlist-covers`; sharp 1200×1200 WebP; signed URLs.
- PR4 на production (`d4b9860`, release `20260716-045024-d4b9860`): `POST /api/playlists/[id]/items/[practiceId]/move` + RPC `move_playlist_item` — атомарный ↑↓ swap соседних `playlist_items.position` по `practice_id`; без DnD / полного массива positions.
- PR5 на production (`6a692a2`, release `20260716-053853-6a692a2`): публичная страница `/p/[slug]` — только `visibility=public` + `published_at IS NOT NULL`; RLS+server loader (`cache()`); signed custom cover после gate; auto mosaic; unavailable drift; copy link (public+slug+published_at); без entitlement / save-чужой.
- Play All на production (`768a80d`, release `20260716-082442-768a80d`; feature `cf8b947` + corrective `93fc9c6`/`7212af9`/`768a80d`): queue controller поверх `GlobalAudioPlayerProvider` + `useSequentialPlayer`; `PlaylistQueueEntry` (`kind=product`); builders owner/public; GET `/api/listen/product/.../session`; **`pendingQueueNavigationRef` (from→to) + `confirmInternalQueueNavigation`** — ListenPageClient не чистит queue на ещё смонтированной странице A; **persistent `<audio>`** вне keyed engine remount; exhaust dedupe сброс при возврате на продукт; in-memory queue; standalone clears queue; Previous → track 0 предыдущего продукта; compact `PlaylistItemRow` на owner/public.
- Providers разделены: root `BaseProviders` содержит общую analytics/auth/error инфраструктуру, а `PlatformProviders` монтирует `GlobalAudioPlayerProvider`, PWA и retention только для `(platform)` route group. Полноэкранный `(studio)` subtree не монтирует глобальный плеер; `StudioAudioProvider` монтируется только на `/studio/project/new`.
- Studio имеет два режима входа: `/studio` — выбор между редактором аудиопрактик и будущим прямым эфиром; `/studio/project/new` — новый локальный проект; `/studio/live` — отдельный route subtree для эфиров, пока заглушка. Будущие `/studio/projects` и `/studio/project/[id]` зарезервированы для списка и сохранённых проектов.
- Будущий аудиоэфир должен после завершения создавать редактируемый Studio-проект и проходить тот же pipeline монтажа, обработки, сведения и публикации. Редактор обычного проекта и запись эфира используют единый формат проекта, различающий источник (обычная запись или прямой эфир); модель БД и live-инфраструктура пока не определены.

На `/profile` и `/profile/edit` имя и email — реальные; статистика, авторы и часть полей формы — демонстрационные или disabled.

## Поток аутентификации

1. Пользователь заполняет форму на `/auth/sign-up` или `/auth/sign-in`.
2. Браузерный клиент (`src/lib/supabase/client.ts`) вызывает Supabase Auth API через `/auth/v1/`.
3. `proxy.ts` на каждый запрос вызывает `supabase.auth.getClaims()` для обновления сессии через cookies.
4. Серверный клиент (`src/lib/supabase/server.ts`) используется на страницах профиля для чтения сессии и данных.

## Поток регистрации

```
Форма регистрации
  → браузерный Supabase-клиент
  → Supabase Authentication (/auth/v1/)
  → автоматическое создание записи public.profiles (триггер handle_new_user)
  → /auth/sign-in?registered=1
  → сообщение об успешной регистрации
  → вход пользователя
  → /profile
```

## Поток профиля

### Чтение (`/profile`)

```
Запрос /profile
  → Server Component
  → createClient() (server)
  → supabase.auth.getUser()
  → при отсутствии user → redirect /auth/sign-in
  → supabase.from("profiles").select(...).eq("id", user.id)
  → отображение имени (profiles.full_name → metadata → email)
  → отображение email и инициала аватара
```

### Редактирование (`/profile/edit`)

```
Запрос /profile/edit
  → Server Component
  → getUser() + чтение profiles
  → предзаполнение формы (first_name, last_name из metadata / full_name)
  → email read-only

Сохранение (Server Action updateProfile)
  → валидация непустого имени
  → UPDATE public.profiles SET full_name = ... WHERE id = user.id
  → проверка возврата id (строка должна существовать)
  → supabase.auth.updateUser({ data: { first_name, last_name, full_name } })
  → redirect /profile?updated=1
```

Ошибки возвращаются через безопасные коды в query-параметрах (`empty_name`, `profile_not_found`, `profile_update_failed`, `metadata_update_failed`).

## Источник истины

- Постоянные пользовательские и бизнес-данные должны храниться в Supabase/Postgres.
- Демонстрационные данные являются временными.
- Локальные массивы, JSON и состояние интерфейса не должны становиться параллельным постоянным хранилищем.
- Актуальная схема данных документируется в `docs/DATABASE.md`.

## Архитектурные принципы

- Постепенно заменять демонстрационные данные реальными.
- Не создавать параллельную систему авторизации.
- Не создавать дублирующие модели и маршруты без необходимости.
- Расширять существующую архитектуру.
- Новый функционал проектировать для реальных данных, если иное отдельно не согласовано.
- Архитектурные изменения сначала согласовывать.

## Архитектурные ограничения

Без согласования запрещено:

- создавать вторую систему авторизации;
- обходить действующий механизм сессии;
- хранить постоянные бизнес-данные только в локальных файлах;
- создавать новые таблицы без изучения существующей схемы;
- связывать MAX user_id с аккаунтом без серверной проверки данных MAX;
- доверять данным запуска мини-приложения только на клиентской стороне.

## Обложки аудиопродукта (per-track covers)

- Общая обложка: `practices.cover_url` (обязательна для публикации), bucket `practice-covers`, path `practices/{id}/cover.{ext}`.
- Режим: `practices.use_shared_cover` (default `true`). При `false` — необязательные обложки треков в `audio_items.cover_url`, path `practices/{id}/track-covers/{audioItemId}.{ext}`.
- Резолв для плеера: `resolvePlaybackCoverUrl()` в `src/lib/products/cover-display.ts` → `ListenTrack.coverImageUrl` (сервер).
- Каталог Phase 0: карточка читает `cover` + опциональную `gallery`
  (квадратные слайды витрины, не отдельная сущность). Источник данных
  пока legacy `practices`; новые таблицы Course/Offer/Grant не создаются.
- Phase 1: `practices.publication_class` nullable; adapter
  `publication_class > product_kind`. Старые NULL-строки читаются по
  `product_kind`. Course/audiobook не выводятся из `format`.
- UI карточки переключает layout только по `CatalogCard.class`.
- Фильтры витрины: `access` (Подарки/Продукты) и `class`
  (`practice|course|audiobook|release|post`). Legacy `?kind=music`
  читается как `class=release`.
- Author UI: мастер `AuthorCreateWizard` (Продукт / Музыка / Аудиопост)
  → `AuthorProductForm` + `CoverUploadBlock` / `useCoverUpload`; API
  `POST/DELETE .../audio/[audioId]/cover`.
- Phase 1B Product Gallery: `publication_gallery_slides` +
  `isProductGalleryEligible` (`practice` / `course` / `audiobook`).
  Author API `GET/POST .../gallery`, `PATCH .../gallery/reorder`,
  `PATCH/DELETE .../gallery/[slideId]`. Каталог кладёт слайды в
  `CatalogCard.gallery` только для product-классов; `release` / `post`
  всегда `[]`. Cover не является слайдом.

## MAX Mini App (этапы 1–3B)

Изолированная оболочка на `max.audiolad.ru` (см. `src/lib/max/`, `/max-site`).
Каталог, Студия, статьи и прочие маршруты приложения на этом хосте остаются 404.

**Этап 1 (реализован):** серверная HMAC-проверка сырого `window.WebApp.initData`
по официальному алгоритму MAX (`https://dev.max.ru/docs/webapps/validation`).

- Чистый модуль: `src/lib/max/verify-init-data.ts` (только сервер, без Supabase).
- Эндпоинт: `POST /api/max/session/verify`, тело `{ initData }`.
- Токен: только `MAX_BOT_TOKEN` на сервере. `NEXT_PUBLIC_MAX_BOT_TOKEN` запрещён.
- Proxy на MAX-хосте открывает **только** точные пути
  `/api/max/session/verify` и `/api/max/session/link`, не `/api/*`.
- `initDataUnsafe`, platform и version не являются доверенной идентичностью.
- `user.id` хранится как десятичная целочисленная строка из подписанного JSON
  (сырые цифры, не `Number`, не UUID).

**Этап 2 (реализован):** после успешной HMAC-проверки сервер атомарно
`upsert` строку в `public.external_identities` через SECURITY DEFINER RPC
`touch_external_identity` (вызов только `service_role`).

- `provider = 'max'`, `provider_user_id` = проверенный MAX `user.id` (text).
- `user_id` и `linked_at` на этапе 2 не выставляются (остаются NULL).
- Повтор того же MAX id — одна строка, обновляются только `last_verified_at`
  и `updated_at`. Существующие `user_id` / `linked_at` не затираются.
- Успех API: `{ ok: true, linked }` (`linked` true только если у строки уже
  есть `user_id`; для новых строк этапа 2 всегда false).
- HMAC/свежесть не прошли → 4xx, RPC не вызывается.
- HMAC ок, persist нет → 5xx `{ ok: false, reason: "storage_unavailable" }`.
- Ответ не содержит MAX id, `user_id` АудиоЛада, профиль, initData.
- `auth.users` не создаются; вход / регистрация / связка — не этот этап.
- Replay-таблица не вводится.

**Этап 3A (реализован):** `POST /api/max/session/link` после HMAC связывает
проверенный MAX id с `auth.users.id` текущей сессии через RPC
`link_external_identity`. Без UI. Конфликты — `409`
`identity_already_linked` / `user_already_has_max_identity`.

**Этап 3B (реализован):** вход существующего аккаунта внутри MAX-оболочки
(`signInWithPassword` на абсолютный apex `/auth/v1`, затем `POST /link`
с сырым `initData`). Регистрации нет. Каталога нет. Cookie `Domain`
не меняется (host-only на `max.audiolad.ru`). Сессия не выпускается
из одного MAX id. Обычный браузер без `initData` остаётся гостевой
оболочкой и не пишет БД с клиента.

Поздние этапы (регистрация внутри MAX, библиотека) **не реализованы**.

### Связь идентификаторов

```
MAX user_id  ↔  профиль АудиоЛада  ↔  пользователь Supabase Auth
```

## Что отсутствует в архитектуре

- Глобальная защита приватных маршрутов — не реализована (профиль проверяет сессию локально, но маршрут не защищён на уровне proxy).
- Полная интеграция с MAX (бот, автоматический вход, библиотека) — не реализована.

## Зависимости

Определяются по `package.json` и `package-lock.json`. Основные: Next.js, React, `@supabase/ssr`, `@supabase/supabase-js`, Tailwind CSS.
