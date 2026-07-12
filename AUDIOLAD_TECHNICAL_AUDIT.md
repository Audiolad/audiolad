# АудиоЛад — технический аудит проекта

**Дата аудита:** 2026-07-12  
**Стабильный HEAD на момент аудита:** `68c4d86` — `refactor(player): simplify playback control icons`  
**Режим:** только исследование. Код приложения, схема БД, миграции и зависимости не изменялись.

---

## 1. Краткое резюме

### Текущее состояние

«АудиоЛад» — production-ready **mobile-first** веб-приложение на **Next.js 16 (App Router)** + **self-hosted Supabase** на сервере Timeweb Cloud. Основной стек: TypeScript, React 19, Tailwind CSS 4, `@supabase/ssr`.

Реально работают: регистрация и вход, автосоздание профиля, защита приватных маршрутов через proxy, каталог опубликованных практик из БД, личная библиотека (`user_practices`), защищённое прослушивание на `/listen/[slug]` с signed URL и HTML5-плеером.

Большая часть UX (главная, избранное, история, покупки, плейлисты, кабинет автора, checkout) — **демонстрационные экраны** со статичными данными. Покупки и платежи **не реализованы**.

### Что уже работает

| Подсистема | Статус |
|------------|--------|
| Инфраструктура (Nginx → Next.js + Supabase Docker) | ✅ Production |
| Регистрация / вход / сессия | ✅ |
| Профиль (чтение + редактирование имени) | ✅ |
| Каталог (published practices) | ✅ |
| Личная библиотека (starter grant + RLS) | ✅ |
| Entitlement + private audio storage | ✅ |
| Аудиоплеер на `/listen/[slug]` | ✅ |
| Защита приватных маршрутов (proxy) | ✅ |

### Готовность к MVP (по заявленным целям)

| Цель MVP | Готовность |
|----------|------------|
| 1. Стабильный аудиоплеер | ✅ Реализован (доступ через прямой URL `/listen/{slug}`) |
| 2. Первые практики Сергея и Зои | ✅ Частично — в БД есть стартовые практики; UI авторов частично статичен |
| 3. Регистрация и вход | ✅ |
| 4. Покупка практики | ❌ Не реализовано |
| 5. Добавление в библиотеку после покупки | ⚠️ Механизм `user_practices` есть; UI покупки и grant по purchase — нет |
| 6. Мобильная + веб-версия | ⚠️ Mobile-first готов; desktop — узкая колонка, без расширенного layout |
| 7. Первое реальное использование | ⚠️ Возможно для бесплатных/стартовых практик; платный цикл не закрыт |

**Общая оценка готовности к MVP: ~55–60%** — фундамент сильный, коммерческий контур отсутствует.

### Главные риски

1. **Покупки и платежи отсутствуют** — ключевая продуктовая цель MVP не закрыта.
2. **Нет связки UI → `/listen`** — библиотека и карточка практики не ведут к плееру.
3. **Схема `practices` / `authors` не полностью в репозитории** — риск расхождения docs ↔ production.
4. **`/author-dashboard` не защищён** — публичный доступ к админ-интерфейсу (пока демо).
5. **Нет событий, прогресса, purchases** — аналитика и воронки невозможны без новых таблиц.

---

## 2. Технологический стек

| Компонент | Версия / значение |
|-----------|-------------------|
| Фреймворк | **Next.js 16.2.10** (App Router) |
| React | **19.2.4** |
| Язык | **TypeScript 5** |
| Стили | **Tailwind CSS 4** |
| БД / Auth / Storage | **Self-hosted Supabase** (`@supabase/ssr` 0.12, `@supabase/supabase-js` 2.110) |
| Роутинг | **App Router** (`src/app/`) — Pages Router не используется |
| ORM | **Нет** (Prisma отсутствует) |
| Процесс | PM2 `audiolad`, порт 3000 |
| Прокси | Nginx → Next.js + Supabase Kong :8000 |

---

## 3. Структура проекта

### Краткое дерево ключевых папок

```text
/var/www/audiolad/
├── AUDIOLAD_TECHNICAL_AUDIT.md      ← этот отчёт
├── AGENTS.md                        ← главная инструкция для исполнителей
├── package.json
├── src/
│   ├── proxy.ts                     ← Next.js proxy (session + route guard)
│   ├── app/                         ← App Router (страницы)
│   │   ├── layout.tsx               ← корневой layout
│   │   ├── page.tsx                 ← главная (демо + частично статика)
│   │   ├── auth/
│   │   │   ├── sign-in/page.tsx
│   │   │   ├── sign-up/page.tsx
│   │   │   └── sign-out/actions.ts  ← Server Action
│   │   ├── profile/
│   │   │   ├── page.tsx             ← Server Component + Supabase
│   │   │   └── edit/                ← форма + Server Action
│   │   ├── catalog/page.tsx         ← REST fetch к Supabase
│   │   ├── my-practices/page.tsx    ← user_practices + Supabase
│   │   ├── practice/[slug]/page.tsx   ← карточка практики
│   │   ├── listen/[slug]/page.tsx   ← entitlement + signed URL + плеер
│   │   ├── author-dashboard/        ← демо-кабинет автора (без auth)
│   │   ├── authors/                 ← статичные страницы авторов
│   │   ├── checkout/                ← демо-оформление
│   │   ├── favorites, history, purchases, playlists, downloads, settings …
│   │   └── player/personal-boundaries/  ← legacy mock-плеер (не production path)
│   ├── components/
│   │   ├── audio/AudioPlayer.tsx    ← production HTML5-плеер
│   │   └── BottomNav.tsx            ← нижняя навигация
│   └── lib/
│       ├── supabase/
│       │   ├── client.ts            ← browser
│       │   ├── server.ts            ← server (cookies)
│       │   └── proxy.ts             ← session refresh
│       └── auth/routes.ts           ← private/auth маршруты
├── supabase/migrations/             ← 6 SQL-миграций
├── docs/                            ← ARCHITECTURE, DATABASE, PROJECT_STATE, …
└── public/                          ← статика, иконки, manifest
```

### App Router — основные маршруты

| Маршрут | Тип | Данные |
|---------|-----|--------|
| `/` | Static/demo | Статические массивы |
| `/catalog` | Server + REST | `practices` (published) |
| `/practice/[slug]` | Server + Supabase | `practices` + optional entitlement |
| `/listen/[slug]` | Server + Supabase | entitlement + signed URL + AudioPlayer |
| `/my-practices` | Server + Supabase | `user_practices` |
| `/profile`, `/profile/edit` | Server + Supabase | `profiles` |
| `/settings` | Server + Supabase | `profiles` |
| `/auth/sign-in`, `/auth/sign-up` | Client | Supabase Auth |
| `/author-dashboard/*` | Static/demo | Захардкоженные данные |
| `/checkout/*` | Static/demo | Захардкоженные данные |
| `/favorites`, `/purchases`, `/history`, … | Static/demo | Захардкоженные данные |

### Где что расположено

| Слой | Расположение |
|------|--------------|
| Серверные компоненты | `src/app/**/page.tsx` (большинство production-страниц) |
| Клиентские компоненты | `AudioPlayer.tsx`, auth-формы (`"use client"`), `BottomNav` |
| Бизнес-логика | **Внутри page-файлов** — отдельного service-слоя нет |
| Запросы к БД | `createClient()` в RSC; raw `fetch` в catalog; Server Actions в profile |
| Плеер | `src/components/audio/AudioPlayer.tsx` |
| Auth-страницы | `src/app/auth/` |
| Профиль | `src/app/profile/` |
| Админ/автор | `src/app/author-dashboard/` (демо, без backend) |
| API Routes | **Отсутствуют** (`src/app/api/` нет) |

---

## 4. Инфраструктура

### Внешние сервисы

| Сервис | Использование |
|--------|---------------|
| **Self-hosted Supabase** (Docker на Timeweb) | PostgreSQL, Auth (GoTrue), REST (PostgREST), Storage |
| **Timeweb Cloud** | Хостинг VPS, Nginx, PM2 |
| **Облачный supabase.com** | **Не используется** как рабочая БД (зафиксировано в `docs/DECISIONS.md`) |
| **Timeweb Object Storage** | **Не используется** |
| Платёжные системы | **Не подключены** |

### База данных

- **PostgreSQL** через self-hosted Supabase на том же сервере (`72.56.232.160`).
- Supabase Studio: `http://72.56.232.160:8000` (документировано, не в Git).
- Docker-конфигурация Supabase **не в репозитории** — только на сервере.

### Переменные окружения (только имена и назначение)

| Переменная | Назначение |
|------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase API (Auth, REST, Storage через Nginx) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key для browser и server clients |

**Отсутствуют в коде (имена не найдены):**

- `SUPABASE_SERVICE_ROLE_KEY`
- Database URL напрямую
- JWT secret
- Платёжные ключи
- SMTP / email provider keys

### Хранение файлов

| Тип | Где |
|-----|-----|
| Аудио практик | Private Supabase Storage bucket `practice-audio`, путь `practices/{practice_id}/audio.mp3` |
| Обложки | Поле `practices.cover_url` (в запросах приложения; формат URL/path — уточнить в Studio) |
| Статика UI | `public/` (favicon, manifest, иконки) |
| Публичные постоянные ссылки на платное аудио | **Нет** — доступ через signed URL (TTL 3600 с) |

### Защищённая выдача аудио

Реализована на сервере в `src/app/listen/[slug]/page.tsx`:

1. Проверка сессии (`getUser()`).
2. Проверка entitlement (`user_practices`).
3. `createSignedUrl(audioPath, 3600)` через Supabase Storage SDK.
4. Нормализация URL на `https://audiolad.ru/storage/v1/...`.

Storage RLS дополнительно проверяет entitlement при прямом обращении к bucket.

---

## 5. Авторизация и пользователи

### Регистрация

- Страница: `src/app/auth/sign-up/page.tsx` (client).
- Метод: `supabase.auth.signUp({ email, password, options: { data: { first_name, last_name, full_name } } })`.
- Профиль в `public.profiles` создаётся **триггером БД** `on_auth_user_created` → `handle_new_user()`, не кодом приложения.
- При наличии сессии после signUp → редирект `/my-practices` (автовход).
- Иначе → `/auth/sign-in?registered=1`.
- Ошибки: отображается `error.message` от Supabase.

### Вход

- `src/app/auth/sign-in/page.tsx` — `signInWithPassword`.
- Поддержка `?next=` с валидацией (`getSafeNextPath` в `src/lib/auth/routes.ts`).
- После входа → `/profile` или safe `next`.

### Сессия

- `src/proxy.ts` → `updateSession()` на каждый запрос.
- `supabase.auth.getUser()` обновляет cookies.
- Неавторизованный на private route → `/auth/sign-in?next=...`.
- Авторизованный на auth route → редирект на `/profile` или `next`.

### Auth-пользователь и профиль

| Вопрос | Ответ |
|--------|-------|
| Где хранится Auth? | `auth.users` (Supabase Auth) |
| Есть ли `profiles`? | Да, `public.profiles` |
| Связь | `profiles.id` = `auth.users.id` (1:1, ON DELETE CASCADE) |
| Главный ID | **UUID** (`user.id` / `auth.uid()`) — **не email** |
| Email как бизнес-ID? | **Нет** — email дублируется в `profiles.email`, но ключ = UUID |
| Дубли профилей? | Защита: PK `profiles.id` = FK на `auth.users`; триггер на INSERT |
| Admin по email в коде? | **Не обнаружено** |
| Подтверждение email? | Зависит от конфигурации GoTrue на сервере; в коде приложения явной проверки нет. При `data.session` после signUp — вход без подтверждения |

### Защищённые маршруты

**Защищены через proxy** (`src/lib/auth/routes.ts`):

`/profile`, `/my-practices`, `/listen`, `/favorites`, `/history`, `/downloads`, `/purchases`, `/playlists`, `/settings`, `/playlist/*`

**Не защищены:**

- `/author-dashboard/*` — **публичный доступ**
- `/catalog`, `/practice/[slug]`, `/authors/*` — публичные (by design)
- `/checkout/*` — публичный демо

### Проверка авторизации

| Контекст | Механизм |
|----------|----------|
| Сервер (RSC) | `createClient()` + `getUser()` + redirect |
| Proxy | `getUser()` + redirect до рендера |
| Клиент | Только auth-формы; остальной UI полагается на server/proxy |
| RLS | `auth.uid()` в Postgres policies |

### RLS — известные политики

| Таблица / объект | Политика |
|------------------|----------|
| `profiles` | SELECT/INSERT/UPDATE own (`auth.uid() = id`) |
| `user_practices` | SELECT own (`auth.uid() = user_id`); INSERT только через SECURITY DEFINER |
| `practices` | SELECT published (`status = 'published'`) — public |
| `starter_practices` | RLS enabled, **без policies** → deny для authenticated |
| `storage.objects` (practice-audio) | SELECT для entitled authenticated users |

### Доступ к чужим данным

- `profiles`, `user_practices` — RLS ограничивает чтение своими записями.
- Подстановка чужого `user_id` в клиентских запросах **не обнаружена** — приложение использует `user.id` из сессии, не параметры URL.
- Service role в клиенте **отсутствует**.

---

## 6. База данных

### Источники схемы

| Источник | Содержание |
|----------|------------|
| `supabase/migrations/*.sql` | 6 миграций — полный DDL для `user_practices`, `starter_practices`, storage bucket |
| `docs/DATABASE.md` | Частично: `profiles`, `practices` (неполно) |
| Prisma schema | **Отсутствует** |
| TypeScript DB types | **Не сгенерированы** |
| Запросы в коде | Формируют ожидаемую структуру `practices`, `authors` |

### Список таблиц

#### `auth.users` (Supabase system)

| | |
|-|-|
| **Назначение** | Учётные записи Auth |
| **PK** | `id` (uuid) |
| **Использование** | FK target для `profiles`, `user_practices`; триггер `on_auth_user_created` |

#### `public.profiles`

| | |
|-|-|
| **Назначение** | Профиль пользователя платформы |
| **PK** | `id` (uuid) |
| **FK** | `id` → `auth.users(id)` ON DELETE CASCADE |
| **Поля** | `id`, `email`, `full_name`, `role` (default `'listener'`), `created_at` |
| **Unique** | PK |
| **RLS** | own read/write |
| **Код** | `profile/page.tsx`, `profile/edit/*`, `settings/page.tsx` |

#### `public.practices`

| | |
|-|-|
| **Назначение** | Карточка аудиопрактики |
| **PK** | `id` (uuid) — inferred |
| **Поля (из кода)** | `id`, `title`, `slug`, `description`, `format`, `duration_minutes`, `price`, `is_free`, `status`, `cover_url`, `audio_url`, `created_at` |
| **FK** | К `authors` (nested select; точная колонка не в репо) |
| **RLS** | Public read published |
| **Код** | `catalog`, `practice/[slug]`, `listen/[slug]`, `my-practices` |

#### `public.authors`

| | |
|-|-|
| **Назначение** | Автор/авторский бренд практики |
| **PK** | `id` (uuid) — inferred |
| **Поля (из кода)** | `id`, `name`, `slug`, `description`, `avatar_url` |
| **DDL в репо** | **Отсутствует** |
| **Код** | nested select из `practices`; статичные страницы `/authors/*` |

#### `public.user_practices`

| | |
|-|-|
| **Назначение** | **Права доступа / личная библиотека** (отдельно от платежей) |
| **PK** | `id` (uuid) |
| **FK** | `user_id` → `auth.users`; `practice_id` → `practices` |
| **Unique** | `(user_id, practice_id)` |
| **Поля** | `access_source`, `granted_at`, `expires_at`, `metadata` (jsonb) |
| **CHECK** | `access_source IN ('starter','free_claim','purchase','gift','subscription','program','admin')` |
| **Индексы** | `(user_id, granted_at DESC)`, `(practice_id)` |
| **Код** | `my-practices`, `listen`, `practice` |

#### `public.starter_practices`

| | |
|-|-|
| **Назначение** | Конфигурация стартового набора (3 практики) |
| **PK** | `practice_id` |
| **FK** | → `practices` |
| **Unique** | `sort_order` |
| **Код** | Только SQL-функции grant |

#### `storage.buckets` / `storage.objects`

| | |
|-|-|
| **Назначение** | Private аудиофайлы |
| **Bucket** | `practice-audio` (private, 100 MiB, audio/mpeg) |
| **RLS** | SELECT при active entitlement |

### Сущности — сводка «есть / нет»

| Сущность | Статус |
|----------|--------|
| Пользователи (Auth) | ✅ `auth.users` |
| Профили | ✅ `profiles` |
| Авторы | ✅ `authors` (inferred, DDL не в репо) |
| Проекты / бренды | ❌ Отдельной таблицы нет |
| Роли и права | ⚠️ Только `profiles.role` = `'listener'`; RBAC нет |
| Практики | ✅ `practices` |
| Аудиофайлы | ✅ Storage path в `audio_url` + bucket |
| Товары | ❌ |
| Цены | ⚠️ Поле `practices.price` |
| Заказы | ❌ |
| Платежи | ❌ |
| Права доступа | ✅ `user_practices` |
| Личная библиотека | ✅ `user_practices` (не view на purchases) |
| Прогресс прослушивания | ❌ |
| История событий | ❌ |

### Функции и триггеры (из миграций)

| Объект | Назначение |
|--------|------------|
| `handle_new_user()` | INSERT profile + grant starters |
| `grant_active_starter_practices(uuid)` | Идемпотентная выдача стартовых практик |
| `validate_starter_practice()` | Валидация starter config |
| `on_auth_user_created` | AFTER INSERT на `auth.users` |
| `validate_starter_practice_before_write` | BEFORE INSERT/UPDATE на `starter_practices` |

---

## 7. Авторы, проекты и роли

### Как хранится автор практики

- В БД: связь `practices` → `authors` через PostgREST nested select (вероятно `author_id` или junction — **требует проверки в Studio**).
- В UI: дополнительно статичные страницы `/authors/sergey-and-zoya`, `/authors/sergey-petrov`, `/authors/zoya-petrova` с захардкоженным контентом.

### Автор = пользователь?

**Нет.** `authors` — отдельная сущность контента. `profiles.role = 'listener'`. Связи `profiles` ↔ `authors` в коде и миграциях **нет**.

### Мультипроектность и совместное управление

| Возможность | Статус |
|-------------|--------|
| Один пользователь → несколько авторов/проектов | ❌ Не реализовано |
| Несколько пользователей → один проект с ролями | ❌ Не реализовано |
| Право публиковать практику | ❌ Нет server-side проверки; author-dashboard — демо без auth |

### Роли

- `profiles.role` — единственное поле; в UI отображается как «Слушатель» (`settings/page.tsx`).
- Значение `'admin'` встречается только как `access_source` в `user_practices`, не как роль пользователя.

### «Сергей и Зоя» в коде

Имя **захардкожено** во многих демо-экранах: `catalog/page.tsx` (fallback автор), `favorites`, `purchases`, `history`, `author-dashboard/*`, `checkout`, `profile` (демо-блок авторов), `player/personal-boundaries`, статичные страницы authors.

**Риск:** добавление новых авторов в БД не автоматически отразится в демо-UI; production-путь (`/practice`, `/listen`, `/my-practices`) читает `authors.name` из БД.

### Расширяемость

| Аспект | Оценка |
|--------|--------|
| Добавить автора в БД | ✅ Возможно (таблица `authors` используется в запросах) |
| Добавить без правки демо-UI | ⚠️ Production-пути — да; демо-страницы — нет |
| Кабинет автора | ❌ Требует полной переработки (auth, RBAC, CRUD) |

---

## 8. Контент и медиа

### Модель практики

| Поле | Назначение |
|------|------------|
| `title` | Название |
| `slug` | URL-идентификатор (`/practice/{slug}`, `/listen/{slug}`) |
| `description` | Описание |
| `format` | Тип (отображается в UI) |
| `duration_minutes` | Ожидаемая длительность |
| `price` | Цена (число) |
| `is_free` | Флаг бесплатности |
| `status` | Статус публикации (`published` в каталоге) |
| `cover_url` | Обложка |
| `audio_url` | **Путь в Storage**, не публичный URL |

### Статусы

- В коде каталога: фильтр `status=eq.published`.
- `draft`, `archived` — **не документированы в репо**, могут существовать в БД.

### Бесплатный / платный доступ

- `is_free` + `price` на карточке.
- Фактический доступ — через `user_practices`, не через прямую проверку `is_free` на `/listen`.

### Аудио

| Вопрос | Ответ |
|--------|-------|
| Несколько файлов на практику? | ❌ Один путь `audio_url` |
| Preview | ❌ |
| Карточка отделена от файла? | ✅ `practices` vs object в Storage |
| Замена файла без смены ID практики? | ✅ Тот же `practice_id` в пути |
| Сортировка | ✅ `created_at.desc` в каталоге; `granted_at.desc` в библиотеке; `starter_practices.sort_order` |
| Previous / Next практика | ❌ Кнопки в плеере disabled |

### Универсальность модели

**Частично универсальна:** slug, status, price, entitlement отделены от файла. Ограничения: один audio path, нет программ/сезонов в БД, авторы не связаны с пользователями.

---

## 9. Аудиоплеер

### Компоненты

| Файл | Назначение |
|------|------------|
| `src/components/audio/AudioPlayer.tsx` | **Production-плеер** (используется на `/listen/[slug]`) |
| `src/app/player/personal-boundaries/page.tsx` | Legacy mock-плеер (не production path) |

### Функциональность AudioPlayer

| Функция | Статус |
|---------|--------|
| Воспроизведение / пауза | ✅ `handlePlayPause`, HTML5 `audio.play()` / `pause()` |
| Перемотка (range slider) | ✅ `handleRangeChange` |
| Назад 15 секунд | ✅ `handleSeekOffset(-15)` |
| Вперёд 15 секунд | ✅ `handleSeekOffset(15)` |
| Предыдущая практика | ❌ Кнопка disabled |
| Следующая практика | ❌ Кнопка disabled |
| Текущее время | ✅ `formatTime(currentTime)` |
| Общая длительность | ✅ из `audio.duration` или `expectedDurationSeconds` |
| Скорость (0.75–1.5×) | ✅ `PLAYBACK_RATES`, циклическое переключение |
| Состояние загрузки | ✅ `isLoading`, `statusMessage` |
| Ошибка аудио | ✅ `handleError`, UI retry |
| Сохранение позиции | ❌ |
| Восстановление после refresh | ❌ |
| Синхронизация между страницами | ❌ |
| Глобальное состояние | ❌ Локальный `useState` + `useRef` |
| Cleanup listeners | ✅ `removeEventListener` в return `useEffect` |
| Повторные обработчики | ⚠️ `useEffect` зависит от `[hasValidDuration, playbackRateIndex, playerError, src]` — при их смене listeners переподписываются (корректно, но стоит учитывать) |
| Утечки памяти | ⚠️ Явных не обнаружено; при unmount cleanup есть |

### Мобильность / Safari

- Touch targets: `min-h-11` (44px) на кнопках — соответствует рекомендациям.
- Play/Pause требует user gesture — обработка `catch` на `audio.play()`.
- Safari/iOS: используется стандартный `<audio>` + signed URL; **не тестировалось в рамках аудита** (только анализ кода).
- Layout `/listen`: `max-w-[480px]` — mobile-first.

### Точка входа

Единственный production-путь к плееру: **прямой URL** `/listen/{slug}`. Ссылки из `/my-practices` и `/practice/[slug]` на `/listen` **отсутствуют** (кнопки Play disabled).

---

## 10. Покупки и платежи

| Компонент | Статус |
|-----------|--------|
| Товарная модель | ❌ Нет таблицы products; цена в `practices.price` |
| Корзина | ❌ |
| Заказ | ❌ |
| Платёж | ❌ |
| Платёжная система | ❌ Не подключена |
| Server webhook | ❌ Нет API routes |
| Подтверждение оплаты | ❌ |
| Идемпотентность webhook | ❌ |
| Снимок цены при покупке | ❌ |
| Статусы pending/succeeded/failed/refunded | ❌ |
| Тестовый режим | ❌ |

**Демо:** `/checkout/personal-boundaries` — статичная вёрстка без backend.

**Задел:** `user_practices.access_source = 'purchase'` предусмотрен в CHECK constraint — архитектурно покупка отделена от entitlement, но pipeline не реализован.

---

## 11. Права доступа и библиотека

### Как определяется доступ к прослушиванию

1. `/listen/[slug]`: обязательная сессия.
2. Запрос `user_practices` по `practice_id` (RLS = own).
3. Проверка `expires_at` (NULL = бессрочно).
4. Signed URL только после entitlement.

### Таблица прав

**Да:** `user_practices` — отдельная от платежей (соответствует архитектурному принципу).

### Как материал попадает в библиотеку

| Источник | Механизм |
|----------|----------|
| Регистрация | `handle_new_user()` → `grant_active_starter_practices()` |
| Покупка | ❌ Не реализовано (поле `access_source='purchase'` готово) |
| Бесплатный claim | ❌ UI «скоро появится» на `/practice` |
| Admin / gift | ❌ Только через SQL (SECURITY DEFINER) |

### Ручная выдача / отзыв

- Выдача: возможна SQL-функциями / прямым INSERT service role (не в UI).
- Отзыв: `expires_at` или DELETE row — механизм в схеме есть, UI нет.

### Защита аудиофайла

| Угроза | Защита |
|--------|--------|
| Прямая ссылка без auth | ✅ Private bucket + RLS |
| Signed URL без entitlement | ✅ Выдаётся только после server check |
| TTL signed URL | 3600 с (1 час) |
| Неавторизованный доступ | ✅ Redirect на sign-in |

---

## 12. Мобильная и веб-версия

### Подход к вёрстке

**Mobile-first:** большинство страниц обёрнуты в `max-w-[430px]` (главная, каталог, профиль, библиотека, auth). `/listen` — `max-w-[480px]`. `/practice` — `max-w-[480px]`.

### Анализ по ширинам (по коду CSS, без визуального рендера)

| Ширина | Поведение |
|--------|-----------|
| **360 px** | Основной целевой viewport; колонка 100% в пределах max-width |
| **390 px** | Аналогично; BottomNav `min-w-[72px]` × 5 пунктов — помещается |
| **768 px** | Контент остаётся в узкой колонке по центру (`mx-auto`); много боковых полей |
| **1024 px** | То же — **нет расширенного desktop layout** |
| **1440 px** | То же — веб «работает», но не использует ширину экрана |

### Адаптивность

| Страница | Адаптивность | Замечания |
|----------|--------------|-----------|
| `/`, `/catalog`, `/profile`, `/my-practices` | ✅ Mobile | `pb-28` под BottomNav |
| `/listen/[slug]` | ✅ Mobile | Нет BottomNav; плеер крупный |
| `/practice/[slug]` | ✅ Mobile | Play disabled |
| `/auth/*` | ✅ Mobile | Формы full-width |
| `/author-dashboard/*` | ✅ Mobile | Демо |
| Desktop wide | ⚠️ Частично | Узкая колонка, не broken |

### Риски UX (не исправлялись)

- На широких экранах — избыточные поля (не баг, но не полноценный desktop UX).
- BottomNav `fixed` + `pb-28` — контент не перекрывается на страницах с nav.
- `/listen` без BottomNav — удобно для одной руки.
- Кнопки плеера `min-h-11` / `h-16` Play — достаточны для touch.
- Горизонтальная прокрутка: на `/my-practices` и `/favorites` есть `overflow-x-auto` для фильтров — намеренно.

---

## 13. Безопасность

| Проверка | Результат |
|----------|-----------|
| Секреты в клиентском коде | ✅ Service role не найден |
| `NEXT_PUBLIC_*` только publishable key | ✅ |
| Прямой доступ ко всем таблицам | ⚠️ RLS ограничивает; catalog использует anon key только для published |
| Серверная проверка прав на `/listen` | ✅ |
| Админ-маршруты защищены | ❌ `/author-dashboard` публичен |
| Платные материалы защищены | ✅ Storage + entitlement + signed URL |
| Изменение цены/оплаты с клиента | ✅ Нет API для этого |
| Подстановка чужого `user_id` | ✅ Не обнаружено |
| Валидация входных данных | ⚠️ Минимальная (safe next path, audio path validation на listen) |
| Опасный raw SQL из приложения | ✅ Нет — только Supabase SDK / REST |
| URL-параметры | ✅ `getSafeNextPath` фильтрует open redirect |
| Чужая библиотека / профиль | ✅ RLS |

---

## 14. Сопоставление с архитектурными принципами

| Принцип | Текущее состояние | Риск | Что потребуется |
| ------- | ----------------- | ---- | --------------- |
| 1. Цифровая личность отдельно от способа входа | **Реализовано частично** — UUID в Auth/profiles; нет `user_identities` | Средний | Таблица identities + MAX/VK/phone linking |
| 2. Авторский проект отдельно от пользователя | **Реализовано частично** — `authors` отдельно, но нет project entity | Средний | Таблица projects/brands + связь с authors |
| 3. Один пользователь → несколько проектов | **Не реализовано** | Высокий | RBAC / membership table |
| 4. Несколько пользователей → один проект | **Не реализовано** | Высокий | Team roles, invitations |
| 5. Контент отдельно от аудиофайла | **Реализовано** — `practices` + Storage path | Низкий | Сохранить при расширении |
| 6. Контент отдельно от товара | **Реализовано частично** — цена на practice, нет product SKU | Средний | Таблица products при сложном ценообразовании |
| 7. Заказ отдельно от платежа | **Не реализовано** | Высокий | orders + payments tables |
| 8. Покупка отдельно от права доступа | **Реализовано частично** — `user_practices` отделена; purchase flow нет | Средний | Purchase pipeline → grant function |
| 9. Библиотека отдельно от истории платежей | **Реализовано** — `user_practices` ≠ payments | Низкий | Таблица purchases для истории |
| 10. Прогресс прослушивания отдельно | **Не реализовано** | Средний | `playback_progress` или events |
| 11. Фиксация бизнес-событий | **Не реализовано** | Высокий | Append-only `events` table |

---

## 15. Критические риски

### Критические

1. **Отсутствие платёжного контура** — MVP-цель «купить практику» невыполнима.
2. **Нет UI-пути к плееру** из библиотеки и карточки практики — пользователь не найдёт `/listen` без прямой ссылки.

### Высокие

3. **DDL `practices` / `authors` не в репозитории** — риск потери знания о схеме.
4. **`/author-dashboard` без авторизации** — при подключении реального CRUD станет уязвимостью.
5. **Нет service role / API layer** — webhook, server events, purchase confirmation невозможны без инфраструктурных решений.
6. **Документация отстаёт** (`PROJECT_STATE.md` утверждает, что защита маршрутов не реализована — фактически реализована в `proxy.ts`).

### Средние

7. Массовый hardcode «Сергей и Зоя» в демо-UI.
8. Нет прогресса прослушивания и событий.
9. Desktop UX — узкая колонка без адаптации к широким экранам.
10. Email confirmation policy непрозрачна из кода.

### Низкие

11. Legacy mock-плеер `/player/personal-boundaries` может путать разработчиков.
12. `page.backup.tsx` в рабочей копии (untracked).
13. Нет автотестов.

---

## 16. Что нельзя менять до уточнения архитектуры

- **`profiles.id` = `auth.users.id`** — не вводить второй user identifier.
- **`user_practices` как слой entitlement** — не привязывать доступ напрямую к платежу без промежуточного grant.
- **Private Storage + signed URL** — не возвращаться к публичным audio URL для платного контента.
- **SECURITY DEFINER functions** для signup grant — менять `handle_new_user` только с migration contract checks.
- **RLS-first модель** — не открывать write-доступ клиенту к критическим таблицам.
- **Схема `access_source` CHECK** — при добавлении purchase flow расширять осознанно.

---

## 17. Рекомендуемая последовательность следующих этапов

Без детальных реализаций — только безопасный порядок:

1. **Зафиксировать схему БД** — экспорт `practices`, `authors` из Studio → `docs/DATABASE.md`.
2. **Связать UI с плеером** — кнопки Play в `/my-practices` и `/practice` → `/listen/{slug}` (минимальный diff).
3. **Спроектировать purchases** — таблицы orders/payments + grant в `user_practices` (согласование с владельцем).
4. **Подключить платёжку** — webhook API route + idempotent grant.
5. **Защитить author-dashboard** — auth + role check.
6. **Заменить демо-данные** — favorites, history, purchases по мере готовности таблиц.
7. **Events foundation** — append-only журнал для аналитики и воронок.
8. **Playback progress** — сохранение позиции (отдельная таблица или events).
9. **Communications layer** — identities, preferences, message_jobs (после MVP purchase).
10. **Desktop layout** — расширенная вёрстка для ≥1024px (после mobile MVP).

---

## Приложение A. Изученные файлы (только чтение)

```text
package.json
AGENTS.md
src/proxy.ts
src/app/layout.tsx
src/app/page.tsx
src/app/globals.css
src/app/not-found.tsx
src/app/catalog/page.tsx
src/app/my-practices/page.tsx
src/app/practice/[slug]/page.tsx
src/app/listen/[slug]/page.tsx
src/app/profile/page.tsx
src/app/profile/edit/page.tsx
src/app/profile/edit/actions.ts
src/app/settings/page.tsx
src/app/auth/sign-in/page.tsx
src/app/auth/sign-up/page.tsx
src/app/auth/sign-out/actions.ts
src/app/favorites/page.tsx
src/app/purchases/page.tsx
src/app/history/page.tsx
src/app/checkout/personal-boundaries/page.tsx
src/app/author-dashboard/page.tsx
src/app/author-dashboard/new-practice/page.tsx
src/app/player/personal-boundaries/page.tsx
src/app/authors/page.tsx
src/app/authors/sergey-and-zoya/page.tsx
src/components/audio/AudioPlayer.tsx
src/components/BottomNav.tsx
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/proxy.ts
src/lib/auth/routes.ts
supabase/migrations/20260710115506_create_user_library.sql
supabase/migrations/20260710122053_configure_starter_practices.sql
supabase/migrations/20260710123015_backfill_starter_practices.sql
supabase/migrations/20260710123518_require_zero_price_for_starter_grants.sql
supabase/migrations/20260710125301_grant_starter_practices_on_signup.sql
supabase/migrations/20260711071529_create_private_practice_audio_bucket.sql
docs/DATABASE.md
docs/ARCHITECTURE.md
docs/PROJECT_STATE.md
docs/RUNBOOK.md
docs/DECISIONS.md
docs/NEXT_STEPS.md
```

## Приложение B. Созданные / изменённые файлы

| Файл | Действие |
|------|----------|
| `AUDIOLAD_TECHNICAL_AUDIT.md` | **Создан** (этот отчёт) |
| Код приложения, миграции, зависимости | **Не изменялись** |

---

*Конец отчёта.*
