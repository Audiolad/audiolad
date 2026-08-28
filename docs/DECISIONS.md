# DECISIONS.md

Журнал архитектурных и продуктовых решений.

Формат записи: дата, решение, контекст, кто принял.

---

## 2026-08-28 — Analytics heavy RPC protection

**Контекст:** один клиент (~400–500/мин) вызывал `POST /api/analytics/session/link` и `POST /api/analytics/signup/complete` на каждом `onAuthStateChange`, включая `TOKEN_REFRESHED`. `SIGNED_IN` делал link + signup/complete, а signup RPC снова вызывал link. Тяжёлые UPDATE + `pg_advisory_xact_lock` → 55P03 → пул PostgREST (10) → PGRST003 → 504 на несвязанных RPC.

**Решение:**

- Frontend: link/signup только на реальный anonymous → authenticated переход. `TOKEN_REFRESHED` не вызывает RPC. `SIGNED_IN` канонически идёт только в signup/complete. In-flight + completed dedupe на пару session+user.
- Server: process-local rate limit (`checkAnalyticsRateLimit`), in-flight/success cache и circuit breaker **до** RPC. AbortController timeout, без `Promise.race`.
- IP cap: только trusted-proxy extraction (`getTrustedClientIp`). `104.30.175.37` — Cloudflare edge, не visitor. Не использовать raw socket / edge IP как общий cap. JWT `sub` — только non-critical discriminator, не authz.
- SQL: уже принадлежащая пользователю сессия возвращается сразу; advisory lock только если first-touch ещё нет.
- Track retry: ограниченный backoff + jitter; PGRST003/55P03/503/504 не ретраятся в tight loop.

Не менять: personal materials SAVE/activate, upload, nginx, отдельные DB pools, rollback `0bb70eca`.

**Принято:** владелец продукта (задание P0/P1 analytics RPC protection).

---

## 2026-08-25 — Editorial publish stamps listed_at

**Контекст:** `/playlists/catalog` показывает только строки с `listed_at IS NOT NULL`. Публикация редакционного плейлиста писала `visibility` + `slug` + `published_at`, поэтому новый editorial playlist появлялся в старом блоке «Плейлисты АудиоЛада» и не попадал в витрину.

**Решение:**

- При `PATCH /api/playlists/[id]` на переход в `visibility=public`, если `owner_type=platform` и `is_editorial=true`, писать `listed_at = listed_at ?? published_at` (первая постановка в витрину; republish не сдвигает newest).
- User-owned / non-editorial publish `listed_at` не трогает.
- Unpublish не пишет `listed_at`: по-прежнему чистит триггер `playlists_clear_listed_at_when_unlisted`.
- One-shot backfill `20260825166000_editorial_playlist_listed_at_backfill.sql` для уже опубликованных platform editorial с `listed_at IS NULL`. User-owned не бэкфиллить.
- Listing-запросы, DTO и client body не менять: `listed_at` по-прежнему не клиентское поле.

**Принято:** владелец продукта (задание на editorial listed_at).

---

## 2026-08-25 — Каталог плейлистов: отдельный listing-поток

**Контекст:** продуктовый каталог (`/catalog`) построен вокруг универсальной карточки продуктов (`kind`: practice / music / audio_post / program). Нужна витрина плейлистов без превращения плейлиста в новый kind продукта и без поломки личного редактора `/playlists`.

**Решение:**

- Продукты остаются `class: "product"` + `kind`.
- Плейлисты — отдельная сущность `class: "playlist"` и отдельный listing-поток.
- Карточка API: `PlaylistListingItem` (без `user_id`, `owner_type`, `created_by`, `cover_path`, `direction_id`, `playlist_items`, entitlement).
- Существующая таблица `playlists` расширяется только полями витрины: `items_count`, `duration_seconds`, `saves_count`, `listed_at`.
- Сохранения плейлистов — `playlist_saves`, отдельно от `library_saves`. Save ≠ entitlement.
- Маршрут витрины: `/playlists/catalog`. `/playlists` и `/playlists/[id]` не мигрировать.
- Stage 1: контракт + модель + миграция. Без страницы, карточки, фильтров, play-кнопок, SEO.
- Stage 2: `GET /api/playlists/catalog` + серверная `/playlists/catalog` через тот же listing-слой. В выдаче только listed public published. `/playlists/catalog` публичный; личный редактор остаётся private. UI карточки/сетки нет.
- Stage 5B: сохранённые публичные плейлисты — отдельная private библиотека `/playlists/saved` на `playlist_saves`. Не смешивать с `library_saves`, `/my-practices` и product catalog. Новый пункт нижней навигации не создавать.
- `listed_at` не выставляется publish flow. `POST/PATCH /api/playlists` (user и editorial) пишут только `visibility` + `slug` + `published_at`. Триггер `playlists_clear_listed_at_when_unlisted` только обнуляет `listed_at`. Существующие public playlists остаются unlisted. Кто ставит `listed_at` в витрину — отдельный продуктовый выбор, в Stage 1–5B не реализуется.

**Принято:** владелец проекта (задания Stage 1 и Stage 2).

---

## 2026-08-26 — Course Content Foundation, Phase 2A PR1

**Контекст:** у курса уже есть `publication_class=course`, но нет модели
содержимого и слишком широкий listen-доступ: бесплатный опубликованный
курс открывался по `canListen` / `is_free` как практика.

**Решение:**

- Модель `Course → Lesson → LessonBlock`. Section / Module нет.
  Таблицы `course_lessons`, `course_lesson_blocks`, `publication_files`,
  `course_completion_ctas`. Parent только явный `publication_class=course`.
- Доступ к содержимому: `canAccessCourseContent` рядом с
  `resolveProductAccess`. Разрешено только entitlement
  (`user_practices`, включая `free_claim` и `purchase`), author member
  или platform admin (`isPlatformAdmin` / `admin_panel.access`).
  `canListen` из-за `is_free` / `free` / `guest_promo` недостаточно.
  `reason: admin` у `resolveProductAccess` по-прежнему значит
  `access_source=admin`; helper также принимает реального platform admin.
- Listen signed audio / треки / catalog play full session для course
  требуют helper. Free-by-link других классов не меняется. Catalog
  `?preview=1` не обходит курс. Preview-окно витрины для курса — только
  если оно уже задано и это не тело урока.
- RLS без public SELECT и без learner SELECT. Bucket `publication-files`
  private. CTA независим от `promo_*`. `audio_items` не мигрируются.
- Вне scope этого PR: кабинет курса, `/learn`, learner API с payload
  урока/блока/файла, progress, homework, quizzes, drip, certificates.

**Принято:** владелец и архитектор (задание Phase 2A PR1 Course Content
Foundation).

---

## 2026-08-26 — Author Course Builder, Phase 2A PR2

**Контекст:** схема уроков/блоков уже есть, но автор не мог собирать
курс в кабинете. Публикация курса всё ещё требовала плоский
`audio_items` как у практики.

**Решение:**

- Конструктор только при явном `publication_class=course`. Список
  уроков + один открытый редактор урока. Блоки text / audio / file.
- Мутации проверяют цепочку: автор может менять публикацию, класс
  course, `lesson.publication_id`, `block.lesson_id`.
- Аудио блока — существующий `audio_items` + upload pipeline.
  PDF — `publication_files` + private `publication-files`.
- CTA только в `course_completion_ctas`.
- Новое правило публикации только если `published_at` IS NULL:
  ≥1 урок и ≥1 блок. Черновик без уроков можно сохранить.
  Плоское аудио не требуется, если у курса есть любой блок.
- Новый `publication_class=course` не создаёт пустой слот
  `audio_items` («Аудио 1»). Practice / audiobook / release / post
  без изменений. Существующие course `audio_items` не мигрируются
  и не удаляются.
- «Рекомендации перед прослушиванием» и «общая обложка для всех
  треков» скрыты у курса; у практики остаются. Audiobook не меняли.
- Mobile Course Builder: один флаг `mobileEditorOpen` — список XOR
  редактор; desktop по-прежнему list + editor рядом.

**Вне scope:** `/learn`, learner API, progress, Section/Module,
homework, quizzes, drip, certificates. PDP / CatalogCard / offer /
free_claim / purchase не менялись.

**Принято:** владелец и архитектор (задание Phase 2A PR2 Author Course
Builder).

---

## 2026-08-25 — Author Cabinet foundation, Phase 1

**Контекст:** кабинет должен создавать новые классы публикаций, не ломая
старые черновики и витрину Phase 0. Отдельные таблицы Course / Audiobook
ещё не нужны.

**Решение:**

- В `practices` добавляется nullable `publication_class` с CHECK
  `practice|course|audiobook|release|post`. Старые строки не обновляются.
- `product_kind` остаётся legacy shadow для publish RPC и старых форм.
- Create/update API принимают явный `publication_class` и ветку кабинета
  `product|music|post`.
- Мастер создания: Продукт → практика/курс/аудиокнига; Музыка → `release`;
  Аудиопост → `post`.
- Adapter читает `publication_class` раньше `product_kind`. Format не
  определяет course/audiobook. Post без offer.
- Section / Lesson / Chapter / gallery editor не входят в Phase 1.

**Принято:** владелец и архитектор (задание Phase 1 Author Cabinet).

---

## 2026-08-25 — Product Gallery, Phase 1B

**Контекст:** у `CatalogCard` уже есть `cover + gallery[]`, но слайды
некуда было сохранять. PR #74 предлагал универсальную галерею на все
классы и PATCH `{ order }` на коллекции — это откатывает Phase 1
`publication_class` и не подходит.

**Решение:**

- Одна таблица `publication_gallery_slides` (FK `practices.id`), без
  колонки класса и без backfill.
- Eligibility: только `practice` / `course` / `audiobook` через
  `isProductGalleryEligible` рядом с `resolvePublicationClass`.
  `release` / `post` (включая legacy music / audio_post) всегда
  `gallery: []` и 403 на author API.
- Cover остаётся на `practices`, не становится слайдом.
- Author API: GET/POST collection, PATCH `/reorder` батчем
  `{ slides: [{ id, position }] }`, PATCH/DELETE `[slideId]`.
  Коллекционный PATCH `{ order }` не используется.
- Кабинет: секция «Галерея продукта» только у eligible классов,
  native HTML5 drag-and-drop, без второго редактора обложки.

**Принято:** владелец и архитектор (задание Phase 1B Product Gallery).

---

## 2026-08-25 — Catalog Listing Freeze v2, Phase 0

**Контекст:** новый каталог не должен зависеть от legacy-модели
`practices` / `product_kind` / `format` / `program` / `price` / `is_free`.
Нужен READ-контракт и витрина, без SQL-миграций новых сущностей.

**Решение:**

- Frontend нового каталога читает только `CatalogCard` (`class`, `access`
  через `default_offer` / `viewer`, `summary`, `gallery`).
- Legacy adapter временно маппит `practice → practice`, `music → release`,
  `audio_post → post`. Семь аудиосессий остаются `practice`, не course.
- «Подарки» = `default_offer.access=free` + `free_claim`. «Продукты» =
  paid offer. Post не получает offer и может слушаться без grant.
- Цена в DTO только как `amount_minor` + `currency` (RUB, копейки).
- `gallery` — витрина слайдов 1:1 (до 30), не сущность контента.
- Course / Audiobook / Offer / Grant / прогресс / редактор галереи —
  не создаются в Phase 0.

**Принято:** владелец и архитектор (утверждённый Catalog Listing Freeze v2).

---

## 2026-08-23 — MAX Mini App этап 3B: вход существующего аккаунта

**Контекст:** этап 3A дал серверный `POST /link`, но без UI. Нужен вход
уже существующего аккаунта АудиоЛада внутри MAX-оболочки и явная связка.

**Решение:**

- Только существующий аккаунт: `signInWithPassword` на абсолютный apex
  Supabase URL, затем `POST /api/max/session/link` с сырым `initData`.
- Регистрации, каталога, nginx-маршрутов `/auth/v1` на max-хосте нет.
- Cookie `Domain` не меняется; сессия host-only на `max.audiolad.ru`.
- Первый link только после явного успешного пароля в этом потоке.
  Старая cookie + `linked=false` не авто-связывает.
- `linked=true` без сессии — повторный вход, не «новая связка».
- Сессия не выпускается из одного MAX id. Конфликты 409 без auto-relink.

**Принято:** владелец проекта (задание этапа 3B).

---

## 2026-08-22 — MAX Mini App этап 2: touch external_identities

**Контекст:** после серверной HMAC-проверки `initData` нужен устойчивый
внешний идентификатор MAX без создания пользователя АудиоЛада и без входа.

**Решение:**

- Таблица `public.external_identities`; запись только через SECURITY DEFINER
  RPC `touch_external_identity`, исполняемый как `service_role`.
- Этап 2: `provider='max'`, `provider_user_id` = текстовый MAX id,
  `user_id` / `linked_at` не выставляются.
- Повторный touch того же MAX id обновляет только `last_verified_at` и
  `updated_at`.
- API: `{ ok: true, linked }` только после успешного persist; 4xx HMAC без
  записи; 5xx если HMAC ок, а storage недоступен.
- Верификатор остаётся чистым (без Supabase). Не логировать PII.

**Принято:** владелец проекта (задание этапа 2).

---

## 2026-07-30 — Многопроектность кабинета автора

**Контекст:** один аккаунт должен управлять несколькими публичными авторскими брендами (проектами), без параллельной сущности.

**Решение:**

- Проект = существующая строка `authors` + доступ через `author_members` (N:M).
- Лимит owned-проектов на аккаунте: `profiles.author_project_limit_override ?? (author_premium_enabled → 3) ?? 1`.
- Создание только через RPC `create_author_project` с серверной проверкой лимита и advisory lock.
- Выбор текущего проекта: `?author=<slug>` + cookie `audiolad_author_project`.
- В UI термин «Проект»; публично — автор продукта.
- Существующие три проекта Сергея не дублировать; лимит аккаунта = 5 (override).

**Принято:** владелец проекта (единое задание после аудита).

---

## 2026-08-05 — Аудиопост и универсальная внутренняя рекомендация

**Контекст:** нужны короткие evergreen-аудиопубликации для продвижения Школы и других продуктов без отдельной платформы.

**Решение:**

- Добавить `product_kind = audio_post` на `practices` (как music), без отдельной таблицы и без `/post/...`.
- URL MVP: `/practice/{authorSlug}/{productSlug}`; публичная метка «Аудиопост».
- Аудиопост всегда бесплатный; один audio_item (publish readiness + UX, не жёсткий DB count CHECK).
- Универсальные поля `promo_*` на `practices` для ручной рекомендации «следующий шаг»; на MVP UI только у audio_post.
- Коммерческий free-product gate не считает `audio_post`.
- Unlisted (`published` + `is_catalog_listed=false`): noindex, скрыт из каталога/поиска/страницы автора/sitemap; audio_post остаётся listenable по прямой ссылке.

**Принято:** владелец проекта (по результатам диагностики и утверждённого ТЗ).

---

## 2026-07-29 — Музыка как product_kind на practices

**Контекст:** нужен MVP типа контента «Музыка» без параллельной платформы.

**Решение:**

- Переиспользовать `practices` + `audio_items`; отдельную сущность альбома не создавать.
- Добавить `product_kind` (`practice` | `music`) и `music_usage_permission` (`listen_only` | `platform_reuse_allowed`).
- Трек/альбом определять по числу `audio_items`.
- URL `/practice/...` сохранить; SEO-хабы и статьи ограничить `product_kind = practice`.
- `product_kind` неизменяем после первой публикации (`published_at`).

**Принято:** владелец проекта (по результатам технического аудита).

---

## 2026-07-05 — Self-hosted Supabase на Timeweb Cloud

**Контекст:** проекту нужна база данных и аутентификация.

**Решение:** использовать self-hosted Supabase через Docker на сервере Timeweb Cloud. Облачный supabase.com не использовать как рабочую базу.

**Принято:** владелец проекта.

---

## 2026-07-05 — Прокси сессий через proxy.ts

**Контекст:** необходимо обновление сессии Supabase на сервере.

**Решение:** реализовать через `proxy.ts` в корне проекта и `src/lib/supabase/proxy.ts` (механизм Next.js вместо `middleware.ts`).

**Принято:** архитектор.

---

## 2026-07-08 — Маршруты аутентификации /auth/sign-in и /auth/sign-up

**Контекст:** нужны страницы входа и регистрации.

**Решение:** маршруты `/auth/sign-in` и `/auth/sign-up` с клиентскими формами и браузерным Supabase-клиентом.

**Принято:** архитектор. Зафиксировано в коммитах `010f54b`, `1c1400a`.

---

## 2026-07-09 — Каталог практик из базы

**Контекст:** каталог должен показывать реальные практики.

**Решение:** `/catalog` загружает опубликованные записи из таблицы practices через Supabase REST API в server component.

**Принято:** архитектор. Зафиксировано в коммите `944c6d9`.

---

## 2026-07-10 — AGENTS.md как главная инструкция

**Контекст:** нужен единый документ для всех исполнителей (ИИ и разработчиков).

**Решение:** `AGENTS.md` в корне проекта — обязательная точка входа. Версия 1.0 утверждена.

**Принято:** владелец проекта и архитектор.

---

## 2026-07-10 — Структура документации в docs/

**Контекст:** проекту нужна постоянная документация.

**Решение:** создать папку `docs/` с 10 документами по назначению (см. `AGENTS.md`, раздел 10).

**Принято:** архитектор.

---

## 2026-07-10 — MAX как канал привлечения и точка входа

**Контекст:** «АудиоЛад» планирует привлекать пользователей через экосистему MAX — рекламу, бота, бесплатные аудиоматериалы в сообщениях и мини-приложение.

**Решение:** MAX рассматривается не только как рекламный канал, но и как потенциальная точка входа и среда использования «АудиоЛада» через бот и мини-приложение. В перспективе — автоматическое создание или вход в аккаунт через подтверждённые данные пользователя MAX.

**Статус:** зафиксировано как направление. Реализация не начата. API, таблицы и схема авторизации не определены.

**Принято:** владелец проекта и архитектор.

---

## 2026-07-15 — Пользовательские плейлисты: practice_id + private/public

**Контекст:** следующий продуктовый этап после Аудиотеки и плеера — пользовательские подборки.

**Решение:**

- В плейлист добавляется целый аудиопродукт через `practice_id` (не отдельные `audio_item_id`).
- Плейлист не предоставляет entitlement и не заменяет `user_practices` / `resolveProductAccess`.
- Сразу закладываются режимы `private` и `public`.
- Приватный плейлист видит только владелец; чужой UUID в будущем отдаёт нейтральный 404.
- Публичный плейлист (первый вариант) может содержать только бесплатные опубликованные catalog-listed продукты, доступные любому посетителю без личного entitlement.
- Публичность плейлиста не открывает платные/закрытые материалы.
- Схема и RLS — PR1 (`20260715270000_create_playlists.sql`); UI/API, публикация и Play All между продуктами — следующие PR.
- Согласованность полей: `private` всегда с `slug IS NULL` и `published_at IS NULL`; `public` обязан иметь непустой уникальный slug; у `public` `published_at` может оставаться NULL до серверной публикации.
- Содержимое публичного плейлиста схемой не проверяется; publish gate — API/RPC.
- Режим `unlisted` зарезервирован как возможное будущее расширение (доступ по ссылке без каталога); в текущей схеме и MVP не реализован.
- Мутации с проверками доступа — через API routes/RPC.
- Маршруты: `/playlists/[id]` (владелец), `/p/[slug]` (публичный просмотр).

**Принято:** владелец проекта и архитектор (по результатам диагностического аудита).

---

## 2026-07-10 — Российские способы регистрации и авторизации

**Статус:** требует юридической и технической проверки перед реализацией.

**Контекст:** сервис ориентирован в том числе на пользователей из России. Необходимо определить допустимые способы регистрации и входа с учётом законодательства и технических возможностей.

**Решение:**

- Сервис ориентирован в том числе на пользователей из России.
- Иностранные OAuth-провайдеры не должны становиться единственным или основным способом регистрации.
- Рассматриваются MAX, российский номер телефона, Яндекс ID, VK ID и другие допустимые российские способы идентификации.
- Обычная регистрация по email требует отдельной проверки с точки зрения законодательства и выбранного почтового провайдера.
- Нельзя считать простой запрет нескольких доменов полноценным юридическим решением.
- Окончательное решение принимается после изучения актуального законодательства и консультации профильного специалиста.

**Реализация:** интеграция пока не реализована. Конкретный набор способов регистрации не утверждён.

**Принято:** владелец проекта и архитектор (предварительное направление).
