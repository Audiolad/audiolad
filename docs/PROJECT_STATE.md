# PROJECT_STATE

Описание текущего фактического состояния проекта «АудиоЛад».

Последнее обновление: 2026-07-15


## Аудиолад Бизнес (факт на момент A5)

- **A1** Business Domain Core: Organization → Location → Zone + membership/bootstrap.
- **A2** Player foundation: `business_players` / assignments / credentials / runtime + create/assign/heartbeat/health/rotate RPC.
- Technical Player Health derived from server heartbeat (`never_seen` / `online` / `stale` / `offline`).
- **A3** B2B Playback Attribution / **online evidence foundation** — реализовано: `usage_kind` consumer|business; canonical org/location/zone/player snapshots on existing `playback_usage_facts`; machine RPC `apply_business_playback_usage_heartbeat`; consumer analytics isolated; reassignment re-baselines media-time.
- **A4** Rights Passport v1 / Rights Grants Core — merged: `music_rightsholders`, `music_rights_grants`, `music_rights_grant_countries`; Rights Grant = legal source of truth; Passport Basic projection; A5 adds grant `ceased_at` for historical usability.
- **A5** Country Rights Profile + Location Rights Context + Rights Eligibility — реализовано (Draft): `music_country_rights_profiles` / rules; `business_location_rights_contexts` / use statuses; `resolve_business_track_eligibility` → ELIGIBLE|INELIGIBLE|CONDITIONAL|UNKNOWN (`rights_eligibility_v1`). UNKNOWN never defaults to ELIGIBLE. No production country legal seeds. No licensed boolean. No Aural/Analyzer/economics/UI.
- Business App UI по-прежнему на mock-data; к domain/Player/playback/rights/eligibility не подключён.
- **Music Passport Basic** (P1-01, в репозитории, не production-apply): таблицы `music_passport_versions` / `music_passport_attributes`; RPC `get_music_passport_basic` и `upsert_music_passport_basic` (service_role). `NO_PASSPORT` не подставляет BPM/energy/mood/genre. Это не Rights Passport и не `music_lab_*`. UI паспорта нет. Sonic DNA / Engine нет.
- Ещё не реализованы: Aural Candidate Pool wiring, full Proof of Play UX, offline/cache evidence + provenance, Qualified Usage / financial usage / billing, Player playback engine, Sonic DNA / Engine V1, Music Passport UI, Rights Ops / Music License Passport UI.
- `MERGE=NO`, `DEPLOY=NO`, `PRODUCTION_DB_APPLY=NO` в рамках A5 Draft (production DB apply не выполнялся).

## Music Analyzer Lab

Черновик `/music-analyzer` (Human Listening Validation v0.5) есть в репозитории как закрытая консоль owner/admin. Публичный пакет проверки лежит в `data/music-lab/listening-v05/`. Слепой ключ похожести в git не хранится. Публичная навигация на лабораторию не ведёт. Хаб прослушивания, похожести и BPM не снят.

Phase 2A добавляет рядом `/music-analyzer/runs`: загрузка WAV/MP3, очередь `music_analyzer_runs`, PM2-воркер на том же VPS, что и сайт. Python — чекаут `cursor/benchmark-harness-v01` @ `932c4ce`, не LLM в Next.js. Passport к этим прогонам не подключён. Production cutover этим изменением не делается: нужен явный «деплоим» и ops-bootstrap из `deploy/docs/MUSIC_ANALYZER_WORKER.md`. До этого URL `https://audiolad.ru/music-analyzer/runs` на проде ещё не открыт новой сборкой.

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

## SEO (состояние на 2026-07-16)

- **SEO PR1 на production** (`89abe17`, release `20260716-065224-89abe17`; previous `20260716-053853-6a692a2`).
- `metadataBase`, `/robots.txt`, динамический `/sitemap.xml` (catalog-listed products, authors, public published playlists).
- `noindex,follow` на `/listen/*`; `noindex,nofollow` на `/auth/*` и `/checkout/result`.
- Alt-тексты обложек на публичных страницах; product covers — public bucket URL.
- Custom playlist covers — signed URL (ограничение для OG/indexing images; отдельный PR).
- JSON-LD, OG templates, `playlists.description` — не в этом релизе.

## Плейлисты (состояние на 2026-07-16)

- PR1–PR5 на production (`6a692a2`, release `20260716-053853-6a692a2`; previous `20260716-053201-5acf034`; до PR5 был `20260716-045024-d4b9860`).
- Covers: private bucket `playlist-covers`; custom signed URL; automatic mosaic 0/1/2/3/4+; CAS replace/clear; sharp 1200×1200 WebP.
- `/playlists/[id]`: items, listen, delete item, edit cover, reorder ↑↓, copy link (только public + slug + `published_at`).
- **`/playlists` owned list (production `93fc9c6`, fix `c7a3809`):** `listOwnedPlaylists()` явно фильтрует `user_id = auth.uid()`; чужие public playlists не попадают в «Мои плейлисты»; RLS public SELECT для `/p/[slug]` без изменений.
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
