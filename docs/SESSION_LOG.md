# SESSION_LOG.md

Лог рабочих сессий проекта «АудиоЛад».

---

## Сессия — 28 августа 2026 (catalog visibility forward restamp)

**Сделано:**

- Четыре неприменённые visibility-миграции `20260830120100`–`20260830120400` убраны из `supabase/migrations/` (они были старше production `20260831120000` и давали `database_migration_history_drift`).
- Forward restamp без изменения SQL: `20260902120100`–`20260902120400`. Архив оригиналов: `deploy/migration-baseline/catalog-visibility-20260830/`.
- Planner не менялся. `20260830120000_personal_timer_promotion_copy.sql` и `20260715170000_practice_catalog_visibility_and_entitlement_access.sql` не трогались.

**Следующий шаг:** отдельный подтверждённый deploy; SQL на production не применялся из этой сессии.

---

## Сессия — 25 августа 2026 (editorial listed_at on publish)

**Сделано:**

- `PATCH /api/playlists/[id]` при публикации platform editorial пишет `listed_at = listed_at ?? published_at` (`resolveListedAtOnPublish`). User-owned publish не трогает `listed_at`.
- Unpublish не менялся: `listed_at` по-прежнему чистит триггер `playlists_clear_listed_at_when_unlisted`.
- One-shot backfill `20260825166000_editorial_playlist_listed_at_backfill.sql` для уже опубликованных platform editorial с пустым `listed_at`.
- Listing-запросы, DTO и client body не менялись.

**Следующий шаг:** применить backfill-миграцию отдельным подтверждённым deploy; live-проверка, что новый editorial publish появляется в `/playlists/catalog`.

---

## Сессия — 25 августа 2026 (playlist catalog restamp after prod 25162000)

**Сделано:**

- Повторный restamp трёх catalog-миграций: production `schema_migrations` уже содержит `20260825150000` и `20260825160000` / `20260825161000` / `20260825162000`. При сохранении тех же локальных версий planner либо abort (`database_migration_history_drift`), либо SKIP SQL (pending = local − remote).
- `git mv` только имён файлов, SQL внутри не менялся:
  `20260825163000_playlist_catalog_foundation.sql`,
  `20260825164000_playlist_topics.sql`,
  `20260825165000_playlist_catalog_popular_index.sql`.
- `listed_at` writer/backfill, app/UI/API и `deploy.sh` не менялись. SQL на базу не применялся.

**Следующий шаг:** применить три restamped миграции отдельным подтверждённым deploy.

---

## Сессия — 25 августа 2026 (playlist migrations restamp)

**Сделано:**

- Безопасный restamp трёх неприменённых playlist-миграций: они были ниже production `20260825150000_publication_gallery_slides` и ломали deploy planner (`database_migration_history_drift`).
- `git mv` только имён файлов, SQL внутри не менялся. Актуальные имена после следующего restamp:
  `20260825163000_playlist_catalog_foundation.sql`,
  `20260825164000_playlist_topics.sql`,
  `20260825165000_playlist_catalog_popular_index.sql`.
- Существующие restamp `120000` / `133000` / `150000` не трогались. Production `schema_migrations` не менялась.

**Следующий шаг:** применить три restamped миграции отдельным подтверждённым deploy.

---

## Сессия — 25 августа 2026 (PR #71 merge readiness)

**Сделано:**

- Ветка смержена с актуальным `origin/main` (без rebase history rewrite).
- Миграции PR переставлены после `20260825133000_practice_publication_class.sql`. Актуальные имена:
  `20260825163000_playlist_catalog_foundation.sql`,
  `20260825164000_playlist_topics.sql`,
  `20260825165000_playlist_catalog_popular_index.sql`.
- Содержимое SQL не менялось. Ссылки в docs/tests обновлены.
- `listed_at`: publish flow его не ставит; зафиксировано в `DECISIONS.md`, логика не добавлялась.

**Следующий шаг:** live-проверка витрины после применения миграций; отдельное решение, кто выставляет `listed_at`.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 5B)

**Сделано:**

- `GET /api/playlists/saved` — SQL-first listing из `playlist_saves` + listed public playlists.
- Cursor `createdAtMs:id`, сортировка `created_at DESC, playlist_id DESC`.
- `/playlists/saved` — private библиотека сохранённых; empty «Пока нет сохранённых плейлистов» + ссылка в каталог.
- `/playlists` получил ссылку «Сохранённые» и общий `PlaylistLibraryNav`.
- Переиспользованы `PlaylistCard`, `PlaylistGrid`, `PlaylistSaveButton`, `PlaylistPlayButton` (`public_playlist` queue).
- Unsave убирает карточку со страницы saved. Новый nav item, `library_saves` и product library не менялись.

**Следующий шаг:** только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 5A.2)

**Сделано:**

- Popular listing переведён на SQL keyset: `saves_count DESC, listed_at DESC, id DESC`.
- Cursor `savesCount:listedAtMs:id`; newest `listedAtMs:id` не менялся.
- Cursor другого sort сбрасывает на первую страницу (без lookup якоря).
- Partial index `playlists_saves_count_listed_at_idx`.
- UI, карточка, save/play, topics UX, SEO, product catalog и `saves_count` trigger не менялись.

**Следующий шаг:** только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 5A.1)

**Сделано:**

- `listListedPlaylists` переведён на SQL-first page pipeline: WHERE, q, topic EXISTS, newest keyset, `LIMIT pageSize+1`.
- Topic фильтрует через `playlist_topics!inner(topics!inner(...))`, без prefetch всех id.
- Cover, topics hydration, access и viewer.saved считаются только для строк страницы.
- `PLAYLIST_LISTING_FETCH_LIMIT` и JS search/filter/sort как источник страницы убраны.
- Popular cursor не развивался (оставлен прежний SQL-path). UI, карточка, save/play, editorial topics и product catalog не менялись.

**Следующий шаг:** только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 4B.3)

**Сделано:**

- `PlaylistCatalogTopicFilter` на `/playlists/catalog`: кнопка «Темы» / название выбранной темы, bottom sheet, single-select.
- URL `?topic=key` через `buildPlaylistCatalogHref`; поиск и сортировка сохраняют topic; «Все» снимает только topic.
- Empty state выбранной темы: «В этой теме пока нет плейлистов.»
- Список активных тем из `listActiveTopics`. Карточка, product catalog, SEO и editorial editor не менялись.

**Следующий шаг:** только по отдельному заданию. Stage 4B.4 не открывать.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 4B.2)

**Сделано:**

- `PUT /api/playlists/[id]/topics` для editorial editor через `set_playlist_topics`.
- `EditorialWorkspaceDetail.topicKeys` + `TopicSelector` в секции «Данные».
- Общий Save: PATCH metadata отдельно, PUT topics только если keys изменились.
- User-owned `/playlists/[id]`, catalog topic UI и SEO не менялись.

**Следующий шаг:** catalog topic filter UI только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 4B.1)

**Сделано:**

- Таблица `playlist_topics` + RPC `set_playlist_topics` (замена набора, active keys, max 3, дубликаты и неизвестный key — ошибка).
- Domain `src/lib/playlists/playlist-topics.ts`: ids по keys, keys по playlist, mapping keys.
- Listing `?topic=` фильтрует в SQL; плейлисты без тем остаются в общей выдаче.
- `PlaylistListingItem.topics` возвращает keys.
- UI фильтра тем, редактор, SEO `/topics` и user-owned writes не делались.

**Следующий шаг:** UI фильтра тем только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 4A)

**Сделано:**

- Поиск каталога плейлистов перенесён в SQL: `title` + `description`, без creator/topics.
- Пайплайн: SQL where `q` → order → cursor → `limit + 1`. `FETCH_LIMIT` до фильтра не используется.
- UI: `PlaylistCatalogSearch` и chips `PlaylistCatalogSort` над сеткой.
- URL-хелпер `buildPlaylistCatalogHref` в `listing-filters.ts`.
- Empty state поиска: «Ничего не нашлось».
- Topic/access/duration filters, recommendations и suggest search не делались.

**Следующий шаг:** topic/access filters только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 3B.2)

**Сделано:**

- Play в `PlaylistCard` через существующий public playlist queue.
- `catalog-playback` + `usePlaylistCatalogPlayback` + `PlaylistPlayButton`.
- `GET /api/playlists/public/[slug]` — обёртка `loadPublicPlaylistBySlug`.
- Повторный Play того же slug — pause/resume без нового GET/queue.
- Play, queue engine, product catalog и `/p` не создавались заново и не менялись.

**Следующий шаг:** фильтры topic/access только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 3B.1)

**Сделано:**

- `POST/DELETE /api/playlists/saves` через `playlist-saves-api` и существующий `playlist_saves`.
- `PlaylistSaveButton` + `usePlaylistCatalogSave`: optimistic update, rollback, guest → login.
- Гость не пишет pending save; return path `/playlists/catalog`.
- Play, queue, player, filters, `library_saves` и product catalog не менялись.

**Следующий шаг:** play/queue и фильтры topic/access только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 3A)

**Сделано:**

- Созданы `PlaylistCard` и `PlaylistGrid` в `src/components/playlists/catalog/`.
- `/playlists/catalog` рендерит сетку listing items вместо текстового списка.
- Карточка: обложка 1:1 или placeholder, title/creator/meta «N аудио · X мин», визуальные сердце и Play без действий.
- Пагинация переиспользует IntersectionObserver-паттерн product catalog, но ходит в `/api/playlists/catalog`.
- `PlaylistCatalogFilters`, save/play API и mosaic-обложка не созданы.
- Проверки: `npm run typecheck`, lint изменённых файлов, `git diff --check`, `npm run test:playlist-catalog-listing`.

**Следующий шаг:** save/play API, очередь и фильтры topic/access только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 2)

**Сделано:**

- `GET /api/playlists/catalog` и серверный loader `/playlists/catalog`.
- Listing только public + published + listed. Ответ — `PlaylistListingItem[]`.
- Поиск по title и публичному creator label. Sort: newest / popular.
- `/playlists/catalog` исключён из private routes; `/playlists` и `/playlists/[id]` не менялись.
- Зафиксированы будущие дома UI (карточка, сетка, фильтры, save/play) без реализации.

**Следующий шаг:** Stage 3 — PlaylistCard / PlaylistGrid / фильтры только по отдельному заданию.

---

## Сессия — 25 августа 2026 (каталог плейлистов, Stage 1)

**Сделано:**

- Read-only аудит catalog listing, модели playlist и library_saves.
- Контракт `PlaylistListingItem` (`class: "playlist"`), без внутренних полей.
- На существующие `playlists` добавлены `items_count`, `duration_seconds`, `saves_count`, `listed_at`.
- Отдельная модель/таблица `playlist_saves` (не `library_saves`).
- Миграция `20260825163000_playlist_catalog_foundation.sql`.
- Без страницы витрины, карточки, фильтров, play-кнопок, миграции `/playlists`.

**Следующий шаг:** Stage 2 — listing query / API `/playlists/catalog` только по отдельному заданию. Production / PM2 не менять без подтверждения.

---

## Сессия — 23 августа 2026 (MAX Mini App этап 3B)

**Сделано:**

- Клиентский state machine входа/связки внутри существующей MAX-оболочки.
- `signInWithPassword` → `POST /api/max/session/link` только после успеха.
- Без регистрации, каталога, nginx, cookie `Domain`, новой миграции.
- Юнит-тесты state machine + mocked supabase/fetch.

**Следующий шаг:** регистрация / библиотека внутри MAX только по
отдельному заданию. Production / PM2 не менять без подтверждения.

---

## Сессия — 22 августа 2026 (MAX Mini App этап 2)

**Сделано:**

- Миграция `20260822200000_external_identities.sql`: таблица + RPC
  `touch_external_identity` (RLS, revoke anon/authenticated, execute только
  service_role).
- Helper `src/lib/max/touch-external-identity.ts` через
  `createServiceRoleClient()`.
- `POST /api/max/session/verify` после HMAC вызывает touch и возвращает
  `{ ok, linked }`. HMAC fail не пишет БД.
- `verifyMaxInitData` остаётся без Supabase; `user.id` — decimal integer
  string из сырого JSON.
- Тесты: schema/SQL parse, mocked RPC, route, существующие Stage 1.
- Коммит/PR без merge. Production / PM2 / Nginx не менялись.

**Следующий шаг:** этап 3 (связка `user_id` / `linked_at`) только по
отдельному заданию. До появления связей откат = DROP FUNCTION + DROP TABLE.

---

## Сессия — 16 июля 2026 (owned playlists filter — push и production verify)

**Сделано:**

- Fix commit: `c7a3809` (`fix: filter owned playlists by user`) — `listOwnedPlaylists()` фильтрует `.eq("user_id", userId)`; smoke `scripts/playlists-owned-list-validation-smoke.mjs`.
- Push: `chore/database-baseline` → origin (`c7a3809`, `93fc9c6`).
- **Отдельный deploy `c7a3809` не выполнялся:** active release уже `20260716-074720-93fc9c6` (`93fc9c6`, включает `c7a3809`); redeploy старого commit был бы downgrade.
- Production verify: PR5 smoke PASS; disposable user B — `/playlists` без чужого public playlist; `/p/{slug}` 200, custom cover 200; signed audio в HTML нет; regression HTTP OK; validator/warning в коде сохранены.
- Migration / БД / RLS / Storage / Nginx не менялись.

**Следующий шаг:** owner UI smoke через `AUDIOLAD_SMOKE_*` при необходимости (credentials не заданы в env).

---

## Сессия — 16 июля 2026 (SEO PR1 production deploy)

**Сделано:**

- Commit SEO-PR1: `89abe1782bf7c1f8bc79bf9e3a38f63fbdd3e9fe` (`metadataBase`, `robots.txt`, `sitemap.xml`, noindex listen/auth/checkout, cover alt).
- Push: `chore/database-baseline` → origin.
- Deploy: `20260716-065224-89abe17` (previous `20260716-053853-6a692a2` / `6a692a2`).
- Production smoke PASS: robots/sitemap 200; sitemap 25 URL (9 static, 12 product, 3 author, 1 playlist); noindex listen/auth/checkout; canonical `https://audiolad.ru`; product covers public; playlist custom covers остаются signed.
- Migration не применялась; БД/RLS/Nginx/Storage не менялись.
- Первый deploy attempt упал на Playwright path; повтор с `PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright` — OK.

**Следующий шаг:** SEO-PR2 (title templates, OG, JSON-LD) или Play All — по отдельному заданию.

---

## Сессия — 16 июля 2026 (плейлисты Play All MVP — рабочая копия)

**Сделано (не commit / не deploy):**

- Этап A PR5 уже был закрыт: docs `b3f931f`, smoke helper `21af958`.
- Play All: queue types/builders, provider controller, cross-product ended/next/prev, Media Session, mini prev/next, owner+public «Слушать всё», completion UI, session API, iPhone checklist.
- Migration не требуется; entitlement/`user_practices`/progress schema не менялись.
- Production не менялся.

**Следующий шаг:** review → commit → backup → deploy → iPhone smoke → завершить этап плейлистов. Не профиль слушателя без отдельного задания.

---

## Сессия — 16 июля 2026 (плейлисты PR5 `/p/[slug]` production deploy)

**Сделано:**

- Review PR5: `cache()` loader; без `audio_url`; copy-link только при `published_at`; `/p` не private.
- Commit PR5: `5acf0343e4c2f3e5bc55a54853e546d968f73223`.
- Follow-up fix: `6a692a26785441b7f9441ea2fae865e0811dc83e` (copy-link + published_at).
- Backup: `postgres-pre-playlists-pr5-20260716-052634.dump` (migration не применялась).
- Deploy: `20260716-053853-6a692a2` (previous `20260716-053201-5acf034`; до PR5 `20260716-045024-d4b9860`).
- Production public/HTTP/SEO/UI/copy-link/freshness smoke PASS; fixtures cleanup OK.
- Push не выполнялся.
- Post-deploy docs: этот блок (не закоммичен автоматически).

**Следующий шаг:** Play All / save чужого / публичный каталог / DnD — только по отдельному заданию.

---

## Сессия — 16 июля 2026 (плейлисты PR5 `/p/[slug]` + docs PR4)

**Этап A:**

- Post-deploy docs PR4: `5225b27d9e091dbc541cd859502fd6d152beb04c`

**Этап B PR5:** см. сессию deploy выше.

---

## Сессия — 16 июля 2026 (плейлисты PR4 reorder ↑↓ deploy)

**Сделано:**

- Review: temp position → `max(position)+1` + overflow `reorder_conflict`; deadlock → 409.
- Commit PR4: `d4b9860f44a9283d26dcacb77fd5a480e2c841b3`.
- Backup: `postgres-pre-playlists-pr4-20260716-044937.dump`.
- Migration applied: `20260716140000_move_playlist_item.sql`.
- Deploy release `20260716-045024-d4b9860` (previous `20260716-042225-cbd4db1`).
- Production SQL/API/UI smoke PASS; fixtures cleanup OK.
- Push не выполнялся.
- Post-deploy docs: этот коммит.

**Следующий шаг:** `/p/[slug]` (публичная страница). Не DnD / Play All без отдельного задания.

---

## Сессия — 16 июля 2026 (плейлисты PR4 reorder ↑↓ + закрытие PR3.3 docs)

**Этап A (закоммичено, push нет):**

- Post-deploy docs PR3.3: `8301c0304621fb3d46ad1b0d8a74235a7ae80265`
- Production smoke helpers PR3.3: `4f49a8b29c810e08d1dd28d6c4cd818a8fd3f52e`

**Этап B PR4:** см. сессию deploy выше (`d4b9860`).

---

## Сессия — 16 июля 2026 (плейлисты PR3.3 covers deploy)

**Сделано:**

- Post-deploy docs PR3.2: `d79c96b`.
- Commit PR3.3: `2ae47d6`; anon EXECUTE fix: `cbd4db1`.
- Backup: `postgres-pre-playlists-pr3-3-20260716-042158.dump`.
- Migrations applied: `20260716120000_playlist_covers.sql`, `20260716121000_playlist_cover_path_cas.sql`.
- Private bucket `playlist-covers` создан; browser Storage policies отсутствуют.
- Deploy release `20260716-042225-cbd4db1` (previous `20260716-035511-fafe6a5`).
- Production SQL/API/UI smoke PASS; тестовые данные/objects очищены.
- Push не выполнялся.

**Следующий шаг:** reorder кнопками ↑↓.

---

## Сессия — 16 июля 2026 (плейлисты PR3.3 covers — commit pending deploy)

**Сделано (до deploy):**

- Security review: mosaic RPC → SECURITY DEFINER; CAS `replace_playlist_cover_path`; убран browser Storage SELECT; path validation; sharp limits.
- Migrations: `20260716120000_playlist_covers.sql`, `20260716121000_playlist_cover_path_cas.sql`.
- Test smokes PASS на `audiolad_playlists_pr3_test` + `playlist-covers-test`.

**Следующий шаг после commit:** backup → production migration/bucket → deploy → smoke.

---

## Сессия — 16 июля 2026 (плейлисты PR3.2 production deploy)

**Сделано:**

- Commit PR3.2: `fafe6a56ca5e17038777d37ef3447ddd42ecbde7`.
- Backup: `postgres-pre-playlists-pr3-2-20260716-035511.dump`.
- Deploy release `20260716-035511-fafe6a5` (previous `20260715-204408-24616e7`).
- Migration не требовалась.
- Production API/UI smoke PASS; тестовые данные очищены.
- Push не выполнялся.

**Следующий шаг:** PR3.3 — custom и automatic covers.

---

## Сессия — 16 июля 2026 (плейлисты PR3.2 detail + закрытие PR3.1 docs)

**Сделано:**

- Этап A: docs `11eb5c0`, production SQL smoke `1daa7d2`.
- PR3.2 в рабочей копии (без commit/push/deploy): `/playlists/[id]`, delete item API, кликабельные карточки списка.
- Production не менялся.

**Следующий шаг:** review → commit PR3.2 → deploy → затем reorder.

---

## Сессия — 15 июля 2026 (плейлисты PR3.1 review → deploy)

**Сделано:**

- Точечное ревью RPC: remove из public после drift; `updated_at` через `clock_timestamp()`; preflight gates/limits до mutate.
- Commit PR3.1: `24616e7e2ec5fb85211fce9a6f5dc9a413d2c09c`.
- Backup: `postgres-pre-playlists-pr3-20260715-204130.dump`.
- Migration RPC применена к production; SQL smoke PASS.
- Deploy release `20260715-204408-24616e7` (previous `20260715-200910-c470e23`).
- HTTP/API/UI smoke PASS; тестовые пользователи удалены.
- Push не выполнялся.

**Следующий шаг:** commit post-deploy docs → страница `/playlists/[id]`.

---

## Сессия — 15 июля 2026 (плейлисты PR3.1 + закрытие PR2 docs)

**Сделано:**

- Этап A: docs commit `c508080` (`docs: record playlists PR2 production deploy`); smoke helper commit `10171f3` (`test: add playlists production CRUD smoke helper`).
- PR3.1 в рабочей копии (без commit/push/deploy/prod migrate):
  - migration `20260715280000_playlist_membership_rpc.sql` (`set_practice_playlist_membership`);
  - `GET/PUT /api/playlists/membership`;
  - `AddToPlaylistSheet` + меню `···` в Аудиотеке;
  - SQL smoke на `audiolad_playlists_pr3_test`; validation smoke.
- Production не изменялся (RPC на prod отсутствует).

**Следующий шаг:** review → commit PR3.1 → apply migration на test/prod → deploy → затем `/playlists/[id]`.

---

## Сессия — 15 июля 2026 (плейлисты PR2 deploy)

**Сделано:**

- PR2 закоммичен: `c470e23`.
- Backup БД, миграция PR1 применена к production, SQL smoke PASS.
- Deploy release `20260715-200910-c470e23`; previous `20260715-190051-35f01ac`.
- API CRUD smoke + UI mobile smoke PASS; тестовые пользователи удалены.
- Пуш не выполнялся; PR3 не начат.

**Следующий шаг:** PR3 — добавление материалов из Аудиотеки.

---

## Сессия — 15 июля 2026 (плейлисты PR2)

**Сделано:**

- PR1 закоммичен отдельно (схема + RLS + docs), без push и без production migrate.
- PR2: `/playlists` на реальных данных; API create/rename/delete/visibility; modal создания; `/playlists/new` → redirect; счётчик в профиле.
- Плеер и Аудиотека не менялись; PR2 не закоммичен.

**Следующий шаг:** ревью PR2 → PR3 добавление из Аудиотеки (после применения миграции к prod по подтверждению).

---

## Сессия — 15 июля 2026 (плейлисты PR1)

**Сделано:**

- Диагностический аудит раздела «Плейлисты» (ранее в чате).
- Подготовлена миграция `supabase/migrations/20260715270000_create_playlists.sql` (таблицы, constraints, indexes, RLS private/public).
- Усилены CHECK: `playlists_visibility_slug_consistency_check`, `playlists_visibility_published_at_consistency_check`; smoke-тесты расширены.
- Smoke-тест RLS: `supabase/tests/playlists_pr1_rls_smoke.sql` на изолированной БД.
- Точечно обновлены `docs/DATABASE.md`, `DECISIONS.md`, `PROJECT_STATE.md`, `ARCHITECTURE.md`, `NEXT_STEPS.md`.
- Production БД и плеер не изменялись; коммит не создавался.
- `unlisted` зафиксирован в документации как будущее расширение, в SQL не добавлен.

**Следующий шаг:** ревью миграции → применение к production по отдельному подтверждению → PR2 CRUD UI/API.

---

## Сессия 1 — 10 июля 2026

**Участники:** Сергей (владелец), Орий / ChatGPT (архитектор), Cursor (исполнитель).

**Сделано:**

- Подключён Cursor как технический исполнитель.
- Выполнена безопасная инвентаризация проекта `/var/www/audiolad`.
- Создан и утверждён `AGENTS.md` версии 1.0.
- Создана папка `docs/` с 10 документами проекта.

**Не сделано:**

- Изменения в коде приложения.
- Коммиты.
- Задача с редиректом после регистрации.

**Следующая задача:** редирект после регистрации на `/auth/sign-in?registered=1` с сообщением об успехе.

---

## Сессия 2 — 10 июля 2026

**Участники:** Сергей (владелец), Орий / ChatGPT (архитектор), Cursor (исполнитель).

**Сделано:**

- Реализован редирект после успешной регистрации на `/auth/sign-in?registered=1`.
- Добавлено информационное сообщение на странице входа при параметре `registered=1`.
- `npm run lint` — успешно.
- `npm run build` — успешно (потребовалась обёртка `Suspense` для `useSearchParams`).
- PM2-процесс `audiolad` перезапущен с подтверждения владельца.
- Production проверен вручную: редирект, сообщение, вход и переход на `/profile` работают.
- Создан первый осознанный коммит и выполнен push в `origin/main`.
- Настроен SSH deploy key для GitHub.

**Не сделано:**

- Подключение профиля к Supabase.

**Следующая задача:** связать страницу профиля с сессией и данными Supabase.

---

## Сессия 3 — 10 июля 2026

**Участники:** Сергей (владелец), Орий / ChatGPT (архитектор), Cursor (исполнитель).

**Сделано:**

- Проведён аудит Supabase REST и таблицы `public.profiles`.
- Добавлен Nginx `location /rest/v1/` для проксирования PostgREST через Kong.
- Резервная копия Nginx-конфигурации перенесена в `/etc/nginx/backups/`.
- Подключены `/profile` и `/profile/edit` к Supabase (чтение user + profiles, сохранение `full_name` и metadata).
- `npm run lint` — успешно.
- `npm run build` — успешно.
- PM2-процесс `audiolad` перезапущен с подтверждения владельца.
- Production проверен вручную: реальное имя, email, сохранение имени и фамилии, сообщение об успешном обновлении.

**Не сделано:**

- Коммит изменений профиля и документации.
- Защита приватных маршрутов.

**Следующая задача:** добавить защиту приватных маршрутов.
