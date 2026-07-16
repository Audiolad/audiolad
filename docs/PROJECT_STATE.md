# PROJECT_STATE

Описание текущего фактического состояния проекта «АудиоЛад».

Последнее обновление: 2026-07-15

## Сводный статус

| Подсистема | Статус | Комментарий |
|------------|--------|-------------|
| Инфраструктура | Работает | Production-сайт доступен; Nginx проксирует `/auth/v1/` и `/rest/v1/` |
| Аутентификация | Работает | Регистрация и вход работают, включая редирект после регистрации |
| Каталог | Работает частично | Читает опубликованные практики из Supabase |
| Профиль пользователя | Работает частично | Имя и email из Supabase; редактирование `full_name` работает; часть UI — демо |
| Кабинет автора | Демонстрационные данные | Механика загрузки и публикации не подключена |
| Покупки и платежи | Не реализовано | Будет создано позже |
| Защита приватных маршрутов | Не реализовано | Страницы доступны без проверки авторизации |
| Автотесты | Не реализовано | Тестовая инфраструктура отсутствует |

## Общая зрелость

Приложение развёрнуто на production-сервере (https://audiolad.ru). UI большинства экранов реализован. С Supabase связаны регистрация, вход, обновление сессии, каталог опубликованных практик, чтение и редактирование профиля пользователя. Остальные пользовательские и авторские экраны преимущественно используют демонстрационные данные.

## Production-среда

- Рабочий адрес: https://audiolad.ru
- Рабочая папка: `/var/www/audiolad`
- Приложение запускается через PM2, процесс `audiolad`
- Next.js слушает порт `3000`
- Nginx обслуживает домен, проксирует `/auth/v1/` и `/rest/v1/` на Supabase Kong (`127.0.0.1:8000`), остальные запросы — на Next.js
- Supabase работает на этом же сервере через Docker

## Текущее направление разработки

1. Добавить защиту приватных маршрутов.
2. Завершить оставшуюся пользовательскую механику (навигация к auth).
3. Последовательно заменять демонстрационные данные реальными.
4. После пользовательской механики перейти к полноценному кабинету автора.
5. Затем реализовать загрузку, публикацию, покупку и выдачу аудиоматериалов.

## Что уже работает

### Аутентификация

- `/auth/sign-up` — регистрация через `supabase.auth.signUp()`, поля: имя, фамилия, email, пароль.
- При регистрации создаётся пользователь в Supabase Authentication. После регистрации автоматически создаётся запись в таблице `public.profiles`.
- После успешной регистрации — редирект на `/auth/sign-in?registered=1`.
- `/auth/sign-in` — вход через `supabase.auth.signInWithPassword()`, после успеха редирект на `/profile`.
- При параметре `registered=1` на странице входа отображается сообщение об успешной регистрации.

### Профиль пользователя

- `/profile` — Server Component: `getUser()` через `src/lib/supabase/server.ts`, при отсутствии сессии — редирект на `/auth/sign-in`.
- Чтение `public.profiles` по `profiles.id = user.id`.
- Отображаются реальное имя (приоритет: `profiles.full_name` → metadata → email) и email пользователя.
- Инициал аватара вычисляется из отображаемого имени.
- При `updated=1` показывается сообщение «Профиль успешно обновлён.».
- `/profile/edit` — предзаполнение имени и фамилии из metadata / `profiles.full_name`; email только для чтения.
- Сохранение через Server Action: обновление `profiles.full_name` и `user_metadata` (`first_name`, `last_name`, `full_name`).
- Статистика, любимые авторы, настройки и прочие блоки на `/profile` — по-прежнему демонстрационные.

### Каталог

- `/catalog` — загружает опубликованные практики из базы через Supabase REST API (`status=eq.published`).

### Инфраструктура приложения

- `proxy.ts` + `src/lib/supabase/proxy.ts` — обновление сессии Supabase на каждый запрос.
- `src/lib/supabase/client.ts` — браузерный клиент (используется на auth-страницах).
- `src/lib/supabase/server.ts` — серверный клиент (используется на `/profile` и `/profile/edit`).

### UI и навигация

- Главная страница `/` с мобильным layout (max-width 430px).
- `BottomNav` — нижняя навигация: Главная, Каталог, Мои практики, Плейлисты, Профиль.
- Страница 404 (`src/app/not-found.tsx`) — создана локально, не в Git.

## Что использует демонстрационные данные

Следующие экраны содержат захардкоженные данные и не читают Supabase:

- `/profile` — статистика, любимые авторы, блоки настроек и приглашения (имя и email — реальные).
- `/profile/edit` — телефон, bio, аватар, интересы, публичность (disabled, не сохраняются).
- `/favorites`, `/history`, `/downloads`, `/purchases`.
- `/playlist/morning-energy` — демо-деталь (не для реальных данных).
- `/authors` и страницы авторов.
- `/author-dashboard` и все подстраницы кабинета автора.
- `/practice/personal-boundaries`, `/player/personal-boundaries`, `/program/inner-support`, `/checkout/personal-boundaries`.
- `/settings`.

## Плейлисты (состояние на 2026-07-16)

- PR1–PR5 на production (`6a692a2`, release `20260716-053853-6a692a2`; previous `20260716-053201-5acf034`; до PR5 был `20260716-045024-d4b9860`).
- Covers: private bucket `playlist-covers`; custom signed URL; automatic mosaic 0/1/2/3/4+; CAS replace/clear; sharp 1200×1200 WebP.
- `/playlists/[id]`: items, listen, delete item, edit cover, reorder ↑↓, copy link (только public + slug + `published_at`).
- **PR5 `/p/[slug]` развёрнут:** gate `visibility=public` + `published_at IS NOT NULL`; guest без redirect; auth read-only; RLS + server loader; service role только для signed custom cover после gate; unavailable drift остаётся в списке; metadata index/follow; `force-dynamic`.
- **Play All (рабочая копия, не production):** очередь `PlaylistQueueEntry[]` (`kind=product`); owner + public free; unavailable skip; Previous → начало предыдущего продукта; queue in-memory (F5 не восстанавливает); URL `router.replace`; completion «Плейлист прослушан»; entitlement не меняется.
- Сохранение чужих плейлистов, публичный каталог подборок, drag-and-drop — нет.
- Rollback: `/var/www/audiolad-deploy/scripts/rollback.sh`.
- Backup перед PR5: `/var/www/audiolad/backups/postgres-pre-playlists-pr5-20260716-052634.dump`.

## Что ещё не реализовано

- Drag-and-drop reorder; отдельные audio items в плейлисте; paid storefront в public queue; persistence очереди.
- Публичный каталог подборок (список); сохранение чужих плейлистов.
- Глобальная защита приватных маршрутов (частично через `src/lib/auth/routes.ts` / proxy — уточнять по коду).
- Автотесты приложения — отсутствуют (есть SQL/validation smoke для плейлистов в `supabase/tests/` и `scripts/`).

## Незакоммиченные изменения в рабочей копии

В рабочей копии есть незакоммиченные правки (профиль, брендинг, PWA-иконки, layout). Актуальный список — через `git status`.

## Технический долг

- Пустая папка `/var/www/audiolad/audiolad/` — вероятно создана случайно.
- Файл `.env.localcd` — вероятная опечатка при работе в терминале.
- Триггер `handle_new_user` не заполняет `profiles.full_name` при регистрации.

Удалять объекты и менять триггеры можно только после отдельной проверки и подтверждения владельца или архитектора.
