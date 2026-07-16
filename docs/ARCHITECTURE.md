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
| `/catalog` | server | Получение опубликованных практик через Supabase REST |
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
- Public slug серверный (`slugifyTitle` + random suffix); `/p/[slug]` ещё нет.
- `/playlists/new` → redirect `/playlists`.
- PR3.2 (рабочая копия): `/playlists/[id]` — items по `position`, listen через существующий route, `DELETE /api/playlists/[id]/items/[practiceId]`; недоступные items остаются видимыми.
- Reorder и Play All — ещё не реализованы.
- PR3.1 на production: commit `24616e7`, release `20260715-204408-24616e7`.

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

## Планируемая интеграция с MAX (не реализована)

В перспективе архитектура должна поддерживать вход пользователя из мини-приложения MAX. Предполагаемый поток:

```
реклама в MAX
  → бот / BotHelp
  → бесплатные аудиоматериалы
  → кнопка открытия мини-приложения
  → серверная проверка данных запуска MAX
  → поиск или создание профиля АудиоЛада
  → автоматический вход
  → библиотека пользователя
```

### Планируемая связь идентификаторов

```
MAX user_id  ↔  профиль АудиоЛада  ↔  пользователь Supabase Auth
```

Конкретные API, таблицы, эндпоинты и механизм авторизации **не определены** и **не реализованы**.

### Что нужно исследовать до проектирования

- официальный MAX Bot API;
- MAX Mini Apps;
- MAX Bridge;
- серверную валидацию initData;
- возможности интеграции BotHelp с собственной системой;
- юридические требования к регистрации и персональным данным.

## Что отсутствует в архитектуре

- `src/app/api/` — API Routes не созданы.
- Глобальная защита приватных маршрутов — не реализована (профиль проверяет сессию локально, но маршрут не защищён на уровне proxy).
- Интеграция с MAX (бот, мини-приложение, автоматический вход) — не реализована.

## Зависимости

Определяются по `package.json` и `package-lock.json`. Основные: Next.js, React, `@supabase/ssr`, `@supabase/supabase-js`, Tailwind CSS.
